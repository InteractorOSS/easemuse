# /engine-review

## Plain English

Run a code review of the **active task's worktree** — correctly. It is the
worktree-aware wrapper around the `/code-review` plugin.

`/code-review` resolves its diff and its file reads against the **current working
directory**. This flow breaks that assumption: `engine:work` puts your changes in
a **sibling git worktree**, but the session's cwd usually stays on your main
checkout (often a stale or detached default branch). Run `/code-review` from
there and its finder sub-agents read the *wrong checkout* — they "discover" that
your new imports or params are missing because they're looking at code that
predates your change.

This step fixes that by (1) resolving the worktree under review, (2)
fetching and diffing against `origin/<default>` (so a stale local base can't
skew the range either), and (3) handing `/code-review` an **absolute** review
root so every finder and verifier reads the worktree, never the primary clone.

## When to use

- You implemented a task in its `engine:work` worktree and want a review before
  the goal's PR goes up.
- ANY time you'd reach for `/code-review` while work lives in a worktree — use
  this instead so the review reads the right checkout.
- If you are NOT in a worktree (a normal single-clone branch), plain
  `/code-review` is fine; this command degrades to that case anyway.

People say it in natural language ("review my changes", "code review this
task") and you run the flow on their behalf.

## Steps

1. **Resolve the worktree under review (`WT`).** In priority order:
   - **An explicit argument** (`#N` / branch / path) → that target. For `#N`,
     resolve the task (`ibuild engine status #N`), derive its branch, and
     match it in `git worktree list`.
   - **cwd is already a linked worktree** → review it. Detect with:
     ```bash
     [ "$(git rev-parse --git-dir)" != "$(git rev-parse --git-common-dir)" ] && echo "in a worktree"
     ```
   - **Otherwise, find it** from the worktree list. This prints `branch  ->  path`
     for every branch-linked worktree (the detached entry is the primary clone and
     is skipped):
     ```bash
     git worktree list --porcelain | awk '/^worktree /{w=$2} /^branch /{sub("refs/heads/","",$2); print $2"  ->  "w}'
     ```
     If the active task is known (the `engine:work` you just ran, or
     `.tasks/.current` in a worktree), match its `task/<slug>` / `goal/<id>`
     branch. If several worktrees are plausible and you can't tell which, **list
     them and ask** — never guess.

   Capture the absolute root and the base branch:
   ```bash
   WT="$(git -C <the-worktree-or-cwd> rev-parse --show-toplevel)"
   DEFAULT="$(git -C "$WT" rev-parse --abbrev-ref origin/HEAD 2>/dev/null | sed 's#^origin/##')"
   DEFAULT="${DEFAULT:-main}"
   ```

2. **Refresh the base + scope the diff.** Fetch so the range can't be skewed by a
   stale local `main`, then show what's under review:
   ```bash
   git -C "$WT" fetch origin "$DEFAULT" --quiet
   git -C "$WT" --no-pager diff "origin/$DEFAULT...HEAD" --stat
   ```
   If the diff is empty, say so and stop — there's nothing to review.

3. **Run `/code-review`, pinned to the worktree.** Invoke the `/code-review`
   skill at the requested effort (default `high`), but prepend this **directive**
   and follow it for every finder and verifier you spawn:

   > **Review root (absolute): `$WT`.** The session cwd may be a *different*
   > checkout — do NOT trust it. Scope the review to
   > `git -C "$WT" diff origin/$DEFAULT...HEAD`. Every finder and verifier MUST
   > Read files by **absolute path** under `$WT/` (e.g. `$WT/src/lib/foo.ts`),
   > never relative paths, and must generate any diff only via `git -C "$WT" …`.
   > A finding that depends on a file's contents is INVALID unless it was read
   > from `$WT`.

   This is the load-bearing step: a finder sub-agent starts in the primary clone,
   so only an absolute `$WT` path guarantees it reads the code you actually
   changed.

4. **Apply / report** as usual for `/code-review` (e.g. `--fix`, `--comment`).
   Cross-check surviving findings against your project's own typecheck command
   (`typecheck_command` in `.build/.config.json`) + the test suite **in the
   worktree** before trusting "missing symbol" style findings — that catch is
   what exposed the wrong-checkout reads on #1062. If the repo declares no
   typecheck command, its test suite alone is the cross-check.

## Notes

- **Why not just `cd` into the worktree?** Because `/code-review`'s finder
  sub-agents don't inherit the parent's transient cwd — they start in the
  session's primary directory. `cd` fixes the main loop's own `git diff`, but
  only an **absolute `$WT` path** fixes the finders. This command does both.
- **Base branch.** `origin/<default>` (resolved from `origin/HEAD`, fallback
  `main`) — the same base the PR will use. Fetching first also fixes the
  *stale-local-base* trap (a primary clone parked on an old/detached `main`).
- **Not in a worktree?** Step 1 falls through to cwd; the command behaves like a
  normal current-branch `/code-review` — no worse than today.
- **Scope.** This wraps the existing `/code-review` plugin; it does not
  re-implement review methodology. If the upstream plugin ever roots its reads at
  the diff target's toplevel, this wrapper becomes unnecessary.
