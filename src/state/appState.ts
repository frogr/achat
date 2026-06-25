/**
 * Central application state + reducer for achat. Pure and Ink-free so it can be
 * unit-tested without a terminal or a server. `applyEvent` folds the typed
 * IrcEvent stream into buffers; the UI dispatches navigation actions.
 */
import type {
  Buffer,
  BufferType,
  ConnectionStatus,
  IrcEvent,
  Line,
  LineKind,
  User,
} from '../types.js';

export const SERVER_BUFFER = '*server*';

export type Focus = 'channels' | 'messages' | 'users';

export interface AppState {
  status: ConnectionStatus;
  statusDetail?: string;
  nick: string;
  account?: string;
  host: string;
  port: number;
  buffers: Buffer[];
  /** name of the active buffer */
  active: string;
  focus: Focus;
  /** selection index within the channels panel (index into buffers) */
  channelIndex: number;
  /** selection index within the users panel */
  userIndex: number;
  /** lines scrolled up from the bottom; 0 == pinned to latest */
  scroll: number;
  showTimestamps: boolean;
  nextLineId: number;
}

export type Action =
  | { type: 'irc'; event: IrcEvent }
  | { type: 'setActive'; name: string }
  | { type: 'setFocus'; focus: Focus }
  | { type: 'cycleFocus'; dir: 1 | -1 }
  | { type: 'moveSelection'; dir: 1 | -1 }
  | { type: 'activateSelection' }
  | { type: 'scroll'; delta: number }
  | { type: 'scrollToLatest' }
  | { type: 'openBuffer'; name: string; btype: BufferType; activate?: boolean }
  | { type: 'closeBuffer'; name: string }
  | { type: 'localLine'; target: string; kind: LineKind; text: string; from?: string }
  | { type: 'setShowTimestamps'; value: boolean };

export function initialState(opts: {
  nick: string;
  account?: string;
  host: string;
  port: number;
}): AppState {
  return {
    status: 'idle',
    nick: opts.nick,
    account: opts.account,
    host: opts.host,
    port: opts.port,
    buffers: [serverBuffer()],
    active: SERVER_BUFFER,
    focus: 'messages',
    channelIndex: 0,
    userIndex: 0,
    scroll: 0,
    showTimestamps: true,
    nextLineId: 1,
  };
}

function serverBuffer(): Buffer {
  return {
    name: SERVER_BUFFER,
    type: 'server',
    lines: [],
    users: [],
    unread: 0,
    hasMention: false,
    joined: true,
  };
}

function emptyBuffer(name: string, type: BufferType): Buffer {
  return { name, type, lines: [], users: [], unread: 0, hasMention: false, joined: false };
}

// ---- selectors --------------------------------------------------------------

export function activeBuffer(state: AppState): Buffer {
  return state.buffers.find((b) => b.name === state.active) ?? state.buffers[0]!;
}

export function findBuffer(state: AppState, name: string): Buffer | undefined {
  const lower = name.toLowerCase();
  return state.buffers.find((b) => b.name.toLowerCase() === lower);
}

export function bufferIndex(state: AppState, name: string): number {
  const lower = name.toLowerCase();
  return state.buffers.findIndex((b) => b.name.toLowerCase() === lower);
}

// ---- reducer ----------------------------------------------------------------

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'irc':
      return applyEvent(state, action.event);

    case 'setActive': {
      const idx = bufferIndex(state, action.name);
      if (idx < 0) return state;
      return clearUnread({ ...state, active: state.buffers[idx]!.name, channelIndex: idx, userIndex: 0, scroll: 0 });
    }

    case 'setFocus':
      return { ...state, focus: action.focus };

    case 'cycleFocus': {
      const order: Focus[] = ['channels', 'messages', 'users'];
      const i = order.indexOf(state.focus);
      const next = order[(i + action.dir + order.length) % order.length]!;
      return { ...state, focus: next };
    }

    case 'moveSelection': {
      if (state.focus === 'channels') {
        const n = state.buffers.length;
        if (n === 0) return state;
        const channelIndex = clamp(state.channelIndex + action.dir, 0, n - 1);
        return { ...state, channelIndex };
      }
      if (state.focus === 'users') {
        const n = activeBuffer(state).users.length;
        if (n === 0) return state;
        const userIndex = clamp(state.userIndex + action.dir, 0, n - 1);
        return { ...state, userIndex };
      }
      // messages focus: arrows scroll the scrollback
      return scrollBy(state, action.dir === -1 ? 1 : -1);
    }

    case 'activateSelection': {
      if (state.focus === 'channels') {
        const target = state.buffers[state.channelIndex];
        if (!target) return state;
        return clearUnread({ ...state, active: target.name, userIndex: 0, scroll: 0 });
      }
      // users panel activation is handled by the UI (opens a query) via openBuffer
      return state;
    }

    case 'scroll':
      return scrollBy(state, action.delta);

    case 'scrollToLatest':
      return { ...state, scroll: 0 };

    case 'openBuffer': {
      let next = state;
      if (!findBuffer(state, action.name)) {
        next = { ...state, buffers: [...state.buffers, emptyBuffer(action.name, action.btype)] };
      }
      if (action.activate) {
        const idx = bufferIndex(next, action.name);
        next = clearUnread({ ...next, active: next.buffers[idx]!.name, channelIndex: idx, userIndex: 0, scroll: 0 });
      }
      return next;
    }

    case 'closeBuffer': {
      const idx = bufferIndex(state, action.name);
      if (idx < 0 || state.buffers[idx]!.type === 'server') return state;
      const buffers = state.buffers.filter((_, i) => i !== idx);
      let active = state.active;
      let channelIndex = state.channelIndex;
      if (state.active.toLowerCase() === action.name.toLowerCase()) {
        const newIdx = clamp(idx - 1, 0, buffers.length - 1);
        active = buffers[newIdx]!.name;
        channelIndex = newIdx;
      } else {
        channelIndex = clamp(bufferIndex({ ...state, buffers } as AppState, active), 0, buffers.length - 1);
      }
      return { ...state, buffers, active, channelIndex };
    }

    case 'localLine':
      return addLine(state, action.target, { kind: action.kind, text: action.text, from: action.from });

    case 'setShowTimestamps':
      return { ...state, showTimestamps: action.value };

    default:
      return state;
  }
}

