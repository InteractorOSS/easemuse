# /engine-approve

## Plain English

Sign off on a task's **plan** before it starts building — or reject it.

Projects can be set to hold every task for a human OK between investigation and
execution (the "require plan sign-off" project setting). When that's on, a task
that finishes investigation stops and waits, and this is how you release it from
the terminal: approving sends the task on to execution; rejecting cancels it.

If your project doesn't have that setting on, tasks flow straight from
investigation into execution and you'll never need this command.

## When to use

- Someone says "approve the plan for task #N", "the plan for <slug> looks good —
  let it run", or "reject <task>, the scope is wrong".
- A task is waiting for plan sign-off (visible via `engine:status` or on the
  `/attention` page).

People never type this — they say it in natural language and you run the
flow on their behalf (see `.build/CLAUDE.md` §3).

## Prerequisites (one-time)

- A **daemon token** in `.env.local` as `PM_DAEMON_TOKEN=pm_daemon_…` — the same
  token the rest of the local engine loop uses.
  This is the same account **agent token** a Docker fleet uses — not a
  Docker-only or terminal-only secret. On a fresh machine, `ibuild setup`
  (run automatically by the first `ibuild sync`) writes it to `.env.local`
  alongside the project sync token in `.build/.sync` — one command provisions
  both.

## Steps

1. **Approve** the task's plan:
   ```bash
   ibuild engine approve <#N | slug | title-fragment>
   ```
   Resolves the identifier, finds the task's open plan-sign-off pause, and
   releases it → the task advances from investigation to execution.

2. **Reject** instead (cancel the task):
   ```bash
   ibuild engine approve <#N | slug | title-fragment> --reject "reason"
   ```
   The reason is shown in the output; the task is cancelled.

## Failure recovery

- **Nothing waiting for sign-off** → it refuses with a clear message. The task may
  not be at that point yet, or your project doesn't hold tasks for plan sign-off.
  Check with `engine:status`.
- **Ambiguous / not-found identifier** → it prints candidates/suggestions and
  resolves nothing; pick a `#N`/slug.

## Notes

- This command only releases the plan-sign-off hold. The correctness checks —
  tests, security, scope — happen in the task's **review** phase, not here.
- The plan itself (the acceptance criteria) is written by working the
  investigation phase and submitting an `acceptance_criteria` artifact with
  `pm_submit_artifact`. There's no separate plan-drafting command;
  `engine:approve` is just the sign-off.
- Anything else a task can be waiting on (risk, repeated rework, a review
  standoff, an operator action, a question for you) is resolved on the
  `/attention` page, not here.
