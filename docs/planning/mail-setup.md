# Sending email and seeing replies: setup

Built for T-5-02 (SMTP) and T-5-12 (connected mailboxes and reply sync), following ADR-009 and ADR-014. Until something below is configured, every agency is in **test mode**: messages are kept in the outbox (Settings, Outbox) and nothing is delivered.

## How an agency chooses (Settings, Defaults, "How email is sent")

| Choice | What happens | What it needs |
|--------|--------------|---------------|
| Test mode (default) | The message stays in the outbox, marked "captured". | Nothing. |
| Test mode with a log line | Same, and a log line without the text. | Nothing. |
| SMTP | Sent through the platform's SMTP service. The visible sender is `MAIL_FROM`, named after the recruiter and the agency; **replies go to the recruiter's own address**. Replies are not seen by EaseMuse. | The five SMTP settings below. |
| Each recruiter's connected mailbox | Sent from the recruiter's own Gmail or Microsoft 365 address. EaseMuse notices replies and stops the sequence. | The Interactor settings below; each recruiter connects once (Settings, My mailbox). |

Choosing SMTP is refused (with a message) while the server has no SMTP settings. A mailbox choice with a recruiter who has not connected fails that send at once with "Connect your mailbox first"; the touch shows as failed so the recruiter can connect or copy the text. No send is ever reported as delivered when nothing left the system.

## SMTP (what to provide)

Environment of the web **and the worker** (the worker sends):

| Variable | Meaning |
|----------|---------|
| `SMTP_HOST` | Host name of the SMTP service. |
| `SMTP_PORT` | 587 (STARTTLS) or 465 (TLS at once). Default 587. |
| `SMTP_USER`, `SMTP_PASSWORD` | Login, if the service needs one. |
| `MAIL_FROM` | The address mail is sent from. The service must allow it (verified domain, SPF/DKIM set up). Required in production anyway. |

The unsubscribe link in outreach email, the opt-out list and the 5-attempt retry with backoff apply as for every transport. A rejected recipient (5xx) or a refused login fails the message at once; a busy server (4xx) or a dropped connection is retried.

## Connected mailboxes (what to provide)

Tokens are never stored by EaseMuse. Sign-in, token storage and refresh belong to Interactor's credential service; we keep only the credential id and the address (`MailConnection`).

1. **Interactor access** (already needed for sign-in): `INTERACTOR_AUTH_CLIENT_ID` and `INTERACTOR_AUTH_CLIENT_SECRET` for an app that may use the credential API (`/api/v1/oauth/initiate`, `/credentials/:id`, `/credentials/:id/token`, `DELETE /credentials/:id`).
2. **Service ids.** `MAILBOX_GOOGLE_SERVICE_ID` and `MAILBOX_MICROSOFT_SERVICE_ID` must be the ids Interactor's service knowledge base uses for Gmail and Microsoft 365 mail. The defaults (`gmail`, `outlook`) are guesses and must be confirmed.
3. **OAuth apps at Interactor** for both services must allow these scopes:
   - Google: `gmail.send`, `gmail.readonly`.
   - Microsoft: `offline_access`, `User.Read`, `Mail.Send`, `Mail.ReadWrite` (Graph needs a draft to send a message and learn its conversation id; `Mail.ReadWrite` covers the draft).
4. **The return address.** After signing in, Interactor sends the person back to `APP_URL/a/<agency>/settings/mailbox?provider=...` with `credential_id` added; `APP_URL` must be the public address of the web app.

The worker runs `mailbox.sync_replies` every 10 minutes (scheduler). For each connected mailbox it reads the *conversations of messages sent from EaseMuse in the last 30 days* from Gmail or Graph and looks only at who wrote each message and when, never at the text. A message from someone other than the recruiter, after the send, is a reply: the touch is marked "replied", the rest of the sequence is cancelled, and the recruiter gets a "Reply to read" task. The recruiter then records what the reply means (interested, not now...), and only that step can move the candidate (brief section 1.1).

If Interactor or the provider stops accepting the sign-in, the mailbox is marked "needs to be connected again" (Settings, My mailbox) and sends fail with that message until the recruiter connects again.

### Not built, and why

- **Interactor "reply" webhooks.** Interactor documents platform webhooks for credential events (`credential.expired`, `credential.revoked`) but no mail-reply event, so replies are found by polling the provider with the recruiter's token. If Interactor adds a reply event, `noteReply` (`server/outreach/replies.ts`) is the one function to call from it. A credential event would only bring forward the "connect again" notice, which the next send or reply check produces anyway.
- **Live checks.** The Gmail and Graph calls follow the providers' documented REST APIs and are tested with recorded responses; they have not been run against real accounts. First live test: connect one mailbox, send one outreach email to yourself, reply to it, wait up to 10 minutes.