// ---- event folding ----------------------------------------------------------

export function applyEvent(state: AppState, event: IrcEvent): AppState {
  switch (event.type) {
    case 'status':
      return { ...state, status: event.status, statusDetail: event.detail };

    case 'raw':
      return state; // raw lines aren't shown in the paneled UI

    case 'registered': {
      const withNick = { ...state, nick: event.nick, account: event.account };
      const msg = event.account
        ? `Logged in as ${event.account} (registered)`
        : `Connected as guest: ${event.nick}`;
      return addLine(withNick, SERVER_BUFFER, { kind: 'system', text: msg });
    }

    case 'motd':
      return event.text
        .split('\n')
        .reduce((s, l) => addLine(s, SERVER_BUFFER, { kind: 'motd', text: l }), state);

    case 'notice':
      return addLine(state, SERVER_BUFFER, {
        kind: 'notice',
        text: event.text,
        from: event.from,
      });

    case 'message': {
      const kind: LineKind = event.isAction ? 'action' : event.isNotice ? 'notice' : 'message';
      const mention = mentions(event.text, state.nick);
      return addLine(state, event.target, { kind, from: event.from, text: event.text, mention }, { ensure: 'channel-or-query' });
    }

    case 'self-message':
      return addLine(
        state,
        event.target,
        {
          kind: event.isAction ? 'action' : 'message',
          from: state.nick,
          text: event.text,
          self: true,
        },
        { ensure: 'channel-or-query' },
      );

    case 'join': {
      let s = ensureBuffer(state, event.channel, 'channel');
      s = setJoined(s, event.channel, event.isSelf ? true : undefined);
      s = addLine(s, event.channel, { kind: 'join', text: `${event.nick} has joined ${event.channel}`, from: event.nick });
      if (event.isSelf) {
        const idx = bufferIndex(s, event.channel);
        s = clearUnread({ ...s, active: s.buffers[idx]!.name, channelIndex: idx, userIndex: 0, scroll: 0 });
      }
      return s;
    }

    case 'part': {
      let s = addLine(state, event.channel, {
        kind: 'part',
        from: event.nick,
        text: `${event.nick} has left ${event.channel}${event.reason ? ` (${event.reason})` : ''}`,
      });
      if (event.isSelf) s = setJoined(s, event.channel, false);
      return s;
    }

    case 'quit':
      return event.channels.reduce(
        (s, ch) => addLine(s, ch, { kind: 'quit', from: event.nick, text: `${event.nick} has quit${event.reason ? ` (${event.reason})` : ''}` }),
        state,
      );

    case 'kick': {
      let s = addLine(state, event.channel, {
        kind: 'kick',
        text: `${event.nick} was kicked by ${event.by}${event.reason ? ` (${event.reason})` : ''}`,
      });
      if (event.isSelf) s = setJoined(s, event.channel, false);
      return s;
    }

    case 'nick': {
      let s = state;
      if (event.isSelf) s = { ...s, nick: event.newNick };
      s = event.channels.reduce(
        (acc, ch) => addLine(acc, ch, { kind: 'nick', text: `${event.oldNick} is now known as ${event.newNick}` }),
        s,
      );
      // rename an open query buffer if present (and keep `active` pointing at it)
      const q = findBuffer(s, event.oldNick);
      if (q && q.type === 'query') {
        const wasActive = q.name.toLowerCase() === s.active.toLowerCase();
        s = {
          ...s,
          buffers: s.buffers.map((b) => (b === q ? { ...b, name: event.newNick } : b)),
          active: wasActive ? event.newNick : s.active,
        };
      }
      return s;
    }

    case 'topic': {
      let s = ensureBuffer(state, event.channel, 'channel');
      s = {
        ...s,
        buffers: s.buffers.map((b) =>
          b.name.toLowerCase() === event.channel.toLowerCase() ? { ...b, topic: event.topic } : b,
        ),
      };
      return addLine(s, event.channel, {
        kind: 'topic',
        text: event.nick ? `${event.nick} set topic: ${event.topic}` : `Topic: ${event.topic}`,
      });
    }

    case 'names':
    case 'userlist-change': {
      const s = ensureBuffer(state, event.channel, 'channel');
      return {
        ...s,
        buffers: s.buffers.map((b) =>
          b.name.toLowerCase() === event.channel.toLowerCase() ? { ...b, users: event.users } : b,
        ),
      };
    }

    case 'mode':
      return addLine(state, event.target, {
        kind: 'mode',
        text: `mode ${event.mode}${event.by ? ` by ${event.by}` : ''}`,
      });

    case 'whois':
      return event.lines.reduce((s, l) => addLine(s, state.active, { kind: 'system', text: l }), state);

    case 'nick-in-use':
      return addLine(state, SERVER_BUFFER, { kind: 'error', text: `Nick ${event.nick} is already in use` });

    case 'error':
      return addLine(state, state.active, { kind: 'error', text: event.text });

    default:
      return state;
  }
}

