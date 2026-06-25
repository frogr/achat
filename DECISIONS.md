# DECISIONS.md

A running log of decisions made during the autonomous build of `achat`. Format:
**Decision · Why · Alternative considered.** Newest phase at the bottom.

---

## Phase 0 — Project scaffold

- **Ink 5 + React 18, ESM, TypeScript strict.** · Brief mandates Ink; Ink 5 is the
  current pure-ESM line and pairs with React 18. Strict mode + `noUnusedLocals` etc.
  for quality. · Alt: Ink 4 (CJS-friendly) — rejected, older and ESM is cleaner here.
- **`irc-framework` for the protocol.** · Brief mandates it; handles parsing, CAP/SASL,
  IRCv3, reconnection. Wrapped behind a thin typed `IrcService` (Phase 1). · Alt:
  hand-rolled parser — explicitly a non-goal.
- **`meow` for CLI flags + `--help`/`--version`.** · Standard Ink-ecosystem companion,
  gives clean help text and `--no-tls` boolean negation for free. · Alt: hand-rolled
  arg parsing — more code, less polish.
- **Build with plain `tsc` to `dist/`, NodeNext modules.** · Simplest path to a working
  `bin`; shebang is preserved by tsc. `npm link` exposes `achat`. · Alt: `tsup` bundling
  — deferred until we actually `npm publish`; not needed for `npm link`.
- **Config at `$XDG_CONFIG_HOME/achat/config.json` → `~/.config/achat/config.json`.**
  Loader merges defaults ← file ← CLI flags. Password lives only here, written 0600,
  gitignored. Ship `config.example.json`. · Per brief's secret-handling rules.
- **Nick fallback chain:** explicit `--nick`/config nick → account name → generated
  `guest-XXXX`. · So the app always has a usable nick even with an empty config.
- **`ink-testing-library` for headless UI tests + `node:test` runner.** · Lets us
  assert rendered frames without a real TTY in CI; a real-pty smoke via `script` covers
  the binary end-to-end. · Alt: no UI tests — rejected, we want self-verification.
- **Default server stays `irc.austn.net:6697` TLS.** Confirmed reachable with a valid
  Let's Encrypt cert at build time, so we develop against the real server (no need for
  the `testnet.ergo.chat` fallback). · Per brief.

## Phase 1 — Connect + raw event pipe

- **`IrcService` translates irc-framework events → one typed `IrcEvent` union.**
  The whole app consumes that union; irc-framework's loose payloads never leak past
  the service. · Keeps the UI/state testable and the protocol lib swappable in theory.
- **Service owns per-channel membership** (`Map<chan, Map<nick, User>>`). · irc-framework's
  `quit`/`nick` events don't say which channels were affected, so we track membership
  and fan those events out to the right buffers ourselves. Also lets us re-sort the
  user list by prefix (~ & @ % +) on every change.
- **mode→prefix mapping hardcoded** (q~ a& o@ h% v+). · Ergo uses the standard PREFIX;
  reading network.options.PREFIX dynamically is a stretch refinement.
- **`raw` event surfaces every incoming server line** for the Phase-1 log; later phases
  consume the structured events instead. · Satisfies "raw event pipe" cheaply.
- **Verified headlessly** via `scripts/verify-irc.mjs` (drives the service without Ink):
  against irc.austn.net we observed connect → guest registration → MOTD → join #general →
  NAMES/userlist → clean disconnect. · Ink's in-place rendering is hard to assert from a
  captured file, so service-level verification is the source of truth; a pty smoke confirms
  the TUI launches without crashing.

## Phase 2 — Auth: SASL + guest + registration

- **SASL PLAIN via irc-framework's `account: {account, password}`.** · The lib negotiates
  the `sasl` CAP and AUTHENTICATEs for us; `sasl_disconnect_on_fail` left false so a bad
  login degrades to guest instead of dropping. Verified end-to-end against irc.austn.net
  (`scripts/verify-auth.mjs`): registered a fresh account, reconnected, server confirmed
  `account=<nick>`.
- **First-run chooser** (Log in / Register / Guest) shown only when no account is configured.
  With account+password present we skip straight to SASL. · Matches the brief's connect logic.
- **Registration uses NickServ** (`/msg NickServ REGISTER <pw> [email]`). Ergo replied
  "Account created" / "You're now logged in as …". · NickServ replies are NOTICEs *from a
  nick*, which the service routes as `message` events (not `notice`), so the App feeds
  NickServ messages into the success detector. Account name == the nick used at registration.
- **"Offer to save" = Ctrl-S**, not a blocking modal. · After a successful login/register the
  status line shows "Ctrl-S save credentials"; pressing it writes `config.json` (0600). Lower
  friction than a yes/no prompt and reusable as a general save.
- **SASL-fail surfaced, not silently downgraded.** · On a login attempt that lands as guest,
  the buffer shows a red "SASL did not log you in — connected as guest" line. Per brief.
- **Service factory is injectable** (`createService` prop) so the auth flow is unit-tested
  with a fake (no sockets): guest connect, register form → NickServ → success detection.

## Phase 3 — Static 3-panel layout

