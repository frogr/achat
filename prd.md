# achat — Build Brief

> **For:** Claude Code, autonomous overnight build.
> **What:** `achat` — a terminal IRC client with a classic-IRC TUI (channels | messages | users),
> hotkeys, command palette, nick colors, unread badges. TypeScript + Ink. Connects by default to
> the operator's own Ergo server at **irc.austn.net:6697 (TLS)**, but works against any IRC network.
> **Distribution goal:** `npm install -g achat` → typing `achat` drops straight into the UI.

## OPERATING RULES (autonomous run)

1. **Ambiguity → pick a sane default, log it in `DECISIONS.md`, keep moving.** Don't stall waiting
   for the human. `DECISIONS.md` is a running log: what was decided, why, and what the alternative
   was, so it can be revisited in the morning.
2. **Vertical slices over broad stubs.** At every phase the app must _run_ and the new capability
   must _actually work against the live server_, not be a stub. Prefer "fewer things, all real" to
   "many things, all fake." If you're running low on time/context, stop at the last fully-working
   phase rather than leaving everything half-wired.
3. **Commit per phase.** Git commit after each phase passes its acceptance criteria, with a clear
   message. This makes the morning review (and rollback) easy.
4. **Self-verify.** Each phase lists acceptance criteria. Actually check them — connect to the
   server, observe behavior — before moving on. Note in `DECISIONS.md` if a criterion couldn't be
   met and why.
5. **Don't over-engineer.** No premature abstraction layers, no plugin systems, no test framework
   sprawl. A few meaningful tests on the IRC/parsing layer are welcome; 100% coverage is not the goal.
6. **Keep secrets out of git.** Account passwords live in a gitignored local config
   (`~/.config/achat/config.json` or `$XDG_CONFIG_HOME`), never committed. Ship a
   `config.example.json` instead.
7. **The server may still be coming up.** If irc.austn.net:6697 isn't reachable yet, develop and
   test against a public network (e.g. **testnet.ergo.chat:6697**, TLS) so progress isn't blocked,
   and note that in `DECISIONS.md`. Both are Ergo, so behavior matches.

---

## TECH STACK (decided — don't re-litigate)

- **Language:** TypeScript (strict mode on).
- **TUI:** **Ink** (React for terminals) + **ink** ecosystem (`ink`, `react`). Use `useInput` for
  keyboard handling, Ink components for layout. Functional components + hooks only.
- **IRC protocol:** **`irc-framework`** (npm). It handles line parsing, CAP negotiation, SASL,
  reconnection, IRCv3. **Do not hand-roll the IRC protocol or parse raw lines.** Wrap it in a thin
  typed service layer.
- **Runtime:** Node.js (target the current LTS). ESM modules.
- **Build:** `tsc` (or `tsup` if bundling for distribution is cleaner). Bin entry that runs the app.
- **Config:** small typed loader reading `$XDG_CONFIG_HOME/achat/config.json` (fallback
  `~/.config/achat/config.json`), merged with sane defaults and any CLI flags.

If a library choice is genuinely blocked, pick the nearest well-maintained alternative and log it.

---

## AUTHENTICATION — "the realest way" + guest fallback

This is a priority. Implement proper IRC auth, not a shortcut.

**Registered login (primary path): SASL.**

- Use SASL **PLAIN** over the existing TLS connection (TLS is already encrypting, PLAIN-over-TLS is
  the standard, well-supported approach; irc-framework supports it via `account: { account, password }`).
- Optionally support SASL **EXTERNAL** (client TLS certificate / CertFP) as a "no password" mode if
  time allows — Ergo supports it. Nice-to-have, log if deferred.
- Credentials come from config (`account` + `password`), never hardcoded, never committed.

**Registration flow (so a new user can get an account):**