// ---- helpers ----------------------------------------------------------------

interface PartialLine {
  kind: LineKind;
  text: string;
  from?: string;
  mention?: boolean;
  self?: boolean;
}

function addLine(
  state: AppState,
  target: string,
  partial: PartialLine,
  opts: { ensure?: 'channel-or-query' } = {},
): AppState {
  let s = state;
  let bufName = target;
  if (!findBuffer(s, target)) {
    if (opts.ensure === 'channel-or-query') {
      const btype: BufferType = target.startsWith('#') || target.startsWith('&') ? 'channel' : 'query';
      s = ensureBuffer(s, target, btype);
    } else if (target === SERVER_BUFFER) {
      // server buffer always exists
    } else {
      // default unknown targets to the server buffer
      bufName = SERVER_BUFFER;
    }
  }
  const id = s.nextLineId;
  const line: Line = {
    id,
    kind: partial.kind,
    text: partial.text,
    ts: Date.now(),
    ...(partial.from !== undefined ? { from: partial.from } : {}),
    ...(partial.mention ? { mention: true } : {}),
    ...(partial.self ? { self: true } : {}),
  };
  const isActive = bufName.toLowerCase() === s.active.toLowerCase();
  const buffers = s.buffers.map((b) => {
    if (b.name.toLowerCase() !== bufName.toLowerCase()) return b;
    return {
      ...b,
      lines: capLines([...b.lines, line]),
      unread: isActive ? b.unread : b.unread + (countsAsUnread(partial.kind) ? 1 : 0),
      hasMention: isActive ? b.hasMention : b.hasMention || Boolean(partial.mention),
    };
  });
  // if user is pinned to bottom (scroll 0) keep them there; if scrolled up, keep offset
  const scroll = isActive && s.scroll > 0 ? s.scroll + 1 : s.scroll;
  return { ...s, buffers, nextLineId: id + 1, scroll };
}

function countsAsUnread(kind: LineKind): boolean {
  return kind === 'message' || kind === 'action' || kind === 'notice';
}

function ensureBuffer(state: AppState, name: string, type: BufferType): AppState {
  if (findBuffer(state, name)) return state;
  return { ...state, buffers: [...state.buffers, emptyBuffer(name, type)] };
}

function setJoined(state: AppState, name: string, joined?: boolean): AppState {
  if (joined === undefined) return state;
  return {
    ...state,
    buffers: state.buffers.map((b) =>
      b.name.toLowerCase() === name.toLowerCase() ? { ...b, joined } : b,
    ),
  };
}

function clearUnread(state: AppState): AppState {
  return {
    ...state,
    buffers: state.buffers.map((b) =>
      b.name.toLowerCase() === state.active.toLowerCase()
        ? { ...b, unread: 0, hasMention: false }
        : b,
    ),
  };
}

function scrollBy(state: AppState, delta: number): AppState {
  const buf = activeBuffer(state);
  const max = Math.max(0, buf.lines.length - 1);
  return { ...state, scroll: clamp(state.scroll + delta, 0, max) };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

const MAX_LINES = 2000;
function capLines(lines: Line[]): Line[] {
  return lines.length > MAX_LINES ? lines.slice(lines.length - MAX_LINES) : lines;
}

/** True if `text` mentions `nick` as a word (case-insensitive). */
export function mentions(text: string, nick: string): boolean {
  if (!nick) return false;
  const re = new RegExp(`(^|[^\\w])${escapeRegExp(nick)}([^\\w]|$)`, 'i');
  return re.test(text);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Users sorted for display (kept here so the UI stays dumb). */
export function displayUsers(buffer: Buffer): User[] {
  return buffer.users;
}
