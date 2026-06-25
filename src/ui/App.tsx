import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import type { Config, IrcEvent, ServiceFactory } from '../types.js';
import { hasAccount, saveConfig } from '../config.js';
import { IrcService } from '../irc/service.js';
import { Chooser, LoginForm, RegisterForm, type ChooserChoice } from './auth/AuthScreens.js';

export interface AppProps {
  config: Config;
  /** Set false in tests to avoid opening a real socket. */
  autoConnect?: boolean;
  /** Service factory; defaults to the real IrcService. Injectable for tests. */
  createService?: ServiceFactory;
}

const defaultFactory: ServiceFactory = (cfg, handler) => new IrcService(cfg, handler);

interface LogLine {
  id: number;
  text: string;
  color?: string;
  dim?: boolean;
}

type Phase = 'choosing' | 'login' | 'register' | 'main';
type AuthIntent = 'guest' | 'login' | 'register';

const SUCCESS_RE = /(registered|created|now logged in|successfully|verification)/i;
const FAILURE_RE = /(error|already|exists|denied|invalid|insufficient|cannot|failed)/i;

export function App({
  config,
  autoConnect = true,
  createService = defaultFactory,
}: AppProps): React.ReactElement {
  const { stdout } = useStdout();

  const [phase, setPhase] = useState<Phase>(() => (hasAccount(config) ? 'main' : 'choosing'));
  const [cfg, setCfg] = useState<Config>(config);
  const [lines, setLines] = useState<LogLine[]>([]);
  const [status, setStatus] = useState<string>('idle');
  const [nick, setNick] = useState<string>(config.nick);
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [formBusy, setFormBusy] = useState(false);
  const [saveHint, setSaveHint] = useState(false);

  const idRef = useRef(0);
  const serviceRef = useRef<ReturnType<ServiceFactory> | null>(null);
  const intentRef = useRef<AuthIntent>('guest');
  const registerRef = useRef<{ password: string; email: string } | null>(null);

  const push = useCallback((text: string, opts: { color?: string; dim?: boolean } = {}) => {
    setLines((prev) => {
      const next = [...prev, { id: idRef.current++, text, ...opts }];
      return next.length > 1000 ? next.slice(next.length - 1000) : next;
    });
  }, []);

  const onEvent = useCallback(
    (event: IrcEvent) => {
      switch (event.type) {
        case 'raw':
          push(event.line, { dim: true });
          break;
        case 'status':
          setStatus(event.detail ? `${event.status} — ${event.detail}` : event.status);
          push(`* ${event.status}${event.detail ? ` (${event.detail})` : ''}`, { color: 'yellow' });
          if (event.status === 'guest' && intentRef.current === 'login') {
            push('SASL did not log you in — connected as guest. Check account/password.', { color: 'red' });
          }
          break;
        case 'registered':
          setNick(event.nick);
          if (event.account) {
            push(`✓ Logged in as ${event.account} (registered)`, { color: 'green' });
            setSaveHint(true);
          } else {
            push(`Connected as guest: ${event.nick} (unregistered)`, { color: 'yellow' });
          }
          // Kick off NickServ registration once we're on the server.
          if (intentRef.current === 'register' && registerRef.current) {
            const { password, email } = registerRef.current;
            push('Sending registration to NickServ…', { color: 'cyan' });
            serviceRef.current?.register(password, email);
          }
          break;
        case 'notice':
          push(`-${event.from ?? 'server'}- ${event.text}`, { color: 'cyan' });
          if (intentRef.current === 'register' && /nickserv/i.test(event.from ?? '')) {
            handleRegisterNotice(event.text);
          }
          break;
        case 'motd':
          for (const l of event.text.split('\n')) push(l, { dim: true });
          break;
        case 'message': {
          const prefix = event.isNotice ? `-${event.from}-` : `<${event.from}>`;
          push(`${prefix} (${event.target}) ${event.text}`, event.isNotice ? { color: 'cyan' } : {});
          // NickServ replies arrive as NOTICEs from a nick (routed here, not as
          // type:'notice'); feed them to the registration detector.
          if (intentRef.current === 'register' && /nickserv/i.test(event.from)) {
            handleRegisterNotice(event.text);
          }
          break;
        }
        case 'join':
          push(`→ ${event.nick} joined ${event.channel}`, { color: 'green' });
          break;
        case 'part':
          push(`← ${event.nick} left ${event.channel}`, { color: 'magenta' });
          break;
        case 'quit':
          push(`← ${event.nick} quit (${event.reason ?? ''})`, { color: 'magenta' });
          break;
        case 'error':
          push(`!! ${event.text}`, { color: 'red' });
          break;
        default:
          break;
      }
    },
    [push],
  );

  const handleRegisterNotice = useCallback(
    (text: string) => {
      if (SUCCESS_RE.test(text) && !FAILURE_RE.test(text)) {
        const account = serviceRef.current?.getNick() ?? cfg.nick;
        const password = registerRef.current?.password ?? cfg.password;
        setCfg((c) => ({ ...c, account, password }));
        setSaveHint(true);
        intentRef.current = 'login'; // we are now effectively authenticated
        registerRef.current = null;
        push(`✓ Account "${account}" registered. Press Ctrl-S to save it for SASL next launch.`, {
          color: 'green',
        });
      } else if (FAILURE_RE.test(text)) {
        push('Registration failed (see NickServ message above). Still connected as guest.', {
          color: 'red',
        });
        registerRef.current = null;
      }
    },
    [cfg.nick, cfg.password, push],
  );

  const startConnection = useCallback(
    (next: Config, intent: AuthIntent) => {
      intentRef.current = intent;
      setCfg(next);
      setPhase('main');
      setFormBusy(false);
      setFormError(undefined);
      // Tear down any prior service.
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

  // Initial auto-connect when an account is already configured.
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

  // Main-view global keys (save credentials).
  useInput(
    (input, key) => {
      if (key.ctrl && input === 's') {
        if (hasAccount(cfg)) {
          try {
            const path = saveConfig(cfg);
            setSaveHint(false);
            push(`✓ Saved config to ${path}`, { color: 'green' });
          } catch (err) {
            push(`!! Could not save config: ${(err as Error).message}`, { color: 'red' });
          }
        } else {
          push('Nothing to save — no account credentials in this session.', { color: 'yellow' });
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

  if (phase === 'choosing') {
    return <Chooser host={config.host} onChoose={onChoose} />;
  }
  if (phase === 'login') {
    return (
      <LoginForm
        initialAccount={config.account ?? config.nick}
        onSubmit={onLogin}
        onCancel={() => setPhase('choosing')}
        error={formError}
        busy={formBusy}
      />
    );
  }
  if (phase === 'register') {
    return (
      <RegisterForm
        initialNick={config.nick}
        onSubmit={onRegister}
        onCancel={() => setPhase('choosing')}
        error={formError}
        busy={formBusy}
      />
    );
  }

  // main view (raw log for now; replaced by the 3-pane layout in later phases)
  const rows = stdout?.rows ?? 24;
  const visible = Math.max(5, rows - 5);
  const shown = lines.slice(Math.max(0, lines.length - visible));
  const authLabel = hasAccount(cfg) ? `registered:${cfg.account}` : 'guest';

  return (
    <Box flexDirection="column" height={rows}>
      <Box borderStyle="round" borderColor="green" paddingX={1} flexShrink={0}>
        <Text color="green" bold>
          achat{' '}
        </Text>
        <Text dimColor>
          {cfg.host}:{cfg.port} · {nick} · {authLabel} · {status}
        </Text>
      </Box>
      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        {shown.map((l) => (
          <Text key={l.id} color={l.color} dimColor={l.dim} wrap="truncate-end">
            {l.text}
          </Text>
        ))}
      </Box>
      <Box flexShrink={0} paddingX={1}>
        <Text dimColor>
          Phase 2 · {saveHint ? 'Ctrl-S save credentials · ' : ''}Ctrl-C quit
        </Text>
      </Box>
    </Box>
  );
}
