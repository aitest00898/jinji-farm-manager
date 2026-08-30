# Developer Cloudflare Authentication

This document applies only to the developer-only Direct REST evaluation
harness. Production Worker authentication and behavior are unchanged.

## Local secret file

Use one local file at the project root:

```text
.dev.secrets.local
```

Set it up once on the developer machine:

1. Copy `.dev.secrets.local.example` to `.dev.secrets.local`.
2. Edit the local file so it contains `CLOUDFLARE_API_TOKEN=` followed by the
   existing developer token.
3. Run `chmod 600 .dev.secrets.local`.
4. Run the normal developer evaluation command.

The loader accepts UTF-8 text, blank lines, and comment lines beginning with
`#`. It accepts only the `CLOUDFLARE_API_TOKEN` key, rejects duplicate or
malformed entries, rejects whitespace in the value, and fails closed when the
file is missing or grants group/other permissions. It splits on the first
`=` so legitimate later `=` characters remain part of the value.

The value is read directly into the evaluating process's memory, used to build
the request, and never written to a child environment, command argument,
ledger, report, or project file. The normal developer path does not use
Wrangler OAuth, Keychain lookup, environment-based credential loading, or
interactive login as a fallback.

Never commit `.dev.secrets.local` or paste the token into Codex, ChatGPT, a
shell command argument, a log, or a report. Automated tests use temporary
files and synthetic values; the real local file is not required for local
tests.

This 0600 check is for the current local macOS/POSIX workflow. If this loader
is later used in Docker, CI, a container volume, a network filesystem, or
another permission model, review the security semantics for that environment
before reuse.
