import { Client } from 'irc-framework';
import type {
  ClientService,
  Config,
  IrcEvent,
  IrcEventHandler,
  User,
} from '../types.js';
import { hasAccount } from '../config.js';

/** mode letter -> prefix symbol, ordered highest authority first. */
const MODE_PREFIX: Array<[string, string]> = [
  ['q', '~'],
  ['a', '&'],
  ['o', '@'],
  ['h', '%'],
  ['v', '+'],
];

function modesToPrefix(modes: Iterable<string> | undefined): string {
  if (!modes) return '';
  const set = modes instanceof Set ? modes : new Set(modes);
  if (set.size === 0) return '';
  for (const [mode, symbol] of MODE_PREFIX) {
    if (set.has(mode)) return symbol;
  }
  return '';
}

/** Internal membership record: full mode set so -mode falls back correctly. */
interface MemberRec {
  nick: string;
  modes: Set<string>;
}

const PREFIX_MODE_LETTERS = new Set(['q', 'a', 'o', 'h', 'v']);

/**
 * Thin, typed wrapper around irc-framework. Owns the connection, tracks
 * per-channel membership (so QUIT/NICK can be fanned out to the right buffers),
 * and emits a single typed IrcEvent stream to its subscriber.
 */
export class IrcService implements ClientService {
  private client: Client;
  private handler: IrcEventHandler;
  private cfg: Config;
  private nick: string;
  /** channelLower -> (nickLower -> MemberRec) */
  private members = new Map<string, Map<string, MemberRec>>();
  private loggedIn = false;
  private wantedSasl = false;

  constructor(cfg: Config, handler: IrcEventHandler) {
    this.cfg = cfg;
    this.handler = handler;
    this.nick = cfg.nick;
    this.wantedSasl = hasAccount(cfg);
    this.client = new Client();
    this.wire();
  }

  private emit(event: IrcEvent): void {
    this.handler(event);
  }

  getNick(): string {
    return this.nick;
  }

  // ---- IrcCommands ----------------------------------------------------------

  connect(): void {
    this.loggedIn = false;
    this.emit({ type: 'status', status: 'connecting', detail: `${this.cfg.host}:${this.cfg.port}` });
    const options: Record<string, unknown> = {
      host: this.cfg.host,
      port: this.cfg.port,
      tls: this.cfg.tls,
      nick: this.cfg.nick,
      username: this.cfg.username,
      gecos: this.cfg.realname,
      version: 'achat',
      auto_reconnect: true,
      auto_reconnect_max_retries: 10,
      auto_reconnect_max_wait: 30000,
    };
    if (this.wantedSasl) {
      options.account = { account: this.cfg.account, password: this.cfg.password };
    }
    this.client.connect(options);
  }

  disconnect(message = 'achat'): void {
    this.client.quit(message);
  }

  /** Quit (best-effort) and detach all listeners so this abandoned service can
   * never emit into a stale handler after it's been replaced. */
  dispose(message = 'achat'): void {
    try {
      this.client.quit(message);
    } catch {
      /* ignore */
    }
    try {
      this.client.removeAllListeners();
    } catch {
      /* ignore */
    }
  }

  join(channel: string): void {
    this.client.join(channel);
  }

  part(channel: string, reason?: string): void {
    this.client.part(channel, reason);
  }

  say(target: string, text: string): void {
    this.client.say(target, text);
    this.emit({ type: 'self-message', target, text, isAction: false });
  }

  action(target: string, text: string): void {
    this.client.action(target, text);
    this.emit({ type: 'self-message', target, text, isAction: true });
  }

  notice(target: string, text: string): void {
    this.client.notice(target, text);
  }

  changeNick(nick: string): void {
    this.client.changeNick(nick);
  }

  whois(nick: string): void {
    this.client.whois(nick);
  }

  raw(line: string): void {
    this.client.rawString(line);
  }

