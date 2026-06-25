/**
 * Shared types for achat. This module is the contract between the IRC service
 * layer, the application state, and the UI. Keep it dependency-free.
 */

/** Resolved runtime configuration (defaults + config file + CLI flags merged). */
export interface Config {
  host: string;
  port: number;
  tls: boolean;
  /** Preferred nick. For guests this may be a generated `guest-XXXX`. */
  nick: string;
  /** Registered account name for SASL PLAIN. Absent => guest connect. */
  account?: string;
  /** Account password for SASL PLAIN. Never logged, never committed. */
  password?: string;
  /** Real name / gecos. */
  realname: string;
  username: string;
  /** Channels to auto-join after registration. */
  channels: string[];
  /** Path the config was loaded from (for the /save flow), if any. */
  configPath?: string;
}

/** High-level connection lifecycle, surfaced in the status bar. */
export type ConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'registered' // connected + logged in via SASL
  | 'guest' // connected without SASL
  | 'reconnecting'
  | 'disconnected';

/** Kinds of lines that can appear in a message buffer. */
export type LineKind =
  | 'message' // a normal chat PRIVMSG
  | 'action' // /me ... (CTCP ACTION)
  | 'notice' // NOTICE
  | 'join'
  | 'part'
  | 'quit'
  | 'nick' // someone changed nick
  | 'topic'
  | 'mode'
  | 'kick'
  | 'system' // achat-generated info (connection events, command results)
  | 'error' // achat-generated error (bad command, server error)
  | 'motd'; // server MOTD / numeric noise

/** A single rendered line within a buffer (channel / query / server). */
export interface Line {
  id: number;
  kind: LineKind;
  /** Author nick for message/action/notice; undefined for system lines. */
  from?: string;
  /** The text payload. */
  text: string;
  /** ms epoch; used for the timestamp column. */
  ts: number;
  /** True if this line mentions the local user (drives mention highlight). */
  mention?: boolean;
  /** True if authored by the local user. */
  self?: boolean;
}

/** A member of a channel. */
export interface User {
  nick: string;
  /** Highest prefix: '~' '&' '@' '%' '+' or '' (none). */
  prefix: string;
}

/** A buffer is a channel, a private query, or the special server buffer. */
export type BufferType = 'channel' | 'query' | 'server';

export interface Buffer {
  /** Channel name (#foo), query nick, or '*server*'. */
  name: string;
  type: BufferType;
  lines: Line[];
  users: User[];
  topic?: string;
  /** Count of unread lines since this buffer was last active. */
  unread: number;
  /** True if any unread line mentions the local user. */
  hasMention: boolean;
  /** True once we have actually joined (channels). */
  joined: boolean;
}

/** Events emitted by the IRC service layer, consumed by app state. */
export type IrcEvent =
  | { type: 'status'; status: ConnectionStatus; detail?: string }
  | { type: 'raw'; line: string } // raw server line (debug / phase 1 log)
  | { type: 'registered'; nick: string; account?: string }
  | { type: 'motd'; text: string }
  | { type: 'message'; target: string; from: string; text: string; isAction: boolean; isNotice: boolean }
  | { type: 'self-message'; target: string; text: string; isAction: boolean }
  | { type: 'join'; channel: string; nick: string; isSelf: boolean }
  | { type: 'part'; channel: string; nick: string; isSelf: boolean; reason?: string }
  | { type: 'quit'; nick: string; reason?: string; channels: string[] }
  | { type: 'kick'; channel: string; nick: string; by: string; reason?: string; isSelf: boolean }
  | { type: 'nick'; oldNick: string; newNick: string; isSelf: boolean; channels: string[] }
  | { type: 'topic'; channel: string; topic: string; nick?: string }
  | { type: 'names'; channel: string; users: User[] }
  | { type: 'userlist-change'; channel: string; users: User[] }
  | { type: 'mode'; target: string; mode: string; by?: string }
  | { type: 'whois'; nick: string; lines: string[] }
  | { type: 'nick-in-use'; nick: string }
  | { type: 'notice'; from?: string; text: string } // server/global notice
  | { type: 'error'; text: string };

/** Listener signature for the service event stream. */
export type IrcEventHandler = (event: IrcEvent) => void;

/** The full service surface the UI depends on (IRC commands + auth helpers). */
export interface ClientService extends IrcCommands {
  register(password: string, email?: string): void;
  identify(account: string, password: string): void;
  /** Quit and remove all listeners so an abandoned service can't emit. */
  dispose(message?: string): void;
}

/** Factory the UI uses to create a service; swappable in tests. */
export type ServiceFactory = (cfg: Config, handler: IrcEventHandler) => ClientService;

/** What the UI can ask the service to do. */
export interface IrcCommands {
  connect(): void;
  disconnect(message?: string): void;
  join(channel: string): void;
  part(channel: string, reason?: string): void;
  say(target: string, text: string): void;
  action(target: string, text: string): void;
  notice(target: string, text: string): void;
  changeNick(nick: string): void;
  whois(nick: string): void;
  /** Send a raw line for power users / NickServ. */
  raw(line: string): void;
  /** Current nick (may change at runtime). */
  getNick(): string;
}
