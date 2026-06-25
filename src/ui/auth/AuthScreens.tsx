import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';

const ACCENT = 'green';

function Frame({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1}>
      <Box flexDirection="column" borderStyle="round" borderColor={ACCENT} paddingX={2} paddingY={1} width={56}>
        <Box marginBottom={1}>
          <Text color={ACCENT} bold>
            achat
          </Text>
          <Text dimColor> · {title}</Text>
        </Box>
        {children}
      </Box>
    </Box>
  );
}

export type ChooserChoice = 'guest' | 'login' | 'register';

const CHOICES: Array<{ key: ChooserChoice; label: string; hint: string }> = [
  { key: 'login', label: 'Log in with an account', hint: 'SASL with a registered account' },
  { key: 'register', label: 'Register a new account', hint: 'create one on the server now' },
  { key: 'guest', label: 'Continue as guest', hint: 'unregistered, read & chat on open channels' },
];

export function Chooser({
  host,
  onChoose,
}: {
  host: string;
  onChoose: (c: ChooserChoice) => void;
}): React.ReactElement {
  const [index, setIndex] = useState(0);

  useInput((input, key) => {
    if (key.upArrow || input === 'k') setIndex((i) => (i - 1 + CHOICES.length) % CHOICES.length);
    else if (key.downArrow || input === 'j') setIndex((i) => (i + 1) % CHOICES.length);
    else if (input === '1') onChoose(CHOICES[0]!.key);
    else if (input === '2') onChoose(CHOICES[1]!.key);
    else if (input === '3') onChoose(CHOICES[2]!.key);
    else if (key.return) onChoose(CHOICES[index]!.key);
  });

  return (
    <Frame title={`connect to ${host}`}>
      <Text dimColor>How would you like to connect?</Text>
      <Box flexDirection="column" marginTop={1}>
        {CHOICES.map((c, i) => {
          const active = i === index;
          return (
            <Text key={c.key} color={active ? ACCENT : undefined} bold={active}>
              {active ? '❯ ' : '  '}
              {i + 1}. {c.label}
            </Text>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text dimColor wrap="truncate-end">
          {CHOICES[index]!.hint}
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>↑/↓ or 1-3 to choose · Enter to confirm · Ctrl-C to quit</Text>
      </Box>
    </Frame>
  );
}

interface Field {
  key: string;
  label: string;
  mask?: boolean;
  optional?: boolean;
}

function FormBody({
  title,
  subtitle,
  fields,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  error,
  busy,
}: {
  title: string;
  subtitle: string;
  fields: Field[];
  initial: Record<string, string>;
  submitLabel: string;
  onSubmit: (values: Record<string, string>) => void;
  onCancel: () => void;
  error?: string;
  busy?: boolean;
}): React.ReactElement {
  const [values, setValues] = useState<Record<string, string>>(() => ({ ...initial }));
  const [active, setActive] = useState(0);

  useInput((_input, key) => {
    if (key.escape) onCancel();
    else if (key.tab && key.shift) setActive((i) => (i - 1 + fields.length) % fields.length);
    else if (key.tab) setActive((i) => (i + 1) % fields.length);
    else if (key.upArrow) setActive((i) => (i - 1 + fields.length) % fields.length);
    else if (key.downArrow) setActive((i) => (i + 1) % fields.length);
  });

  const setVal = (k: string, v: string) => setValues((prev) => ({ ...prev, [k]: v }));

  const advanceOrSubmit = () => {
    if (active < fields.length - 1) setActive(active + 1);
    else maybeSubmit();
  };

  const maybeSubmit = () => {
    const missing = fields.find((f) => !f.optional && !(values[f.key] ?? '').trim());
    if (missing) {
      setActive(fields.findIndex((f) => f.key === missing.key));
      return;
    }
    onSubmit(values);
  };

  return (
    <Frame title={title}>
      <Text dimColor>{subtitle}</Text>
      <Box flexDirection="column" marginTop={1}>
        {fields.map((f, i) => {
          const isActive = i === active;
          return (
            <Box key={f.key}>
              <Box width={12}>
                <Text color={isActive ? ACCENT : undefined}>
                  {isActive ? '❯ ' : '  '}
                  {f.label}
                </Text>
              </Box>
              <Text>: </Text>
              <TextInput
                value={values[f.key] ?? ''}
                onChange={(v) => setVal(f.key, v)}
                onSubmit={advanceOrSubmit}
                focus={isActive && !busy}
                mask={f.mask ? '•' : undefined}
                placeholder={f.optional ? '(optional)' : ''}
              />
            </Box>
          );
        })}
      </Box>
      {error && (
        <Box marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>
          {busy ? 'Working…' : `Tab/↑↓ move · Enter ${submitLabel} · Esc back`}
        </Text>
      </Box>
    </Frame>
  );
}

export function LoginForm(props: {
  initialAccount: string;
  onSubmit: (account: string, password: string) => void;
  onCancel: () => void;
  error?: string;
  busy?: boolean;
}): React.ReactElement {
  return (
    <FormBody
      title="log in"
      subtitle="Log in to a registered account via SASL."
      fields={[
        { key: 'account', label: 'Account' },
        { key: 'password', label: 'Password', mask: true },
      ]}
      initial={{ account: props.initialAccount, password: '' }}
      submitLabel="log in"
      onSubmit={(v) => props.onSubmit(v.account!.trim(), v.password ?? '')}
      onCancel={props.onCancel}
      error={props.error}
      busy={props.busy}
    />
  );
}

export function RegisterForm(props: {
  initialNick: string;
  onSubmit: (nick: string, password: string, email: string) => void;
  onCancel: () => void;
  error?: string;
  busy?: boolean;
}): React.ReactElement {
  return (
    <FormBody
      title="register"
      subtitle="Create a new account on the server (NickServ)."
      fields={[
        { key: 'nick', label: 'Nick' },
        { key: 'password', label: 'Password', mask: true },
        { key: 'email', label: 'Email', optional: true },
      ]}
      initial={{ nick: props.initialNick, password: '', email: '' }}
      submitLabel="register"
      onSubmit={(v) => props.onSubmit(v.nick!.trim(), v.password ?? '', (v.email ?? '').trim())}
      onCancel={props.onCancel}
      error={props.error}
      busy={props.busy}
    />
  );
}