- **Single pure reducer (`state/appState.ts`) is the source of truth** for buffers, active
  buffer, focus, selection, and scroll. Ink-free so it's unit-tested without a terminal
  (23 reducer tests). · Keeps keyboard handling and rendering simple and testable.
- **Buffers unify channels, queries, and the `*server*` buffer.** The Channels panel lists
  them all (server first). · One model for everything that can hold lines.
- **Messages are pre-wrapped to visual rows** (`lib/format.wrapText`) before slicing to the
  panel height. · Guarantees the layout never overflows and makes scrollback math exact,
  while still soft-wrapping long messages (vs. truncating chat content).
- **Proportional panel widths** (channels ~18%, users ~16%, messages flex) read live
  `stdout` dimensions each render; Ink re-renders on resize. · Adapts to terminal size.
- **Presentational panels** (Channels/Messages/Users/Input/Bars) take plain props; all logic
  lives in the reducer/container. Verified with a render test + an ASCII frame dump
  (`scripts/demo-layout.mjs`) that matches the brief's mockup.

## Phase 4 — Wire real data in

- **`App` now drives the reducer:** the IRC event handler does `dispatch({type:'irc',event})`
  for display, then runs side-effects (auto-join configured channels on `registered`, NickServ
  register detection, SASL-fail surfacing, Ctrl-S save). · One event stream, two concerns
  cleanly separated.
- **Auto-join on every `registered`** (not just first) so reconnects rejoin channels (Phase 8
  resilience comes for free). Channels come from config.
- **Basic sending wired now** (non-slash text → `say(activeBuffer)`); slash commands deferred to
  Phase 6 with a friendly placeholder. · Lets us verify two-way flow early.
- **Verified end-to-end against irc.austn.net** with `scripts/live-app.mjs`: real App connects
  as guest, auto-joins #general, a second client joins and speaks, and the frame shows the
  incoming message (nick-colored), the join lines, and a 2-user list. Plus a deterministic
  wiring unit test via the fake service.

## Phase 5 — Focus + navigation + channel switching

- **One custom line editor in a single global `useInput`** instead of ink-text-input for the
  chat line. · Two `useInput` handlers both receive every key, which makes "digit navigates
  when the input is empty" impossible without double-handling. Owning all key routing in one
  place removes the conflict entirely (forms still use ink-text-input — no nav there).
- **Input-vs-navigation rule:** the input line is focused by default; **Tab/Shift-Tab** cycle
  panels, **1/3** jump to Channels/Users *only when the input is empty* (2 returns to the
  input), **Esc** always returns to the input. In a side panel ↑↓ or j/k select and Enter acts
  (Channels→switch, Users→open query + whois). · Matches the brief's chosen rule.
  Known tradeoff: to start a message with a literal 1/3, type another char first.
- **Arrows in the input** move the cursor; **↑↓** scroll when not editing horizontally;
  **PgUp/PgDn** page the scrollback. Verified via unit tests driving real keystrokes through
  ink-testing-library (channel switch, users→query, typing-then-digit stays literal).

## Phase 6 — Sending, slash commands, scrollback

- **Command registry in `lib/commands.ts`** (data-driven `CommandSpec[]`) drives `/help` and
  the Phase-7 palette from one source. Supported: join, part, msg, query, nick, me, whois,
  register, identify, topic, close, save, timestamps, connect, quit, help (+ aliases). Unknown
  → friendly error; `//` escapes a literal leading slash; plain text → active buffer.
- **App-level actions** (quit/save/register/connect/setTimestamps) are passed to commands via a
  `CommandActions` context, keeping `commands.ts` free of React/refs.
- **Scrollback:** PgUp/PgDn page; ↑↓ line-scroll while the input is focused; **Esc returns to
  live** (and refocuses input); sending a line also jumps to latest. New lines while scrolled
  up preserve the offset (you don't get yanked to the bottom).
- **Verified with a real two-way conversation** (`scripts/live-convo.mjs`): `/join`, send, and
  receive all work; plus unit tests for /join, /me, /nick, unknown-command, plain-text, and the
  `//` escape (31 tests).

### Server quirk discovered (irc.austn.net / Ergo)

- **The server force-auto-joins every client to `#general`** ("You are auto-joined to #general")
  and **replays chathistory** as a batch on join. · This is benign for achat (we render the
  history; our own auto-join of #general is idempotent), but it tripped up the test *bots*: a
  `join`/isSelf handler fires for both the auto-joined #general and the real channel. Diagnosed
  a phantom "duplicate message" to this (the bot double-sent), confirmed achat itself never
  duplicates. Lesson baked into the verify scripts (guard on channel name).

### Deferred / revisit

- SASL EXTERNAL (CertFP) — stretch; default to SASL PLAIN over TLS first.
- Registration success/failure is detected by regex on NickServ's text; if a server uses
  required email verification, the account won't be usable until verified — surfaced to the
  user via the raw NickServ message regardless.
- Resize is handled by Ink's native resize events + proportional widths; not asserted in the
  test harness (ink-testing-library pins terminal columns).
- `tsup`/`npm publish` packaging — after the client is feature-complete.
- Full auto-reconnect/rejoin behaviour is wired (irc-framework `auto_reconnect`) but
  exercised/verified in Phase 8.
