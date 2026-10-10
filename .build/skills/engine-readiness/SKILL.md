---
name: engine-readiness
description: "Inspect and drive a connected repo's **automation readiness + setup** from the terminal — the CLI counterpart to the web UI's **Fleet setup** driver (project settings → integrations). Lets the interactive agent see the readiness gate, run the whole setup pipeline, and adopt a proposed build & test setup without the browser. Setup is per **connection/repo** — the executing machine is invisible."
---

# /engine-readiness

## Plain English

Inspect and drive a connected repo's **automation readiness + setup** from the
terminal — the CLI counterpart to the web UI's **Fleet setup** driver (project
settings → integrations). Lets the interactive agent see the readiness gate, run
the whole setup pipeline, and adopt a proposed build & test setup without the
browser. Setup is per **connection/repo** — the executing machine is invisible.

Readiness = the five checks a repo must pass before the fleet can run work on it:

1. **toolchain resolved** — a Nix toolchain was detected/declared
2. **test tooling detected** — a test mechanism exists
3. **write access to repo** — the acting GitHub credential can push
4. **install preflight** — dependency install succeeded
5. **services preflight** — declared services came up

All five green ⇒ `ready`.

## When to use

- The developer asks "is `<repo>` ready for the fleet", "why isn't `<repo>`
  picking up work", "re-assess `<repo>`", "check `<repo>`'s toolchain/setup".
- Before queuing a goal on a newly connected repo, to confirm the fleet can
  actually run it (a not-ready repo starves its queue).
- After fixing an env var / manifest / test mechanism, to re-run the gate.

Developers never type this — they say it in natural language and you run the flow.

## Prerequisites (one-time)

- A **daemon token** in `.env.local` as `PM_DAEMON_TOKEN=pm_daemon_…` (the web app →
  Settings → Agent Tokens) — the same token the rest of the local engine loop uses.
  This is the same account **agent token** a Docker fleet uses — not a
  Docker-only or terminal-only secret. On a fresh machine, `ibuild setup`
  (run automatically by the first `ibuild sync`) writes it to `.env.local`
  alongside the project sync token in `.build/.sync` — one command provisions
  both.
  All the readiness endpoints accept a daemon token OR a browser session.
- Run from the project root (needs `.build/.sync` for the API base URL).

## Steps

1. **List connected repos** (to find the one you mean + its `connectionId`):
   ```bash
   ibuild engine readiness list
   ```

2. **Show the readiness gate** for a repo:
   ```bash
   ibuild engine readiness status <owner/repo | repo-substring | connectionId>
   ```
   - Prints each of the five checks (`✓` pass / `✗` fail / `?` not yet determined),
     the overall `ready` verdict, `preflightStatus`, and any failing check's detail.
   - Exit code is `0` when ready, `1` otherwise (handy in scripts).

3. **Re-assess** — request a fresh read-only assessment on an idle fleet agent and
   poll until it settles:
   ```bash
   ibuild engine readiness assess <owner/repo | repo-substring | connectionId>
   ```
   - `blocked_no_compute` ⇒ no daemon machine is online+idle; bring one up and retry.
   - Otherwise it polls (~2 min) and prints the final gate. This is the CLI form of
     the panel's **Re-assess** button.

## Driving the setup lifecycle

`status` / `assess` cover inspect + re-assess. The **Fleet setup** driver's action
button maps to these subcommands, all **connection-scoped** (no machine id needed):

4. **Set it up / Fix setup / Re-check** — run the whole setup pipeline (re-assess,
   reopen or create the setup goal, redraft build & test), then poll the gate:
   ```bash
   ibuild engine readiness setup <owner/repo | repo-substring | connectionId>
   ```
5. **Use this setup** — adopt the proposed build & test setup (accept the draft):
   ```bash
   ibuild engine readiness accept <repo>
   ```
6. **Regenerate** — throw the current draft away and redraft:
   ```bash
   ibuild engine readiness regenerate <repo>
   ```

All three are the CLI form of the panel's inline actions. Under the hood they POST
`/api/v1/me/connected-repos/:connectionId/test-mechanism` with an `action` of
`recheck | accept | regenerate` — the daemon token works, e.g.:

```bash
curl -s -X POST "$BASE/api/v1/me/connected-repos/$CONNECTION_ID/test-mechanism" \
  -H "Authorization: Bearer $PM_DAEMON_TOKEN" -H "Content-Type: application/json" \
  -d '{"action":"recheck"}'
```

Resolve `$CONNECTION_ID` from `ibuild engine readiness list`; `$BASE` is the
`BUILD_SYNC_URL` in `.build/.sync`.

## Notes

- **Identifier resolution:** exact `owner/repo` > exact `connectionId` >
  unique case-insensitive repo substring. An ambiguous substring prints the
  candidates and does nothing — use the full `owner/repo`.
- Readiness + setup are recorded per **connected repo**, not per machine, so every
  subcommand is machine-independent — which agent runs the work is invisible.
- Read-only for `list`/`status`; `assess`/`setup` mark the profile `pending` for a
  fleet agent to drain (they never run the toolchain in-process).
- Related: the `engine-status` step (task lifecycle), the `engine-work` step (run a task).
