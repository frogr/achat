#!/usr/bin/env node
import { render } from 'ink';
import meow from 'meow';
import { loadConfig, type CliFlags } from './config.js';
import { App } from './ui/App.js';

const cli = meow(
  `
  achat — a terminal IRC client (classic three-pane TUI)

  Usage
    $ achat [options]

  Options
    --host <host>       IRC server host        (default: irc.austn.net)
    --port <port>       IRC server port        (default: 6697)
    --no-tls            Disable TLS            (default: TLS on)
    --nick <nick>       Nick to use
    --account <name>    SASL account name (password read from config file)
    --config <path>     Path to a config.json  (default: ~/.config/achat/config.json)

  Examples
    $ achat
    $ achat --host irc.libera.chat --nick austin
    $ achat --config ./config.json

  Config
    Credentials live in ~/.config/achat/config.json (see config.example.json).
    Never commit your password. With an account+password set, achat logs in via
    SASL; otherwise it connects as a guest.
`,
  {
    importMeta: import.meta,
    flags: {
      host: { type: 'string' },
      port: { type: 'number' },
      tls: { type: 'boolean', default: true },
      nick: { type: 'string' },
      account: { type: 'string' },
      config: { type: 'string' },
    },
  },
);

const flags: CliFlags = {
  host: cli.flags.host,
  port: cli.flags.port,
  tls: cli.flags.tls,
  nick: cli.flags.nick,
  account: cli.flags.account,
  config: cli.flags.config,
};

const config = loadConfig(flags);

// Ink needs a real TTY for input. Fail gracefully when piped.
if (!process.stdout.isTTY) {
  process.stderr.write('achat: must be run in an interactive terminal (TTY).\n');
  process.exit(1);
}

const { waitUntilExit } = render(<App config={config} />, {
  exitOnCtrlC: true,
});

waitUntilExit().then(() => {
  process.exit(0);
});
