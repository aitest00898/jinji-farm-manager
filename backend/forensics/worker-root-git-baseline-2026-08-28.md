# Worker Root Git Baseline — 2026-08-28

## Gate metadata

```text
SOURCE_COMMIT = fc66f4d78d1bcfb6ee3de6eecdb015bc7bff147c
BASELINE_COMMIT = fc66f4d78d1bcfb6ee3de6eecdb015bc7bff147c
RESULT_COMMIT = 19d4462fbd297ae8a25ef667abcdd2f1fd983094
WORKTREE_CLEAN_AT_GATE_START = YES
WORKTREE_CLEAN_AT_GATE_END = YES
PRE_BASELINE_SOURCE_HISTORY = NOT_AVAILABLE
```

## Topology and safety

The Worker root had no Git history before this gate. The nested `web/`
directory remains an independent repository and was not modified, absorbed, or
made a submodule. The root has no remote and no push was performed.

The minimum root `.gitignore` excludes the nested Web repository, local
dependencies, Wrangler/Miniflare state, environment files, logs, temporary
files, local databases, and runtime ledgers. Documentation, forensic reports,
configuration, and frozen Ground Truth remain stageable evidence.

The secret-safe pre-stage audit found no confirmed secret literal in the
baseline candidate. A credential-shaped synthetic test candidate was retained
as test evidence and did not contain a live credential. No credential-bearing
file, `.wrangler/` state, `node_modules/`, `web/`, or `forensics/runtime/`
content entered the root history.

```text
WORKER_ROOT_GIT_INITIALIZED = YES
WEB_NESTED_GIT = PRESENT
WEB_REPO_UNCHANGED = YES
ROOT_GITIGNORE_CREATED = YES
SECRET_LITERAL_FOUND = NO
SAFE_BASELINE_STAGE = PASS
BASELINE_COMMIT_CREATED = YES
BASELINE_WORKTREE_CLEAN = YES
REMOTE_ADDED = NO
PUSH_PERFORMED = NO
```

## Commits

The baseline commit was created exactly with:

```text
baseline: V2.2 clause deterministic convergence before D03 root-cause gate
```

After the baseline, the only functional change in the authorized Case A
result commit was preservation of the original AI input when deterministic
claim count is zero. The result commit is:

```text
19d4462fbd297ae8a25ef667abcdd2f1fd983094 — fix: preserve original AI input when deterministic claim count is zero
```

No Worker-root history before the baseline is inferred by this artifact.
