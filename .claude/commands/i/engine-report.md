# /engine-report

## Plain English

Report the outcome of the run you're working — the step that drives the task
forward. After you've done a phase's work in your AI coding session (and submitted the
deliverable with `pm_submit_artifact`), this says the run is done; the server
advances the task to the next phase, completes it, or pauses it. On a terminal
report it clears `.tasks/.engine` so the next claim isn't blocked.

It's the shared completion step for both `engine:claim` (next in the queue) and
`engine:work` (a task you named).

## When to use

- Someone says "report the run", "mark this phase done", "I finished the
  work", or "release this run" — for a run opened with `engine:claim` /
  `engine:work`.

Developers never type this — they say it in natural language and you run the
flow on their behalf (see `.build/CLAUDE.md` §3).

## Prerequisites

- A claimed run: `.tasks/.engine` is present (written by `engine:claim` /
  `engine:work`). The runId is read from it.
- A **daemon token** in `.env.local` as `PM_DAEMON_TOKEN=pm_daemon_…`.
  This is the same account **agent token** a Docker fleet uses — not a
  Docker-only or terminal-only secret. On a fresh machine, `ibuild setup`
  (run automatically by the first `ibuild sync`) writes it to `.env.local`
  alongside the project sync token in `.build/.sync` — one command provisions
  both.

## Steps

1. **Report success** (drive the task forward):
   ```bash
   ibuild engine report
   ```
   Prints what happened — advanced to the next phase, completed, or paused
   (risk / kickback / review-standoff / operator-action / clarification → resolve
   on `/attention`, or `engine:approve` when it's waiting for plan sign-off). A `clarification`
   pause carries whatever `pm_ask_question` sent it — write that question for a
   non-technical decision-maker (see the `engine-work` step's "Asking a human" note) so the
   `/attention` card is readable, not just triggerable.

2. **Release** a stuck/abandoned run back to the queue instead:
   ```bash
   ibuild engine report --fail "reason"
   ibuild engine report --abandon       # --fail with a default reason
   ```

## Reporting a friction problem — not the same as reporting the run's outcome

`engine:report` (above) tells the engine a PHASE finished — success or failure. A
**friction report** is different: it says "something about the engine itself got in
my way," and it's how a session lives up to `.build/CLAUDE.md` §4 ("not a question
for a human") — a missing credential, a 401/403, a stuck lease, a bridge 409, a
stale worktree are infrastructure failures to REPORT, not decisions to ask a human
about, and not something to silently work around.

- **`pm_report_issue`** (bridge tool) — available in every phase, run or not. Call
  it the moment you hit the friction, with a short `title` and whatever you know:
  `body`, `goalId`, `refusalCode`, `signature`, `command`.
- **`ibuild engine report-issue "<title>"`** — the terminal equivalent, for when
  there's no bridge (or you're scripting). Same flags: `--body`, `--goal`,
  `--fingerprint`, `--refusal-code`, `--signature`, `--command`, `--run-id`,
  `--auto`.

Either one files a deduplicated report on the Build project via a server-side
cross-tenant hop — this session never needs its own access to Build. A repeated
filing of the same fingerprint (or the same `refusalCode`/`signature`/`command`)
REFRESHES one row instead of creating a duplicate, and unless this repo's own
`.build/.config.json` sets `report_issues_local_copy: false`, a linked copy also
lands on this project's own board so you can see it was filed.

This is filing FEEDBACK, not a goal — it never opens a goal or a PR by itself.

## Notes

- The deliverable artifact (e.g. `pr_ref` / `plan` / `acceptance_criteria` /
  `decision_record`) is submitted **during** the session via the bridge's
  `pm_submit_artifact`, not by this command — `engine:report` only reports the
  run's outcome.
- Abandoned interactive runs are also auto-recovered by a server-side reaper
  , so you don't strictly have to `--fail` a run you walked away
  from — though doing so is immediate.
- After a terminal report, `engine:finish` tidies `.tasks/.current` and (with
  `--worktree`) a manual worktree.
