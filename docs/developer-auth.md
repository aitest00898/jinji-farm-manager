# Developer Cloudflare Authentication

This document applies only to the developer-only Direct REST evaluation
harness. Production Worker authentication and behavior are unchanged.

## Durable source

The harness prefers a dedicated macOS Keychain generic-password item:

```text
service = chicken-line-production-workers-ai
account = default
```

The value is read into process memory only. It is never written to a project
file, environment passed to a child process, ledger, report, or terminal
output. Wrangler OAuth remains a compatibility fallback and is not treated as
a permanent credential.

## One-time provisioning

Create a least-privilege Cloudflare API Token with the approved 90-day
expiration in Cloudflare's own account UI. Do not paste it into Codex, chat, a
shell command argument, `.env`, `.dev.vars`, or a report.

From the project root, use the developer-only stdin bridge below. The prompt is
hidden, the token is not a command-line argument, and the helper prints only a
bounded success/failure status:

```text
read -s 'token?Paste the API token (input hidden): '
print
print -rn -- "$token" | swift scripts/store-ambient-semantic-eval-keychain.swift
unset token
```

If the helper does not report `KEYCHAIN_STORE=PASS`, stop and fix Keychain
access before running any real evaluation. Never downgrade to a plaintext
credential file.

## Runtime policy

- Real evaluation processes retrieve the Keychain value independently in
  memory; they do not receive a token through `env`.
- Account discovery uses an explicitly configured account id first, otherwise
  a bounded authenticated account lookup; it does not depend solely on
  Wrangler `whoami`.
- The developer-only account id is stored separately in
  `config/ambient-semantic-eval-account.json`. It is a non-secret identifier,
  distinct from `LINE_ACCOUNT_ID` and the D1 `database_id`; the auth token is
  never stored in this file.
- Missing or expired credentials produce a bounded auth blocker. There is no
  same-run retry or automatic login/rotation.
- A 90-day API Token still needs deliberate renewal before its expiry; the
  harness must never silently create or rotate one.
