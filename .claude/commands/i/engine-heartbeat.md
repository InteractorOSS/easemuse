# /engine-heartbeat

## Plain English

Keep a **bridge-less** interactive run's lease alive — from the terminal, in the
background, with no ritual command to remember.

An interactive run is reclaimed after an hour of total silence. A session with
the PM bridge attached renews that lease on its own heartbeat, and every
`ibuild engine` command renews it too — but a bare-terminal drive with no bridge
can go the whole hour between `ibuild engine work` and `ibuild engine report`
typing no engine command at all, while it reads, writes and tests code, and lose
the run to that silence. This command needs no discipline to remember: start it
once and it keeps checking in for you.

## When to use

- You're hand-driving a task with no PM bridge in this checkout, and the work will
  take longer than a few minutes between `ibuild engine` commands.
- The developer says "keep this run alive", "I'm going to be heads-down on this for
  a while", or you notice the session has no bridge (`.mcp.json` absent, or pointed
  at a container-only path) while holding a long-running interactive task.
- A push to the goal branch ALSO renews the lease on its own — this command is for
  the gap *between* pushes, not a replacement for pushing your work.

Developers never type this — they say what they're about to do and you start it
for them, in the background, so it doesn't block the rest of the session.

## Prerequisites

- A run in progress: `.goals/.engine` is present (written by
  `ibuild engine work` / `ibuild engine claim`).
- `.build/.sync` with `BUILD_SYNC_URL=…` / `BUILD_SYNC_PROJECT_ID=…` (the base URL
  and project the heartbeat route lives under) — the same file every
  `ibuild engine` command reads.
- A **daemon token** as `PM_DAEMON_TOKEN`, resolved the same way
  `ibuild engine work` and `ibuild engine report` resolve it (the environment,
  then `.env.local` walking up from the current directory).

## Steps

1. **Start it as a background step**, right after `ibuild engine work` opens the
   run — before the long stretch of coding begins:

   ```bash
   ibuild engine heartbeat --loop &
   ```

   In an AI coding session, run it as a background step your tool tracks instead
   of a shell `&` — same effect, and you're only interrupted if it ever prints
   something.

2. **Work normally.** Nothing about the rest of the loop changes — implement,
   record deliverables (`pm_submit_artifact` or the engine-artifact step),
   `ibuild engine report` — this just runs alongside it.

3. **It stops itself.** The moment `.goals/.engine` clears (your
   `ibuild engine report` ran) or the server says the run it was renewing is
   already closed, it logs why and exits 0. Nothing to tear down by hand.

## Options

- *(bare)* — one quick beat: renew the run named in `.goals/.engine` right now,
  print the result, exit. Useful as a one-off check-in, or to confirm the run is
  still live before a report.
- `--loop` — the keepalive: repeat that beat every ~20 minutes until the run ends.
  This is the mode you leave running in the background.
- `--interval-ms <n>` — override the cadence (only meaningful with `--loop`; for
  tests/CI, not everyday use — the ~20-minute default is comfortably inside the
  60-minute interactive limit even if one beat is missed).

## Notes

- **Re-reads `.goals/.engine` on every beat**, not a snapshot taken at start —
  if you `ibuild engine work` a new task in the same worktree while the loop from
  a previous task is still running, the next beat picks up the new run
  automatically rather than renewing a stale one.
- **Never an error loop.** A beat that can't reach the server logs it and simply
  retries on the next interval; a `--loop` run only ever stops on "the run is
  gone" or "the server says it's already closed" — never on a transient network
  blip.
- **No new write path.** Every beat calls the same run-heartbeat route the fleet
  and `ibuild engine report` / `ibuild engine status` already call — this command
  only decides *when* to call it.
