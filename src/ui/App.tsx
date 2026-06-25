import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useInput } from 'ink';
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
  const [phase, setPhase] = useState<Phase>(() => (hasAccount(config) ? 'main' : 'choosing'));
  const [state, dispatch] = useReducer(
    reducer,
    undefined,
    () =>
      initialState({ nick: config.nick, account: config.account, host: config.host, port: config.port }),
  );
  const [inputValue, setInputValue] = useState('');
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [formBusy] = useState(false);
  const [saveHint, setSaveHint] = useState(false);

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

  const onInputSubmit = useCallback(
    (raw: string) => {
      const text = raw.trim();
      setInputValue('');
      if (!text) return;
      const buf = activeBuffer(state);
      if (text.startsWith('/')) {
        // full slash-command support arrives in Phase 6
        d({ target: buf.name, type: 'localLine', kind: 'error', text: `Commands arrive in Phase 6: ${text}` });
        return;
      }
      if (buf.type === 'server') {
        d({ target: SERVER_BUFFER, type: 'localLine', kind: 'error', text: 'Join a channel first (no active conversation).' });
        return;
      }
      serviceRef.current?.say(buf.name, text);
    },
    [state, d],
  );

  // ---- main-view global keys ------------------------------------------------

  useInput(
    (input, key) => {
      if (key.ctrl && input === 's') {
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
      }
    },
    { isActive: phase === 'main' },
  );

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

  const hint = saveHint
    ? 'Ctrl-S save credentials · Tab/1-2-3 focus · Enter send · PgUp/PgDn scroll · Ctrl-C quit'
    : undefined;

  return (
    <ClientView
      state={state}
      inputValue={inputValue}
      onInputChange={setInputValue}
      onInputSubmit={onInputSubmit}
      hint={hint}
    />
  );
}