- Provide an in-app path to register a NickServ account on first run if the user has no account:
  guide them through `/msg NickServ REGISTER <password> <email>` (Ergo's built-in NickServ), or a
  friendlier `/register <password> [email]` slash-command wrapper that sends the right NickServ
  message and reports success/failure inline.
- After successful registration, offer to save the account+password into local config so subsequent
  launches use SASL automatically.

**Guest fallback:**

- If no account is configured (or SASL fails / the user chooses guest), connect **without SASL** as
  a guest: pick a nick (e.g. user-provided or `guest-XXXX` with random suffix), connect, and clearly
  indicate "connected as guest (unregistered)" in the UI status line.
- Guests can read/join/chat on open channels but the UI should make the unregistered state visible
  and offer the `/register` path to upgrade.

**On launch, the connect logic is:**

1. Config has account+password → attempt SASL PLAIN. On success: registered session.
2. SASL fails → surface the error, then offer guest connect (don't silently downgrade without
   telling the user).
3. No account in config → first-run chooser: "Log in / Register / Continue as guest."

Document the final auth design in `DECISIONS.md` and `README.md`.

---

## DEFAULT CONNECTION

```
host: irc.austn.net
port: 6697
tls:  true
```

All overridable via config and CLI flags (`--host`, `--port`, `--no-tls`, `--nick`, `--account`).
If irc.austn.net is unreachable during the build, develop against `testnet.ergo.chat:6697` (TLS) and
note it; do not change the shipped default away from irc.austn.net.

---

## UX / LAYOUT SPEC

Classic IRC three-pane layout with a bottom input line and a top/bottom status bar:

```
┌─ achat ──────────────────────────────────────────── irc.austn.net · austin ─┐
│ Channels [1] │ #general                              [2] │ Users [3]         │
│  #general  ● │  12:01 <alice> hey                         │  @alice          │
│  #dev    (3) │  12:01 <bob> yo austin                     │   bob            │
│  #random     │  12:02 * carol has joined                  │   carol          │
│              │  …scrollback…                              │   austin (you)   │
├──────────────┴────────────────────────────────────────────┴──────────────────┤
│ > _                                                                           │
├───────────────────────────────────────────────────────────────────────────────┤
│ Tab/1-2-3 focus · Enter act · Ctrl-K palette · PgUp/PgDn scroll · /help · Ctrl-C quit │
└───────────────────────────────────────────────────────────────────────────────┘
```

**Focus model:**

- Three focusable panels: Channels (1), Messages (2), Users (3). Active panel has a highlighted
  border/title.
- **Tab** cycles focus forward, **Shift+Tab** backward. **1 / 2 / 3** jump directly to a panel.
- **Enter** acts on the focused panel's selection (e.g. Channels panel + Enter = switch to that
  channel; Users panel + Enter = open a query/PM or show whois).
- Arrow keys (and j/k as a nice-to-have) move the selection within the focused panel.
- The input line is always available for typing; a clear rule for when keystrokes go to the input
  vs. act as navigation (e.g. input is focused by default; a hotkey or Esc toggles "navigation mode",
  OR number keys only navigate when input is empty — pick one, make it feel natural, document it).

**Messages panel:** scrollback with **PgUp/PgDn** (and a "jump to latest" key). Timestamps, nick +
message, system events (joins/parts/quits/topic) styled distinctly from chat lines.

**Channels panel:** list of joined channels. **Unread badges**: show a count or ● for channels with
unread messages; highlight differently for direct mentions of the user's nick (e.g. a `@` or color).
Clear unread when the channel becomes active.

**Users panel:** nick list for the active channel, with op/voice prefixes (@, +) grouped/sorted
sensibly.

**Nick colors:** deterministic per-nick coloring (hash nick → stable color from a palette) so each
person has a consistent color. The user's own nick distinct.

**Command palette (Ctrl-K):** overlay listing actions (join channel, switch channel, register,
connect/disconnect, quit, toggle timestamps, etc.) with fuzzy filter. Enter runs the selected action.

**Slash commands in the input line** (minimum set):
`/join #chan`, `/part [#chan]`, `/msg <nick> <text>` (or `/query <nick>`), `/nick <newnick>`,
`/me <action>`, `/register <password> [email]`, `/whois <nick>`, `/connect`, `/quit`, `/help`.
Unknown `/command` → friendly error in the active buffer. Plain text (no slash) sends to the active
channel.

**Status / connection states:** clearly show connecting / connected (registered) / connected (guest)
/ reconnecting / disconnected in a status bar. Show current server + nick.

**Resilience:** handle disconnects with automatic reconnect (irc-framework supports this); show the
reconnecting state; rejoin previously-joined channels on reconnect.

---

## BUILD PHASES (each must run + pass acceptance before moving on; commit after each)

### Phase 0 — Project scaffold

