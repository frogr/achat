import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useApp, useInput } from 'ink';
import type { Config, IrcEvent, ServiceFactory } from '../types.js';
import { hasAccount, saveConfig } from '../config.js';
import { IrcService } from '../irc/service.js';
import {
  reducer,
  initialState,
  activeBuffer,
  SERVER_BUFFER,
  type Action,
} from '../state/appState.js';
import { runCommand, COMMANDS, type CommandActions } from '../lib/commands.js';
import { CommandPalette, type PaletteItem } from './CommandPalette.js';
import { ClientView } from './ClientView.js';
import { Chooser, LoginForm, RegisterForm, type ChooserChoice } from './auth/AuthScreens.js';

export interface AppProps {
  config: Config;
  /** Set false in tests to avoid opening a real socket. */
  autoConnect?: boolean;
  /** Service factory; defaults to the real IrcService. Injectable for tests. */
  createService?: ServiceFactory;
}

const defaultFactory: ServiceFactory = (cfg, handler) => new IrcService(cfg, handler);

type Phase = 'choosing' | 'login' | 'register' | 'main';
type AuthIntent = 'guest' | 'login' | 'register';

const SUCCESS_RE = /(registered|created|now logged in|successfully|verification)/i;
const FAILURE_RE = /(error|already|exists|denied|invalid|insufficient|cannot|failed)/i;

