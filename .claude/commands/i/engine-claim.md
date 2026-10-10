# /engine-claim

## Plain English

Pick up the next runnable task from the terminal as an **interactive** run — the
human counterpart to an agent claiming work headlessly. This claims the task,
writes the run context, and tells you what to do next. When you then start
your AI coding session, the bridge links it to the run, so the task shows the live
session working on it.

## Prerequisites (one-time)

- A **daemon token**: in the web app, go to **Settings → Agent Tokens**,
  generate one (`pm_daemon_…`, shown once), and add it to `.env.local`:
  ```
  PM_DAEMON_TOKEN=pm_daemon_xxxxxxxx…
  ```
  The claim endpoint takes a daemon token (or a browser session), not the
  project sync token — so a terminal claim needs this.
  This is the same account **agent token** a Docker fleet uses — not a
  Docker-only or terminal-only secret. On a fresh machine, `ibuild setup`
  (run automatically by the first `ibuild sync`) writes it to `.env.local`
  alongside the project sync token in `.build/.sync` — one command provisions
  both.
- A **runnable task** must exist (status `queued`, dependencies met).

## Steps

1. **Claim** the next runnable task interactively:
   ```bash
   ibuild engine claim
   ```
   - Prints the claimed task + the phase prompt, and writes `.tasks/.current`
     and `.tasks/.engine`.
   - "Nothing runnable to claim" → there is no queued task ready; nothing to do.
   - Refuses if `.tasks/.engine` already exists (a prior unfinished claim) — finish
     that run, remove `.tasks/.engine`, or re-run with `--force`.

2. **Check for staged goal attachments** (do this at the START of the phase). The
   daemon stages the goal's attachments to `.tasks/attachments/<goalId>/` at
   scaffold time — so a fleet/daemon run, which holds only the project sync token,
   can read them by path without ever needing `PM_DAEMON_TOKEN`:
   ```bash
   ibuild engine goal-files   # lists the current run's goal's staged attachments
   ```
   It reads the staged `index.json` manifest (no token, no API call), so it works
   in the container. Then:
   - **Staged file(s) listed** → **read each one before implementing** — they are
     the spec / mockup / sample data the work depends on; open them by path under
     `.tasks/attachments/<goalId>/`.
   - **`.UNREADABLE` sentinel** (staging failed) → do **NOT** proceed against a
     guessed spec. **Raise an ATTENTION PAUSE naming the goalId** and the unblock
     steps it printed (re-upload / check the daemon token / re-run so staging
     retries).
   - **Sync-token-only, nothing staged** message → attachments were never staged;
     surface that (re-claim / re-run so staging retries) rather than guessing.
   - **"no attachments"** → nothing to do; continue.

3. **Work the phase**: start your AI coding session in this directory and carry out the phase
   prompt. The bridge registers a session and links it to the run automatically
  . If the session doesn't appear linked, check the bridge stderr —
   the link is best-effort (logs, never crashes the session).

4. **Submit the deliverable** via the bridge tool `pm_submit_artifact` (available
   because `.tasks/.engine` is present), e.g. a `pr_ref` / `plan` / `decision_record`
   matching the phase's required artifact.

5. **Report the run done** with the report vehicle (reads the `runId` from
   `.tasks/.engine`, drives the task forward, and clears `.tasks/.engine` for the
   next claim):
   ```bash
   ibuild engine report
   ```
   It prints what the task did — advanced to the next phase, completed, or paused
   (risk / kickback / review-standoff / operator-action → resolve on `/attention`).
   To **release a stuck/abandoned run** back to the queue instead:
   ```bash
   ibuild engine report --fail "reason"
   # or, with a default reason:
   ibuild engine report --abandon
   ```

## Notes

- One claim at a time: `.tasks/.engine` is the single in-flight run context;
  the claim refuses to overwrite it without `--force`. `engine:report` clears it
  on a terminal report.
- Abandoned interactive runs are also auto-recovered: a server-side reaper
  fails a run whose session has gone stale/ended and pauses the
  task on `/attention` — so you don't strictly have to `--fail` a run you walked
  away from, though doing so is immediate.
