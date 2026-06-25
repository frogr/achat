import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import type { Config } from './types.js';

/** Defaults — irc.austn.net per the build brief. Never change the shipped default. */
const DEFAULTS: Config = {
  host: 'irc.austn.net',
  port: 6697,
  tls: true,
  nick: '',
  realname: 'achat user',
  username: 'achat',
  channels: ['#general'],
};

/** $XDG_CONFIG_HOME/achat/config.json, falling back to ~/.config/achat/config.json. */
export function configDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg.trim().length > 0 ? xdg : join(homedir(), '.config');
  return join(base, 'achat');
}

export function configPath(): string {
  return join(configDir(), 'config.json');
}

/** Partial config read from disk (any subset of Config keys). */
type FileConfig = Partial<Config>;

function readFileConfig(path: string): FileConfig {
  try {
    if (!existsSync(path)) return {};
    const raw = readFileSync(path, 'utf8');
    if (raw.trim().length === 0) return {};
    return JSON.parse(raw) as FileConfig;
  } catch (err) {
    // Bad config shouldn't crash the app; surface it but keep defaults.
    process.stderr.write(
      `achat: warning: could not read config at ${path}: ${(err as Error).message}\n`,
    );
    return {};
  }
}

/** CLI flag overrides (already parsed by meow into a flat object). */
export interface CliFlags {
  host?: string;
  port?: number;
  tls?: boolean; // --no-tls sets this false
  nick?: string;
  account?: string;
  config?: string; // explicit config path
}

/** Generate a guest nick like `guest-4f2a`. Deterministic-ish but unique enough. */
export function generateGuestNick(): string {
  const suffix = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .padStart(4, '0');
  return `guest-${suffix}`;
}

/**
 * Merge defaults <- config file <- CLI flags. Returns the resolved config plus
 * the path it came from. Does not fabricate an account; absence of account/password
 * means the guest path will be taken.
 */
export function loadConfig(flags: CliFlags = {}): Config {
  const path = flags.config ?? configPath();
  const file = readFileConfig(path);

  const merged: Config = {
    ...DEFAULTS,
    ...stripUndefined(file),
    ...stripUndefined({
      host: flags.host,
      port: flags.port,
      tls: flags.tls,
      nick: flags.nick,
      account: flags.account,
    }),
    configPath: path,
  };

  // If no nick was provided anywhere, fall back to account name or a guest nick.
  if (!merged.nick || merged.nick.trim().length === 0) {
    merged.nick = merged.account?.trim() || generateGuestNick();
  }

  return merged;
}

/** True if config has both account + password, i.e. SASL is possible. */
export function hasAccount(cfg: Config): boolean {
  return Boolean(cfg.account && cfg.password);
}

/**
 * Persist account credentials (and current server/nick) to the config file so
 * the next launch can SASL automatically. Creates the directory if needed.
 * Writes with 0600 perms since it holds a password.
 */
export function saveConfig(cfg: Config): string {
  const path = cfg.configPath ?? configPath();
  mkdirSync(dirname(path), { recursive: true });
  const toWrite = {
    host: cfg.host,
    port: cfg.port,
    tls: cfg.tls,
    nick: cfg.nick,
    account: cfg.account,
    password: cfg.password,
    realname: cfg.realname,
    username: cfg.username,
    channels: cfg.channels,
  };
  writeFileSync(path, JSON.stringify(toWrite, null, 2) + '\n', { mode: 0o600 });
  return path;
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}