export function App({
  config,
  autoConnect = true,
  createService = defaultFactory,
}: AppProps): React.ReactElement {
  const { exit } = useApp();
  const [phase, setPhase] = useState<Phase>(() => (hasAccount(config) ? 'main' : 'choosing'));
  const [state, dispatch] = useReducer(
    reducer,
    undefined,
    () =>
      initialState({ nick: config.nick, account: config.account, host: config.host, port: config.port }),
  );
  const [inputValue, setInputValue] = useState('');
  const [cursor, setCursor] = useState(0);
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [formBusy] = useState(false);
  const [saveHint, setSaveHint] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const serviceRef = useRef<ReturnType<ServiceFactory> | null>(null);
  const intentRef = useRef<AuthIntent>('guest');
  const registerRef = useRef<{ password: string; email: string } | null>(null);
  const cfgRef = useRef<Config>(config);
  const credsRef = useRef<{ account?: string; password?: string }>({
    account: config.account,
    password: config.password,
  });

  const d = useCallback((a: Action) => dispatch(a), []);

  const handleRegisterNotice = useCallback(
    (text: string) => {
      if (SUCCESS_RE.test(text) && !FAILURE_RE.test(text)) {
        const account = serviceRef.current?.getNick() ?? cfgRef.current.nick;
        const password = registerRef.current?.password;
        credsRef.current = { account, password };
        setSaveHint(true);
        intentRef.current = 'login';
        registerRef.current = null;
        d({
          target: SERVER_BUFFER,
          type: 'localLine',
          kind: 'system',
          text: `✓ Account "${account}" registered. Press Ctrl-S to save it for SASL next launch.`,
        });
      } else if (FAILURE_RE.test(text)) {
        d({
          target: SERVER_BUFFER,
          type: 'localLine',
          kind: 'error',
          text: 'Registration failed (see NickServ message above). Still connected as guest.',
        });
        registerRef.current = null;
      }
    },
    [d],
  );

  const onEvent = useCallback(
    (event: IrcEvent) => {
      // 1) fold into UI state
      d({ type: 'irc', event });

      // 2) side-effects (auth + auto-join)
      switch (event.type) {
        case 'registered': {
          if (event.account) {
            credsRef.current = { account: event.account, password: cfgRef.current.password };
            setSaveHint(true);
          }
          // auto-join configured channels (also covers rejoin on reconnect)
          for (const ch of cfgRef.current.channels) serviceRef.current?.join(ch);
          // kick off NickServ registration if that was the intent
          if (intentRef.current === 'register' && registerRef.current) {
            const { password, email } = registerRef.current;
            serviceRef.current?.register(password, email);
          }
          break;
        }
        case 'status':
          if (event.status === 'guest' && intentRef.current === 'login') {
            d({
              target: SERVER_BUFFER,
              type: 'localLine',
              kind: 'error',
              text: 'SASL did not log you in — connected as guest. Check account/password.',
            });
          }
          break;
        case 'message':
          if (intentRef.current === 'register' && /nickserv/i.test(event.from)) {
            handleRegisterNotice(event.text);
          }
          break;
        default:
          break;
      }
    },
    [d, handleRegisterNotice],
  );

  const startConnection = useCallback(
    (next: Config, intent: AuthIntent) => {
      intentRef.current = intent;
      cfgRef.current = next;
      credsRef.current = { account: next.account, password: next.password };
      setPhase('main');
      setFormError(undefined);
      try {
        serviceRef.current?.disconnect('reconnecting');
      } catch {
        /* ignore */
      }
      const service = createService(next, onEvent);
      serviceRef.current = service;
      service.connect();
    },
    [onEvent, createService],
  );

  useEffect(() => {
    if (!autoConnect) return;
    if (hasAccount(config)) startConnection(config, 'login');
    return () => {
      try {
        serviceRef.current?.disconnect('achat closing');
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- input handling -------------------------------------------------------

  const clearInput = useCallback(() => {
    setInputValue('');
    setCursor(0);
  }, []);

  const saveCreds = useCallback(() => {
    const creds = credsRef.current;
    if (creds.account && creds.password) {
      try {
        const path = saveConfig({ ...cfgRef.current, ...creds });
        setSaveHint(false);
        d({ target: SERVER_BUFFER, type: 'localLine', kind: 'system', text: `✓ Saved config to ${path}` });
      } catch (err) {
        d({ target: SERVER_BUFFER, type: 'localLine', kind: 'error', text: `Could not save: ${(err as Error).message}` });
      }
    } else {
      d({ target: SERVER_BUFFER, type: 'localLine', kind: 'system', text: 'Nothing to save — no credentials this session.' });
    }
  }, [d]);

  const reconnect = useCallback(() => {
    d({ target: SERVER_BUFFER, type: 'localLine', kind: 'system', text: 'Reconnecting…' });
    serviceRef.current?.connect();
  }, [d]);

  const actions: CommandActions = useMemo(
    () => ({
      quit: (msg) => {
        try {
          serviceRef.current?.disconnect(msg ?? 'achat');
        } catch {
          /* ignore */
        }
        exit();
      },
      save: saveCreds,
      register: (password, email = '') => {
        intentRef.current = 'register';
        registerRef.current = { password, email };
        serviceRef.current?.register(password, email || undefined);
      },
      connect: reconnect,
      setTimestamps: (v) => d({ type: 'setShowTimestamps', value: v }),
    }),
    [exit, saveCreds, reconnect, d],
  );

  const sendPlain = useCallback(
    (text: string) => {
      const buf = activeBuffer(state);
      if (buf.type === 'server') {
        d({ target: SERVER_BUFFER, type: 'localLine', kind: 'error', text: 'Join a channel first (no active conversation).' });
        return;
      }
      serviceRef.current?.say(buf.name, text);
    },
    [state, d],
  );

  const submit = useCallback(
    (raw: string) => {
      const text = raw.trim();
      clearInput();
      d({ type: 'scrollToLatest' });
      if (!text) return;
      if (text.startsWith('/')) {
        if (!serviceRef.current) {
          d({ target: activeBuffer(state).name, type: 'localLine', kind: 'error', text: 'Not connected.' });
          return;
        }
        const res = runCommand(text, { state, service: serviceRef.current, dispatch: d, actions });
        if (res.send !== undefined) sendPlain(res.send);
        return;
      }
      sendPlain(text);
    },
    [state, d, clearInput, actions, sendPlain],
  );

  const openQueryForSelectedUser = useCallback(() => {
    const buf = activeBuffer(state);
    const u = buf.users[state.userIndex];
    if (!u) return;
    d({ type: 'openBuffer', name: u.nick, btype: 'query', activate: true });
    serviceRef.current?.whois(u.nick);
    d({ type: 'setFocus', focus: 'messages' });
  }, [state, d]);

  // ---- single global key handler (no conflict between typing & navigation) --

  const PAGE = 10;
  useInput(
    (input, key) => {
      // global keys, any focus
      if (key.ctrl && input === 'k') return setPaletteOpen(true);
      if (key.ctrl && input === 's') return saveCreds();
      if (key.tab) return d({ type: 'cycleFocus', dir: key.shift ? -1 : 1 });
      if (key.escape) {
        d({ type: 'setFocus', focus: 'messages' });
        return d({ type: 'scrollToLatest' });
      }
      if (key.pageUp) return d({ type: 'scroll', delta: PAGE });
      if (key.pageDown) return d({ type: 'scroll', delta: -PAGE });

      const focus = state.focus;

      // navigation mode: a side panel is focused, input is inert
      if (focus === 'channels' || focus === 'users') {
        if (key.upArrow || input === 'k') return d({ type: 'moveSelection', dir: -1 });
        if (key.downArrow || input === 'j') return d({ type: 'moveSelection', dir: 1 });
        if (input === '1') return d({ type: 'setFocus', focus: 'channels' });
        if (input === '2') return d({ type: 'setFocus', focus: 'messages' });
        if (input === '3') return d({ type: 'setFocus', focus: 'users' });
        if (key.return) {
          if (focus === 'channels') return d({ type: 'activateSelection' });
          return openQueryForSelectedUser();
        }
        return; // swallow everything else while navigating
      }

      // typing mode: the input line is focused
      if (key.return) return submit(inputValue);
      if (key.leftArrow) return setCursor((c) => Math.max(0, c - 1));
      if (key.rightArrow) return setCursor((c) => Math.min(inputValue.length, c + 1));
      if (key.upArrow) return d({ type: 'scroll', delta: 1 });
      if (key.downArrow) return d({ type: 'scroll', delta: -1 });
      if (key.backspace || key.delete) {
        if (cursor > 0) {
          setInputValue(inputValue.slice(0, cursor - 1) + inputValue.slice(cursor));
          setCursor(cursor - 1);
        }
        return;
      }
      // digits jump panels only when the input is empty (documented rule)
      if (inputValue.length === 0 && !key.ctrl && !key.meta && (input === '1' || input === '3')) {
        return d({ type: 'setFocus', focus: input === '1' ? 'channels' : 'users' });
      }
      // printable insert
      if (input && !key.ctrl && !key.meta) {
        setInputValue(inputValue.slice(0, cursor) + input + inputValue.slice(cursor));
        setCursor(cursor + input.length);
      }
    },
    { isActive: phase === 'main' && !paletteOpen },
  );

  const paletteItems: PaletteItem[] = useMemo(() => {
    const items: PaletteItem[] = [];
    for (const b of state.buffers) {
      const name = b.name === SERVER_BUFFER ? '*server*' : b.name;
      items.push({
        id: `go:${b.name}`,
        label: `Go to ${name}`,
        hint: b.type,
        run: () => d({ type: 'setActive', name: b.name }),
      });
    }
    for (const c of COMMANDS) {
      items.push({
        id: `cmd:${c.name}`,
        label: `/${c.name}`,
        hint: c.help,
        run: () => {
          if (c.usage.includes('<')) {
            setInputValue(`/${c.name} `);
            setCursor(c.name.length + 2);
            d({ type: 'setFocus', focus: 'messages' });
          } else {
            submit(`/${c.name}`);
          }
        },
      });
    }
    return items;
  }, [state.buffers, d, submit]);

  // ---- auth screen handlers -------------------------------------------------

  const onChoose = (choice: ChooserChoice) => {
    if (choice === 'guest') startConnection({ ...config, account: undefined, password: undefined }, 'guest');
    else if (choice === 'login') setPhase('login');
    else setPhase('register');
  };

  const onLogin = (account: string, password: string) => {
    startConnection({ ...config, account, password, nick: account }, 'login');
  };

  const onRegister = (rNick: string, password: string, email: string) => {
    registerRef.current = { password, email };
    startConnection({ ...config, nick: rNick, account: undefined, password: undefined }, 'register');
  };

  // ---- render ---------------------------------------------------------------

  if (phase === 'choosing') return <Chooser host={config.host} onChoose={onChoose} />;
  if (phase === 'login')
    return (
      <LoginForm
        initialAccount={config.account ?? config.nick}
        onSubmit={onLogin}
        onCancel={() => setPhase('choosing')}
        error={formError}
        busy={formBusy}
      />
    );
  if (phase === 'register')
    return (
      <RegisterForm
        initialNick={config.nick}
        onSubmit={onRegister}
        onCancel={() => setPhase('choosing')}
        error={formError}
        busy={formBusy}
      />
    );

  if (paletteOpen) {
    return <CommandPalette items={paletteItems} onClose={() => setPaletteOpen(false)} />;
  }

  const hint = saveHint
    ? 'Ctrl-S save credentials · Tab/1-3 focus · Enter send · PgUp/PgDn scroll · Ctrl-K palette · Ctrl-C quit'
    : undefined;

  return <ClientView state={state} inputValue={inputValue} inputCursor={cursor} hint={hint} />;
}