- Init TS + Ink project, strict tsconfig, ESM, bin entry (`achat`), `npm link` so `achat` runs.
- Config loader (defaults + file + flags), `config.example.json`, gitignore real config.
- `DECISIONS.md` and `README.md` started.
- **Accept:** `achat --help` runs; `achat` launches an Ink app that renders "achat" and quits on
  Ctrl-C.

### Phase 1 — Connect + raw event pipe (real server)

- Thin typed IRC service wrapping irc-framework. Connect TLS to default server. For now, render
  incoming events as a raw scrolling log (no panels yet).
- **Accept:** running `achat` connects to the server (austn.net or testnet fallback) and shows live
  server messages / MOTD in the terminal. Disconnect/reconnect observable in logs.

### Phase 2 — Auth: SASL + guest + registration

- Implement the auth logic described above: SASL PLAIN from config; first-run chooser
  (login/register/guest); `/register` wrapper; guest fallback with visible state.
- **Accept:** with an account in config, `achat` logs in via SASL (server confirms account). With no
  account, guest connect works and UI says "guest". `/register` creates an account on Ergo and can be
  saved to config for next-launch SASL.

### Phase 3 — Static 3-panel layout

- Build the Channels | Messages | Users layout + input line + status bar as Ink components with
  placeholder data. Correct sizing/borders/titles. No live data wired yet.
- **Accept:** layout renders cleanly, resizes with the terminal, looks like the spec.

### Phase 4 — Wire real data in

- Feed live data: joined channels → Channels panel; messages for active channel → Messages panel;
  nick list → Users panel; status bar reflects real connection/nick.
- **Accept:** join a channel, see real messages flow into the Messages panel and real users in the
  Users panel; the active channel's data is what's shown.

### Phase 5 — Focus + navigation + channel switching

- Implement Tab/Shift+Tab/1-2-3 focus, in-panel selection with arrows (j/k bonus), Enter actions
  (switch channel, PM/whois user), and the input-vs-navigation keystroke rule.
- **Accept:** can move focus between all three panels, select within them, switch the active channel
  from the Channels panel, all via keyboard.

### Phase 6 — Sending, slash commands, scrollback

- Input line sends to active channel; implement the slash-command set; PgUp/PgDn scrollback + jump
  to latest.
- **Accept:** can hold a real two-way conversation on the server; `/join`, `/part`, `/msg`, `/nick`,
  `/me`, `/whois`, `/quit`, `/help` all work; scrollback scrolls and returns to live.

### Phase 7 — Polish: nick colors, unread badges, command palette, system-event styling

- Deterministic nick colors; unread badges + mention highlighting in Channels panel; Ctrl-K command
  palette with fuzzy filter; distinct styling for joins/parts/topic/system lines; own-nick emphasis.
- **Accept:** colors stable per nick; unread counts appear and clear correctly; mentions stand out;
  command palette opens, filters, and runs actions.

### Phase 8 — Resilience + distribution + docs

- Auto-reconnect with state shown + channel rejoin; final `README.md` (install via `npm link` now,
  notes toward `npm publish`/`npm i -g achat` later; how to configure server/account; guest +
  register flow; keybindings reference); ensure `DECISIONS.md` is complete.
- **Accept:** killing the connection shows reconnecting and recovers, rejoining channels; a fresh
  reader could install, configure, and use achat from the README alone.

---

## STRETCH (only if everything above is solid — log, don't force)

- Multiple server connections / network switcher.
- Direct-message (query) buffers as first-class items alongside channels.
- SASL EXTERNAL (CertFP) login.
- Configurable theme / keybindings.
- Message search within scrollback.
- Desktop notification on mention.

## EXPLICIT NON-GOALS (don't build these)

- No custom IRC server (Ergo already handles that).
- No web UI, no Electron, no GUI — terminal only.
- No hand-rolled IRC protocol parser.
- No account/password ever committed to git.

---

## MORNING HANDOFF — leave these for the human

At the end, output (and ensure files exist for):

1. **What works** — phase-by-phase status against acceptance criteria.
2. **How to run it** — exact commands (`npm link` then `achat`), and how to point it at irc.austn.net
   with a registered account vs. guest.
3. **`DECISIONS.md`** — every default chosen and why; anything deferred or worth a second look.
4. **Open questions / next steps** — what to tackle next, any rough edges, anything that needed the
   server but the server wasn't up.
5. **Known issues** — anything flaky or unfinished, stated plainly.
