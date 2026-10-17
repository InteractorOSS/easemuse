---
name: engine-goal-files
version: "1.0.0"
description: List or download the current goal's attachments (specs, mockups, sample data) into the worktree so they can actually be read.
---
# /engine-goal-files

## Plain English

Show — and pull onto disk — the files attached to a **goal**: the spec, mockup,
or sample data someone uploaded in the Build web app. The browser download route
is cookie-only, so without this a terminal session simply cannot read them.

By default it reports the current run's goal (resolved from `.goals/.engine`);
pass a goal to inspect a specific one — either its **display number** (`G#2320`,
`#2320` or just `2320`, the number in the web app's goal URL) or its id. With
`--download` the bytes land in `.tasks/attachments/<goalId>/` and your session
can open them by path.

> **Read the attachments before you implement.** A goal that carries a spec or a
> mockup means the written description is deliberately incomplete. Implementing
> without opening them is guessing.

## When to use

- Before starting work on a goal — always, as part of reading the goal.
- The developer says "what's attached to this goal", "download the spec",
  "there's a mockup on the goal".
- The goal text references a document, screenshot, or data file you can't see.

Developers never type this — they say it in natural language and you run the
flow on their behalf (see `.build/CLAUDE.md` §3).

## Prerequisites

- **Nothing**, in the normal case. The fleet and `ibuild engine work` (local)
  **pre-stage** a goal's attachments into `.tasks/attachments/<goalId>/` when
  they set up the run, and a staged read needs neither `.build/.sync` nor any
  token.
- To pass a **display number** (`#2320`) rather than an id you need a **daemon
  token** plus `.build/.sync`, because the number has to be looked up. An id
  needs neither and always works. Without a token, a `#N` argument is refused
  with that advice rather than silently answered about the wrong goal.
- To discover attachments that were *not* staged you need a **daemon token** in
  `.env.local` as `PM_DAEMON_TOKEN=pm_daemon_…` (Build web app → Settings → Agent
  Tokens) plus `.build/.sync` for the base URL. A project **sync** token is not
  enough: it can fetch a known attachment's bytes but cannot discover a goal's
  file ids.

## Steps

### 1. List what's attached

```bash
ibuild engine goal-files
```

- No argument → the current run's goal (from `.goals/.engine`).
- Explicit goal → `ibuild engine goal-files <goalRef>`, where `<goalRef>` is a
  display number (`G#2320` / `#2320` / `2320`), a goal slug or title fragment,
  or a goal id. Anything but an id is resolved through the same lookup
  `ibuild engine goal` and `ibuild engine watch` use.
- Prints each attachment's filename, content type, size, and id — or
  `Goal <id> has no attachments.`, which is a perfectly normal answer.
- If the files are already staged on disk it prints their paths instead and
  makes no network call at all — open them directly.

### 2. Download them into the worktree

```bash
ibuild engine goal-files --download           # current run's goal
ibuild engine goal-files <goalRef> --download # a specific goal (#2320 or an id)
```

Writes each file to `.tasks/attachments/<goalId>/<filename>` (`-d` is a synonym
for `--download`), plus an `index.json` manifest, so a later run holding only a
sync token can enumerate them with no API call.

### 3. Read them, then work

Open the downloaded paths and treat their contents as part of the goal's
requirements before writing any code.

## An unreadable attachment is an INFRA failure — never a design discussion

This is a hard rule, not a preference (it is the same rule as `.build/CLAUDE.md`
§4).

If this command reports any of the following:

- the `ENGINE_ATTACHMENT_INFRA_FAILURE` marker / a `.UNREADABLE` sentinel in
  `.tasks/attachments/<goalId>/` (it exits with a dedicated non-`1` code, `3`),
- an attachment fetch failing with **401 / 403**,
- or that it cannot read or stage the goal's attachments at all,

then the goal HAS attachments whose contents are unknown to this run. That is an
**infrastructure / credentials failure** for an operator to fix (re-upload, fix
the daemon token, re-run so staging retries) — not a scope gap.

**Do:**

1. **Stop.** Do not implement against a guessed spec.
2. Fail the run loudly — `ibuild engine report --fail` — naming the `goalId` and
   quoting the exact error text, so the fleet recognises the signature and can
   re-vend credentials and requeue.

**Do NOT** route it into `pm_request_design_discussion`, `pm_ask_question`, or
any other clarification pause. A clarification round-trip cannot heal a broken
credential, and the server rejects attachment/credential-flavoured design
questions as a backstop.

If the goal genuinely has **no** attachments, the "nothing staged" message is
expected — proceed normally.

## Failure recovery

- **`No goalId given and no active run (.goals/.engine absent)`** — you're not
  inside a claimed run. Pass a goal ref, or claim/open the task first (the
  engine-claim or engine-work step).
- **`Can't look up "#2320" here`** — a display number needs a lookup, and either
  `.build/.sync` or the daemon token is missing. Pass the goal's id instead
  (copy it from the goal's page in the web app, or from the folder names under
  `.tasks/attachments/`), or run with no argument inside a claimed run.
- **"nothing staged on disk and no daemon token available"** — staging didn't
  run or had nothing to stage. Re-run `ibuild engine work` / re-claim so staging
  retries, or set `PM_DAEMON_TOKEN` to list directly. If the goal's work depends
  on an attachment you still can't read, apply the INFRA rule above.
- **`.build/.sync not found`** — this folder isn't linked to a Build project;
  run `ibuild sync` from the project root (or `ibuild sync --paste-token`).

## Notes

- Filenames are basename-stripped before writing, so a server-supplied path can
  never escape `.tasks/attachments/<goalId>/`.
- Resolution order is: **staged manifest on disk** → **daemon-token discovery +
  download** → a clear "can't discover" message. The staged path is what makes
  this work inside a fleet container that holds only a project sync token.
- Related: the engine-work step (stages attachments when it opens a run), the
  engine-goal step, and the engine-report step (`--fail` is how you report the
  infra failure above).