  /** Register the current nick as a NickServ account (Ergo). The result arrives
   * as a NickServ NOTICE, surfaced through the normal notice event stream. */
  register(password: string, email?: string): void {
    const args = email && email.trim().length > 0 ? `${password} ${email}` : password;
    this.client.say('NickServ', `REGISTER ${args}`);
  }

  /** Identify to NickServ for the current session (used after registration when
   * the server doesn't auto-login, or for a manual /identify). */
  identify(account: string, password: string): void {
    this.client.say('NickServ', `IDENTIFY ${account} ${password}`);
  }

  /** Test-only: abruptly destroy the underlying socket to simulate a network
   * drop, which triggers irc-framework's auto-reconnect. */
  __debugDropSocket(): void {
    const conn = (this.client as unknown as { connection?: { transport?: { socket?: { destroy?: () => void } } } })
      .connection;
    conn?.transport?.socket?.destroy?.();
  }

  // ---- membership helpers ---------------------------------------------------

  private chanKey(channel: string): string {
    return channel.toLowerCase();
  }

  private isSelf(nick: string): boolean {
    return nick.toLowerCase() === this.nick.toLowerCase();
  }

  /** original-case channel names, keyed by lowercased channel. */
  private chanNames = new Map<string, string>();

  private channelsForNick(nick: string): string[] {
    const n = nick.toLowerCase();
    const out: string[] = [];
    for (const [key, map] of this.members) {
      if (map.has(n)) out.push(this.chanNames.get(key) ?? key);
    }
    return out;
  }

  private sortedUsers(channel: string): User[] {
    const map = this.members.get(this.chanKey(channel));
    if (!map) return [];
    const order = '~&@%+';
    const users: User[] = [...map.values()].map((m) => ({
      nick: m.nick,
      prefix: modesToPrefix(m.modes),
    }));
    return users.sort((a, b) => {
      const ra = a.prefix ? order.indexOf(a.prefix) : 99;
      const rb = b.prefix ? order.indexOf(b.prefix) : 99;
      if (ra !== rb) return ra - rb;
      return a.nick.toLowerCase().localeCompare(b.nick.toLowerCase());
    });
  }

  private emitUserlist(channel: string): void {
    this.emit({ type: 'userlist-change', channel, users: this.sortedUsers(channel) });
  }

  // ---- event wiring ---------------------------------------------------------

