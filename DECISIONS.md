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

### Deferred / revisit

- SASL EXTERNAL (CertFP) — stretch; default to SASL PLAIN over TLS first.
- `tsup`/`npm publish` packaging — after the client is feature-complete.
