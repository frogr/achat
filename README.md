# achat

A polished terminal IRC client with a classic three-pane TUI — **Channels · Messages · Users** —
built in TypeScript + [Ink](https://github.com/vadimdemedes/ink). Connects over TLS, authenticates
the real way (SASL), and gets out of your way.

> Status: under active construction (overnight build). See [`DECISIONS.md`](./DECISIONS.md) for the
> running design log and [`prd.md`](./prd.md) for the full brief.

## Install (local, via `npm link`)

```sh
git clone git@github.com:frogr/achat.git
cd achat
npm install
npm run build
npm link        # puts `achat` on your PATH
achat           # launch
```

`achat --help` lists all flags.

## Configure

achat reads `~/.config/achat/config.json` (or `$XDG_CONFIG_HOME/achat/config.json`). Copy the example:

```sh
mkdir -p ~/.config/achat
cp config.example.json ~/.config/achat/config.json
$EDITOR ~/.config/achat/config.json
```

```jsonc
{
  "host": "irc.austn.net",   // default server
  "port": 6697,
  "tls": true,
  "nick": "your-nick",
  "account": "your-account", // omit account+password to connect as a guest
  "password": "…",           // used for SASL PLAIN over TLS; never commit this
  "channels": ["#general"]
}
```

> Your password lives only in this file (written with `600` perms) and is **never** committed.

CLI flags override the file:

```sh
achat --host irc.libera.chat --nick austin
achat --no-tls --port 6667
achat --config ./my-config.json
```

## Auth

- **Registered (SASL):** set `account` + `password` in config → achat logs in via SASL PLAIN over TLS.
- **Guest:** with no account configured, achat connects as a guest (`guest-XXXX`) and shows the
  unregistered state in the status bar.
- **Register:** _(coming in Phase 2)_ an in-app `/register <password> [email]` to create an account.

## Keybindings

_(filled in as the UI lands — Phases 3–7)_

## Development

```sh
npm run dev        # run from source with tsx
npm run typecheck  # tsc --noEmit
npm test           # node:test + ink-testing-library
npm run build      # compile to dist/
```

## License

MIT