  private wire(): void {
    const c = this.client;

    c.on('raw', (event: { line?: string; from_server?: boolean }) => {
      if (event?.line) this.emit({ type: 'raw', line: event.line });
    });

    c.on('socket connected', () => {
      this.emit({ type: 'status', status: 'connecting', detail: 'socket connected, registering…' });
    });

    c.on('reconnecting', (event: { attempt?: number; max_retries?: number }) => {
      const detail = event?.attempt ? `attempt ${event.attempt}` : undefined;
      this.emit({ type: 'status', status: 'reconnecting', detail });
    });

    c.on('socket close', () => {
      this.emit({ type: 'status', status: 'disconnected' });
    });

    c.on('close', () => {
      this.emit({ type: 'status', status: 'disconnected' });
    });

    c.on('loggedin', (event: { account?: string }) => {
      this.loggedIn = true;
      if (event?.account) this.emit({ type: 'notice', text: `Logged in as ${event.account}` });
    });

    c.on('sasl failed', (event: { reason?: string }) => {
      this.emit({ type: 'error', text: `SASL authentication failed${event?.reason ? `: ${event.reason}` : ''}. Continuing as guest.` });
    });

    c.on('registered', (event: { nick?: string; account?: string }) => {
      if (event?.nick) this.nick = event.nick;
      // Reset membership on (re)registration; server will resend NAMES on rejoin.
      this.members.clear();
      this.chanNames.clear();
      const registered = this.wantedSasl && this.loggedIn;
      this.emit({ type: 'registered', nick: this.nick, account: registered ? this.cfg.account : undefined });
      this.emit({
        type: 'status',
        status: registered ? 'registered' : 'guest',
        detail: registered ? `as ${this.cfg.account}` : 'unregistered',
      });
    });

    c.on('nick in use', (event: { nick?: string }) => {
      this.emit({ type: 'nick-in-use', nick: event?.nick ?? this.nick });
    });

    c.on('motd', (event: { motd?: string }) => {
      if (event?.motd) this.emit({ type: 'motd', text: event.motd });
    });

    c.on('privmsg', (event: PrivmsgEvent) => {
      if (event.from_server || !event.nick) return;
      const target = this.resolveTarget(event.target, event.nick);
      this.emit({
        type: 'message',
        target,
        from: event.nick,
        text: event.message,
        isAction: false,
        isNotice: false,
      });
    });

    c.on('action', (event: PrivmsgEvent) => {
      if (event.from_server || !event.nick) return;
      const target = this.resolveTarget(event.target, event.nick);
      this.emit({
        type: 'message',
        target,
        from: event.nick,
        text: event.message,
        isAction: true,
        isNotice: false,
      });
    });

    c.on('notice', (event: PrivmsgEvent) => {
      // Server notices (no nick) go to the server buffer.
      if (event.from_server || !event.nick) {
        this.emit({ type: 'notice', from: event.nick, text: event.message });
        return;
      }
      const target = this.resolveTarget(event.target, event.nick);
      this.emit({
        type: 'message',
        target,
        from: event.nick,
        text: event.message,
        isAction: false,
        isNotice: true,
      });
    });

    c.on('userlist', (event: { channel: string; users: Array<{ nick: string; modes?: string[] }> }) => {
      const key = this.chanKey(event.channel);
      this.chanNames.set(key, event.channel);
      const map = new Map<string, MemberRec>();
      for (const u of event.users) {
        map.set(u.nick.toLowerCase(), { nick: u.nick, modes: new Set(u.modes ?? []) });
      }
      this.members.set(key, map);
      this.emit({ type: 'names', channel: event.channel, users: this.sortedUsers(event.channel) });
    });

    c.on('join', (event: JoinEvent) => {
      const key = this.chanKey(event.channel);
      this.chanNames.set(key, event.channel);
      if (!this.members.has(key)) this.members.set(key, new Map());
      this.members.get(key)!.set(event.nick.toLowerCase(), { nick: event.nick, modes: new Set() });
      this.emit({ type: 'join', channel: event.channel, nick: event.nick, isSelf: this.isSelf(event.nick) });
      this.emitUserlist(event.channel);
    });

    c.on('part', (event: PartEvent) => {
      const map = this.members.get(this.chanKey(event.channel));
      map?.delete(event.nick.toLowerCase());
      this.emit({
        type: 'part',
        channel: event.channel,
        nick: event.nick,
        isSelf: this.isSelf(event.nick),
        reason: event.message,
      });
      this.emitUserlist(event.channel);
    });

    c.on('kick', (event: KickEvent) => {
      const map = this.members.get(this.chanKey(event.channel));
      map?.delete(event.kicked.toLowerCase());
      this.emit({
        type: 'kick',
        channel: event.channel,
        nick: event.kicked,
        by: event.nick,
        reason: event.message,
        isSelf: this.isSelf(event.kicked),
      });
      this.emitUserlist(event.channel);
    });

    c.on('quit', (event: QuitEvent) => {
      const channels = this.channelsForNick(event.nick);
      for (const ch of channels) {
        this.members.get(this.chanKey(ch))?.delete(event.nick.toLowerCase());
      }
      this.emit({ type: 'quit', nick: event.nick, reason: event.message, channels });
      for (const ch of channels) this.emitUserlist(ch);
    });

    c.on('nick', (event: NickEvent) => {
      const isSelf = this.isSelf(event.nick);
      if (isSelf) this.nick = event.new_nick;
      const channels = this.channelsForNick(event.nick);
      for (const ch of channels) {
        const map = this.members.get(this.chanKey(ch));
        const old = map?.get(event.nick.toLowerCase());
        if (map && old) {
          map.delete(event.nick.toLowerCase());
          map.set(event.new_nick.toLowerCase(), { nick: event.new_nick, modes: old.modes });
        }
      }
      this.emit({ type: 'nick', oldNick: event.nick, newNick: event.new_nick, isSelf, channels });
      for (const ch of channels) this.emitUserlist(ch);
    });

    c.on('topic', (event: { channel: string; topic: string; nick?: string }) => {
      this.emit({ type: 'topic', channel: event.channel, topic: event.topic, nick: event.nick });
    });

    c.on(
      'mode',
      (event: {
        target: string;
        nick?: string;
        raw_modes?: string;
        modes?: Array<{ mode: string; param?: string | null }>;
      }) => {
        const desc = typeof event.raw_modes === 'string' ? event.raw_modes : '';
        // Apply user prefix-mode changes (+o/-o/+v/…) to membership in real time.
        const map = this.members.get(this.chanKey(event.target));
        if (map && Array.isArray(event.modes)) {
          let changed = false;
          for (const m of event.modes) {
            const add = m.mode.startsWith('+');
            const letter = m.mode.replace(/^[+-]/, '');
            if (PREFIX_MODE_LETTERS.has(letter) && m.param) {
              const rec = map.get(m.param.toLowerCase());
              if (rec) {
                if (add) rec.modes.add(letter);
                else rec.modes.delete(letter);
                changed = true;
              }
            }
          }
          if (changed) this.emitUserlist(event.target);
        }
        this.emit({ type: 'mode', target: event.target, mode: desc, by: event.nick });
      },
    );

    c.on('whois', (event: WhoisEvent) => {
      this.emit({ type: 'whois', nick: event.nick, lines: formatWhois(event) });
    });

    c.on('error', (event: { error?: string; reason?: string; message?: string }) => {
      const text = event?.reason || event?.error || event?.message || 'unknown error';
      this.emit({ type: 'error', text: String(text) });
    });
  }

