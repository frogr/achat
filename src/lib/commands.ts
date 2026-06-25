/**
 * Slash-command registry. Pure-ish: a command's `run` receives a context with
 * the IRC service, the reducer dispatch, current state, and app-level actions.
 * Reused by the command palette (Phase 7).
 */
import type { Action, AppState } from '../state/appState.js';
import { activeBuffer, SERVER_BUFFER } from '../state/appState.js';
import type { ClientService } from '../types.js';

export interface CommandActions {
  quit: (msg?: string) => void;
  save: () => void;
  register: (password: string, email?: string) => void;
  connect: () => void;
  setTimestamps: (v: boolean) => void;
}

export interface CommandContext {
  state: AppState;
  service: ClientService;
  dispatch: (a: Action) => void;
  actions: CommandActions;
}

export interface CommandSpec {
  name: string;
  aliases?: string[];
  usage: string;
  help: string;
  run: (args: string[], rest: string, ctx: CommandContext) => void;
}

function note(ctx: CommandContext, text: string, target?: string): void {
  ctx.dispatch({ type: 'localLine', target: target ?? activeBuffer(ctx.state).name, kind: 'system', text });
}
function err(ctx: CommandContext, text: string): void {
  ctx.dispatch({ type: 'localLine', target: activeBuffer(ctx.state).name, kind: 'error', text });
}
function activeTarget(ctx: CommandContext): string {
  return activeBuffer(ctx.state).name;
}

