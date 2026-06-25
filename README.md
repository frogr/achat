# achat

A polished terminal IRC client with a classic three-pane TUI — **Channels · Messages · Users** —
built in TypeScript + [Ink](https://github.com/vadimdemedes/ink). Connects over TLS, authenticates
the real way (SASL), reconnects cleanly, and gets out of your way.

```
 achat irc.austn.net:6697                                    austin · registered as austin
╭────────────────╮╭──────────────────────────────────────────────────╮╭──────────────╮
│ Channels [1]   ││ #general [2] — welcome                            ││ Users [3]  3 │
│ ▸ #general     ││ 12:01 <alice> hey                                 ││ @austin (you)│
│   #dev       @ ││ 12:01 <bob>   yo austin                           ││ +bob         │
│   #random    2 ││ 12:02 » carol has joined #random                  ││  carol       │
╰────────────────╯╰──────────────────────────────────────────────────╯╰──────────────╯
╭──────────────────────────────────────────────────────────────────────────────────────╮
│ #general ❯ hello world                                                                  │
╰──────────────────────────────────────────────────────────────────────────────────────╯
 Tab/1-3 focus · Enter act · j/k select · PgUp/PgDn scroll · Esc live · Ctrl-K palette · /help
```

## Install (local, via `npm link`)

Requires Node.js ≥ 18.

```sh
git clone git@github.com:frogr/achat.git
cd achat
npm install
npm run build
npm link        # puts `achat` on your PATH
achat           # launch
```

`achat --help` lists all flags. (A future `npm publish` will enable `npm i -g achat`; until then,
`npm link` is the install path — `prepublishOnly` already builds `dist/`.)

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

> Your password lives only in this file (written with `600` perms) and is **never** committed
> (`config.json` is gitignored).

CLI flags override the file:

```sh
achat --host irc.libera.chat --nick austin
achat --no-tls --port 6667
achat --account austin            # password still comes from the config file
achat --config ./my-config.json
```

## Authentication

On launch:

1. **Account configured** (`account` + `password`) → achat logs in with **SASL PLAIN over TLS**.
2. **No account** → a first-run chooser: **Log in**, **Register**, or **Continue as guest**.
   - **Log in** — enter an account + password; achat connects with SASL.
   - **Register** — pick a nick + password (+ optional email); achat registers it via NickServ,
     then offers to save it (press **Ctrl-S**) so the next launch uses SASL automatically.
   - **Guest** — connect unregistered as `guest-XXXX`; the status bar shows the guest state.

If SASL fails, achat tells you and continues as a guest rather than silently downgrading.

You can also register/identify after connecting:

```
/register <password> [email]
/identify <account> <password>
```

## Keybindings

| Key | Action |
| --- | --- |
| `Tab` / `Shift-Tab` | Cycle focus across the three panels |
| `1` / `3` | Jump to Channels / Users (when the input is empty); `2` returns to the input |
| `Esc` | Return to the input and jump to the latest messages |
| `↑` `↓` or `j` `k` | Move the selection in the focused panel (Channels / Users) |
| `Enter` (Channels) | Switch to the selected channel |
| `Enter` (Users) | Open a private query with the selected user (+ whois) |
| `Enter` (input) | Send the message / run the command |
| `←` `→` | Move the cursor in the input |
| `PgUp` / `PgDn` | Scroll the message scrollback; `Esc` jumps back to live |
| `Ctrl-K` | Open the command palette (fuzzy filter, Enter to run) |
| `Ctrl-S` | Save account credentials to the config file |
| `Ctrl-C` | Quit |

> To type a message that starts with a literal `1`/`3`, type another character first (those digits
> navigate only when the input is empty).

## Slash commands

`/join #chan [key]` · `/part [#chan] [reason]` · `/msg <nick|#chan> <text>` · `/query <nick>` ·
`/nick <newnick>` · `/me <action>` · `/whois <nick>` · `/topic <text>` · `/register <pw> [email]` ·
`/identify <account> <pw>` · `/close` · `/save` · `/timestamps on|off` · `/connect` · `/quit [msg]` ·
`/help`

Plain text sends to the active channel. `//text` sends a literal leading slash. Unknown commands
show a friendly error. The command palette (`Ctrl-K`) exposes the same commands plus "Go to <buffer>".

## Resilience

achat uses irc-framework's auto-reconnect. On an unexpected disconnect the status bar shows
**reconnecting…**, and once re-registered achat **rejoins every channel** you were in (configured
channels ∪ channels joined this session). (irc-framework waits until you've been registered ≥5s
before treating a drop as reconnect-worthy, to avoid aKill loops.)

## Note on irc.austn.net

The default Ergo server **auto-joins everyone to `#general`** and replays recent **chathistory** on
join, so you'll land in `#general` with recent context even as a guest.

## Development

```sh
npm run dev        # run from source with tsx
npm run typecheck  # tsc --noEmit
npm test           # node:test + ink-testing-library (39 tests)
npm run build      # compile to dist/

# live checks against a real server (in ./scripts):
node scripts/verify-irc.mjs        # connect, join, observe events
node scripts/verify-auth.mjs       # register an account + SASL login
node scripts/live-convo.mjs        # full App + a peer holding a conversation
node scripts/verify-reconnect.mjs  # drop the socket, observe recovery
node scripts/demo-layout.mjs       # render the UI to an ASCII frame
```

## Architecture

- `src/irc/service.ts` — thin typed wrapper over irc-framework; emits one `IrcEvent` union and
  tracks per-channel membership.
- `src/state/appState.ts` — pure reducer folding events into buffers (the source of truth).
- `src/ui/` — Ink components: `App` (controller + all key routing), `ClientView` (layout), the
  three panels, `InputLine`, `CommandPalette`, auth screens.
- `src/lib/` — nick colors, formatting/word-wrap, the command registry, fuzzy matching.

See [`DECISIONS.md`](./DECISIONS.md) for the full design log and [`prd.md`](./prd.md) for the brief.

## License

MIT