  /** For a PRIVMSG, the buffer it belongs to: a channel target stays as-is; a
   * message sent directly to us belongs to the sender's query buffer. */
  private resolveTarget(target: string, from: string): string {
    if (target.toLowerCase() === this.nick.toLowerCase()) return from;
    return target;
  }
}

// ---- loose payload shapes from irc-framework -------------------------------

interface PrivmsgEvent {
  nick?: string;
  target: string;
  message: string;
  from_server?: boolean;
}
interface JoinEvent {
  nick: string;
  channel: string;
}
interface PartEvent {
  nick: string;
  channel: string;
  message?: string;
}
interface KickEvent {
  kicked: string;
  nick: string;
  channel: string;
  message?: string;
}
interface QuitEvent {
  nick: string;
  message?: string;
}
interface NickEvent {
  nick: string;
  new_nick: string;
}
interface WhoisEvent {
  nick: string;
  user?: string;
  hostname?: string;
  real_name?: string;
  account?: string;
  server?: string;
  channels?: string;
  idle?: number;
  away?: string;
  [key: string]: unknown;
}

function formatWhois(e: WhoisEvent): string[] {
  const lines: string[] = [];
  if (e.user || e.hostname) lines.push(`${e.nick} is ${e.user ?? '?'}@${e.hostname ?? '?'}`);
  if (e.real_name) lines.push(`  realname: ${e.real_name}`);
  if (e.account) lines.push(`  account: ${e.account}`);
  if (e.server) lines.push(`  server: ${e.server}`);
  if (e.channels) lines.push(`  channels: ${e.channels}`);
  if (typeof e.idle === 'number') lines.push(`  idle: ${e.idle}s`);
  if (e.away) lines.push(`  away: ${e.away}`);
  if (lines.length === 0) lines.push(`${e.nick}: no whois info`);
  return lines;
}