export const COMMANDS: CommandSpec[] = [
  {
    name: 'join',
    aliases: ['j'],
    usage: '/join #channel [key]',
    help: 'Join a channel',
    run: (args, _rest, ctx) => {
      const chan = args[0];
      if (!chan) return err(ctx, 'Usage: /join #channel');
      const name = chan.startsWith('#') || chan.startsWith('&') ? chan : `#${chan}`;
      ctx.service.join(name);
      ctx.dispatch({ type: 'openBuffer', name, btype: 'channel', activate: true });
    },
  },
  {
    name: 'part',
    aliases: ['leave'],
    usage: '/part [#channel] [reason]',
    help: 'Leave a channel (default: the current one)',
    run: (args, rest, ctx) => {
      let chan = activeTarget(ctx);
      let reason = rest;
      if (args[0]?.startsWith('#') || args[0]?.startsWith('&')) {
        chan = args[0];
        reason = rest.slice(args[0].length).trim();
      }
      if (chan === SERVER_BUFFER) return err(ctx, 'Not in a channel');
      ctx.service.part(chan, reason || undefined);
    },
  },
  {
    name: 'msg',
    aliases: ['m'],
    usage: '/msg <nick|#channel> <text>',
    help: 'Send a private message or message to a channel',
    run: (args, rest, ctx) => {
      const target = args[0];
      if (!target) return err(ctx, 'Usage: /msg <nick> <text>');
      const text = rest.slice(target.length).trim();
      if (!text) return err(ctx, 'Usage: /msg <nick> <text>');
      ctx.service.say(target, text);
      if (!target.startsWith('#') && !target.startsWith('&')) {
        ctx.dispatch({ type: 'openBuffer', name: target, btype: 'query', activate: true });
      }
    },
  },
  {
    name: 'query',
    aliases: ['q'],
    usage: '/query <nick>',
    help: 'Open a private message buffer with a user',
    run: (args, _rest, ctx) => {
      const nick = args[0];
      if (!nick) return err(ctx, 'Usage: /query <nick>');
      ctx.dispatch({ type: 'openBuffer', name: nick, btype: 'query', activate: true });
    },
  },
  {
    name: 'nick',
    usage: '/nick <newnick>',
    help: 'Change your nick',
    run: (args, _rest, ctx) => {
      const nick = args[0];
      if (!nick) return err(ctx, 'Usage: /nick <newnick>');
      ctx.service.changeNick(nick);
    },
  },
  {
    name: 'me',
    usage: '/me <action>',
    help: 'Send an action (emote)',
    run: (_args, rest, ctx) => {
      const target = activeTarget(ctx);
      if (target === SERVER_BUFFER) return err(ctx, 'Not in a channel');
      if (!rest) return err(ctx, 'Usage: /me <action>');
      ctx.service.action(target, rest);
    },
  },
  {
    name: 'whois',
    aliases: ['w'],
    usage: '/whois <nick>',
    help: 'Look up a user',
    run: (args, _rest, ctx) => {
      const nick = args[0];
      if (!nick) return err(ctx, 'Usage: /whois <nick>');
      ctx.service.whois(nick);
    },
  },
  {
    name: 'register',
    usage: '/register <password> [email]',
    help: 'Register your current nick as an account (NickServ)',
    run: (args, _rest, ctx) => {
      const password = args[0];
      if (!password) return err(ctx, 'Usage: /register <password> [email]');
      ctx.actions.register(password, args[1]);
      note(ctx, 'Registration request sent to NickServ…');
    },
  },
  {
    name: 'identify',
    usage: '/identify <account> <password>',
    help: 'Identify to NickServ for this session',
    run: (args, _rest, ctx) => {
      if (!args[0] || !args[1]) return err(ctx, 'Usage: /identify <account> <password>');
      ctx.service.identify(args[0], args[1]);
      note(ctx, 'Identify sent to NickServ…');
    },
  },
  {
    name: 'topic',
    usage: '/topic <text>',
    help: 'Set the channel topic',
    run: (_args, rest, ctx) => {
      const target = activeTarget(ctx);
      if (target === SERVER_BUFFER) return err(ctx, 'Not in a channel');
      ctx.service.raw(`TOPIC ${target} :${rest}`);
    },
  },
  {
    name: 'close',
    usage: '/close',
    help: 'Close the current buffer (parts a channel)',
    run: (_args, _rest, ctx) => {
      const buf = activeBuffer(ctx.state);
      if (buf.type === 'server') return err(ctx, 'Cannot close the server buffer');
      if (buf.type === 'channel' && buf.joined) ctx.service.part(buf.name);
      ctx.dispatch({ type: 'closeBuffer', name: buf.name });
    },
  },
  {
    name: 'save',
    usage: '/save',
    help: 'Save account credentials to the config file',
    run: (_args, _rest, ctx) => ctx.actions.save(),
  },
  {
    name: 'timestamps',
    usage: '/timestamps on|off',
    help: 'Toggle message timestamps',
    run: (args, _rest, ctx) => {
      const v = args[0]?.toLowerCase();
      ctx.actions.setTimestamps(v !== 'off');
      note(ctx, `Timestamps ${v !== 'off' ? 'on' : 'off'}`);
    },
  },
  {
    name: 'connect',
    aliases: ['reconnect'],
    usage: '/connect',
    help: 'Reconnect to the server',
    run: (_args, _rest, ctx) => ctx.actions.connect(),
  },
  {
    name: 'quit',
    aliases: ['exit'],
    usage: '/quit [message]',
    help: 'Disconnect and exit achat',
    run: (_args, rest, ctx) => ctx.actions.quit(rest || undefined),
  },
  {
    name: 'help',
    aliases: ['h', '?'],
    usage: '/help',
    help: 'List commands',
    run: (_args, _rest, ctx) => {
      note(ctx, 'Commands:');
      for (const c of COMMANDS) {
        note(ctx, `  ${c.usage}  —  ${c.help}`);
      }
      note(ctx, 'Plain text sends to the active channel. // sends a literal leading slash.');
    },
  },
];

const BY_NAME = new Map<string, CommandSpec>();
for (const c of COMMANDS) {
  BY_NAME.set(c.name, c);
  for (const a of c.aliases ?? []) BY_NAME.set(a, c);
}

export function findCommand(name: string): CommandSpec | undefined {
  return BY_NAME.get(name.toLowerCase());
}

/**
 * Parse and run a slash-command line (must start with '/'). Handles the `//`
 * escape for a literal leading slash by returning the text to send instead.
 * Returns { send } when the line should be sent as a normal message.
 */
export function runCommand(line: string, ctx: CommandContext): { send?: string } {
  if (line.startsWith('//')) return { send: line.slice(1) };
  if (!line.startsWith('/')) return { send: line };
  const body = line.slice(1);
  const spaceIdx = body.indexOf(' ');
  const name = (spaceIdx === -1 ? body : body.slice(0, spaceIdx)).toLowerCase();
  const rest = spaceIdx === -1 ? '' : body.slice(spaceIdx + 1);
  const args = rest.length > 0 ? rest.split(/\s+/) : [];
  const cmd = findCommand(name);
  if (!cmd) {
    err(ctx, `Unknown command: /${name} (try /help)`);
    return {};
  }
  cmd.run(args, rest, ctx);
  return {};
}
