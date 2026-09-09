# D1 Migration Release Policy

Status: `ENGINEERING_RELEASE_POLICY`

This policy applies to the `chicken-line-production` D1 database. It does not
authorize a Production migration by itself. A Production migration still
requires a separate release approval that names the exact migration and
release candidate.

## Policy

```text
MIGRATION_APPLICATION_METHOD = WRANGLER_D1_MIGRATIONS_APPLY_ONLY
RELEASED_MIGRATION_MUTABILITY = IMMUTABLE
RAW_SQL_PARTIAL_RERUN_REQUIRED = NO
PRE_MIGRATION_RECOVERY_POINT = REQUIRED
FAILURE_MODE = FAIL_CLOSED
RECOVERY_CHOICES = TIME_TRAVEL_RESTORE_OR_FORWARD_FIX
MANUAL_PRODUCTION_SQL_PATCH = FORBIDDEN_UNLESS_SEPARATELY_AUTHORIZED_FORENSIC_EMERGENCY
```

`wrangler d1 migrations apply` is the only normal Production application
mechanism. Once a migration has been released or applied, its file is
immutable. A correction is a new numbered forward migration; the prior file
is never edited in place.

The older diagnostic result that an arbitrary raw-SQL partial rerun is unsafe
remains true historical evidence. It is not a requirement of this canonical
Wrangler lifecycle and is not, by itself, a Production release blocker.

## Future Production preflight

Run from the release candidate checkout, using the database name rather than a
mutable binding alias:

```sh
WRANGLER=./node_modules/.bin/wrangler
DB_NAME=chicken-line-production

"$WRANGLER" --version
"$WRANGLER" d1 info "$DB_NAME" --json
"$WRANGLER" d1 time-travel info "$DB_NAME" --json
"$WRANGLER" d1 migrations list "$DB_NAME" --remote --json
```

Record the bounded outputs as:

```text
PRE_MIGRATION_BOOKMARK = the bookmark returned by d1 time-travel info
PRE_MIGRATION_SCHEMA_STATE = the verified schema/foreign-key snapshot
PENDING_MIGRATION_LIST = the exact Wrangler migration list
```

The bookmark is a recovery reference, not a credential. Do not put tokens,
passwords, or Authorization headers in a release record.

The schema snapshot must be read-only and bounded. At minimum, verify the
current migration tracker and relevant objects with:

```sh
"$WRANGLER" d1 execute "$DB_NAME" --remote --command \
  "SELECT name, type FROM sqlite_master WHERE type IN ('table','index','trigger') ORDER BY type, name; PRAGMA foreign_keys;" \
  --json
```

Do not run `time-travel restore` during preflight. Restore overwrites the
database and requires a separate explicit recovery decision.

## Application and failure decision

After a separate release approval, apply only through:

```sh
"$WRANGLER" d1 migrations apply "$DB_NAME" --remote
```

Then verify, using read-only commands:

```sh
"$WRANGLER" d1 migrations list "$DB_NAME" --remote --json
"$WRANGLER" d1 execute "$DB_NAME" --remote --command \
  "SELECT name, type FROM sqlite_master WHERE name IN ('recording_events','operational_actions','idx_recording_events_lineage','idx_operational_actions_lineage'); PRAGMA foreign_key_check;" \
  --json
```

Decision tree:

```text
migrations apply succeeds
  -> verify schema
  -> verify migration tracker
  -> verify bounded runtime/read paths
  -> continue the separately approved release

migrations apply fails
  -> stop runtime activation and release progression
  -> do not patch Production manually
  -> do not blindly rerun raw SQL
  -> do not edit the released migration
  -> inspect bounded schema and migration-tracker state
  -> choose either:
       A. restore the pre-migration Time Travel recovery point, or
       B. preserve observed state and create a new numbered forward-fix migration
```

The recovery choice must be based on observed state and separately authorized.
No recovery Cron, Worker, Queue, or business-data write is implied by this
policy.
