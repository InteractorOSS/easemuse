# /engine-gates

## Plain English

Run **this repo's own review checks** against the code you have checked out, and
record what they found against the engine run you're holding — from the terminal,
with no fleet machine involved.

A task's **review** phase finishes on the gate reports a fleet machine normally
produces: the test result, the patch-coverage measurement, and one result per
declared check (typecheck, lint, import cycles, integration). Without this, a
hand-driven review has no way to produce them, and the engine parks the task
waiting for a verdict nobody can give it. This runs the **same commands** the
fleet runs (the ones this repo declares in `pm-agent.yaml`) and records the
**same reports**, through the same code.

## When to use

- The developer says "run the checks", "run the gates", "run the review checks",
  "why is my review stuck waiting", or "the review says the gates couldn't run" —
  while holding an engine run on the **review** phase.
- Before `ibuild engine report` on a hand-driven review: the report is what
  applies these results, so record them first.

Developers never type this — they say it in natural language and you run the flow.

## Prerequisites

- A claimed run on the **review** phase: `.goals/.engine` is present (written by
  `ibuild engine work` / `ibuild engine claim`) and its `phase` is `review`. The
  command refuses on any other phase, because there is no review to record a
  verdict for yet.
- A **project sync token** in `.build/.sync` as `BUILD_SYNC_TOKEN=pm_sync_…` —
  the same credential `pm_submit_artifact` uses, and what stamps the reports with
  this run's provenance.
- A **daemon token** in `.env.local` as `PM_DAEMON_TOKEN=pm_daemon_…` — it reads
  the repo's declared commands and keeps the run's lease alive while the suite
  runs. `ibuild setup` (auto-run by the first `ibuild sync`) writes both.
- Run from inside the checkout the run belongs to — the gates grade whatever is
  checked out right here.

## Steps

1. **See what would run**, without running it:
   ```bash
   ibuild engine gates --dry-run
   ```
   Prints the actual commands, which tests it would select and why, and what the
   results would do to the task. Runs nothing, records nothing, exits 0.

2. **Run them**:
   ```bash
   ibuild engine gates --yes
   ```
   **This changes shared state**, so it asks first: in a terminal you're asked to
   continue; with no terminal (a script, or an agent's shell) it refuses unless
   you pass `--yes`. Live output streams to your terminal as it goes.

   When it finishes it prints one line per report — what was graded and how it
   came out — and says which selection ran.

3. **Then report the run** (only once the gates are green):
   ```bash
   ibuild engine report --yes
   ```

## Options

- `--full` — grade the **whole** declared suite instead of only the tests your
  branch's changes affect. Use it when you want the broad answer, or when a
  change's blast radius is wider than its diff suggests.
  You do **not** need it to clear a standing block: if the task still carries a red
  test suite or an open patch-coverage block, the command reads that off the task
  and grades the whole suite anyway, saying so before it starts. (An affected-scope
  green cannot clear either block — the engine refuses a narrow result as evidence
  for one raised by the whole suite — so that round would be spent for nothing.)
  If it cannot reach the task to check, it says so and runs the default selection.
- `--no-setup` — skip the repo's declared install/codegen step and use the
  dependencies already in this checkout. Faster, but a stale dependency tree can
  redden a perfectly good change — so the default runs the setup.
- `--base=<ref>` — diff against `<ref>` instead of this repo's default branch.
  Reach for it when the goal's pull request targets something other than `main`;
  otherwise the coverage measurement is taken against a much bigger diff than the
  one under review.

## Notes

- **The whole loop, end to end:** the gates are the review phase's middle step —
  open the run with the engine-work step, record deliverables with the
  engine-artifact step, then report with the engine-report step.
- **Re-runnable, by design.** Fix what failed and run it again — the newest report
  for each gate is the one that counts. No flag, no cleanup, nothing to undo. This
  is why it is its own verb rather than a flag on `ibuild engine report`: running
  the checks is not reporting.
- **A gate this repo declares no command for runs nothing and records nothing.**
  Silence means "not graded" — never "passed". If the repo declares no gate
  commands at all, the command refuses rather than record a green report for
  commands that never ran; declare them in `pm-agent.yaml` and try again.
- **A red gate is recorded.** It becomes a must-fix finding the task cannot
  complete over — the same one a fleet run would have raised. That is the point:
  fix the code, run `ibuild engine gates --yes` again, and the newer report
  replaces it.
- **Exit code**: 0 when every gate that ran came back green, 1 when one came back
  red or when nothing ran at all. The reports are recorded either way — the
  summary says so in words, so don't read the exit code as "nothing was sent".
- **It runs in your environment, minus what would grade the machine.** The commands
  see your shell and whatever `.env` files your suite already reads — not the fleet
  container's stored environment. If the repo declares environment variables this
  shell doesn't set, the preview says so before you commit to the run.
  Four things are WITHHELD, the same list the fleet's own gate withholds: `*_API_KEY`,
  `*_AUTH_TOKEN`, the `ANTHROPIC_*` / `CLAUDE_*` / `CLAUDECODE` namespaces, and
  `GIT_CONFIG*`. A gate grades your diff, and an ambient git-config override (or a
  provider key a suite happens to read) makes it grade your laptop instead. The run
  names the withheld variables once, by name only, so you can see what it took.
  `PM_HERMETIC_GATE_ENV_DISABLED=1` turns it off if your suite genuinely needs one
  of them.
  This applies to the commands that GRADE. The repo's declared install/codegen step
  still sees your whole shell, because an install may legitimately need a registry
  token or a git `url.insteadOf` rewrite — so a variable that breaks *setup* is
  still yours to unset.
- **It keeps the run alive.** A full suite takes minutes. This checks in while it
  runs, and stops early (recording nothing) if the run has already been closed —
  rather than spending ten more minutes grading a run that can't accept the result.
- **It grades your branch MERGED WITH ITS BASE, the same tree CI grades.** CI
  checks out the pull request's merge commit, so a gate run against the bare branch
  answers a different question. So before the declared commands run, the run merges
  the base into the checkout, and resets it back out afterwards. It says which it
  did on the line above the suite, and the recorded `test_report` carries a
  `gateTree` block saying the same thing (`merged` / `up_to_date` / `branch` plus
  the reason it fell back).
  **A checkout with uncommitted changes to tracked files refuses the merge** and
  grades the bare branch instead, naming the files — putting the tree back is a hard
  reset, and your unstaged work is not the gate's to discard. A merge conflict, an
  unreachable base or any git error falls back the same way; none of them reds a gate.
  `PM_GATE_MERGE_BASE_DISABLED=1` skips the merge entirely and grades the bare branch,
  at the cost of a result that can disagree with CI at the same head.
- **Commit before you start, and don't edit while it runs.** The reset at the end
  is a hard reset of the checkout: edits made mid-run are lost.
- **Ctrl-C is safe.** A gate that didn't finish records nothing, and your commits are
  never touched. Interrupting inside the brief merge window is the one case that can
  leave the base merged into your checkout: `git status` shows it, and
  `git reset --hard ORIG_HEAD` (or your branch's head sha) puts it back.
