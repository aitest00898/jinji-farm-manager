# Ambient V2.2 Provider Parity Gate — 2026-08-28

## Scope

This gate was limited to the developer-only V2.2 Worker AI binding seam. It
did not run a provider request, DEV-SMOKE, LINE test, Shadow route, Active
route, Candidate flow, official write, migration, or deployment.

## Source evidence

```text
V2_2_REQUEST_BUILDER = src/ambient-extraction-v2-2.ts:729-736
DIRECT_REST_ADAPTER = src/ambient-semantic-eval-rest.ts:259-331
WORKER_BINDING_SEAM = src/ambient.ts:2438-2445
DEVELOPER_RUNTIME_ROUTE = src/index.ts:9537-9584
WORKER_INPUT_TYPE = node_modules/@cloudflare/workers-types/index.d.ts:5785-5803
V2_2_PRODUCTION_IMPORT_GUARD = src/ambient-extraction-v2-2.test.ts
```

The existing application request type originally contained only
`messages`, `max_tokens`, and `temperature`. The developer-only seam now also
allows the V2.2 `response_format` and `stream` fields; existing Production V1
request construction remains unchanged.

The developer runtime route accepts only the pinned model, the exact V2.2
request key set, the fixed settings, valid two-message roles/content, and the
existing `AMBIENT_V2_2_STRUCTURED_RESPONSE_FORMAT`. It returns the binding
result without converting it to the historical V1 `decisions[]` path.

## Local gate

```text
TYPESCRIPT = PASS
TARGETED_PROVIDER_PARITY_AND_V2_2_TESTS = PASS (37 passed)
FULL_VITEST = PASS (715 passed / 11 skipped)
GIT_DIFF_CHECK = PASS
COMMIT = 5084568
```

The existing working tree had unrelated pre-existing changes in
`docs/current-execution-state.md` and two V2.2 forensic files. They were not
included in the parity commit.

## Remote execution isolation decision

The source and historical reports identify an ephemeral
`wrangler dev --remote` route that calls `env.AI.run` and is gated by
`RUNTIME_AMBIENT_SEMANTIC_EVAL_ENABLED` plus the runtime test authorization.
However, the current project has no named preview/environment target or
package launcher for a separately isolated Worker. The current Wrangler
configuration binds a remote Production D1 and Queue, while the installed
Wrangler help describes `--remote` as running on the global network with
access to Production resources. The route itself does not call D1, Queue,
Candidate, or LINE, but safe non-Production resource isolation was not proven.

Under the project instruction that developer evaluation cannot pass a secret
through a child environment or fall back to an unapproved Wrangler
credential path, the remote request was not started.

```text
NON_PRODUCTION_REMOTE_AI_BINDING_PATH_EXISTS = HISTORICAL_ROUTE_ONLY
CURRENT_SAFE_NON_PRODUCTION_LAUNCHER = NOT_PROVEN
REQUIRES_SOURCE_DEPLOYMENT = YES
REQUIRES_PRODUCTION_WORKER_DEPLOYMENT = NO
PARITY_EXECUTION_BLOCKED_BY_PRODUCTION_DEPLOYMENT = NO
PARITY_EXECUTION_BLOCKER = SAFE_NON_PRODUCTION_REMOTE_LAUNCHER_NOT_PROVEN
```

## Provider result

```text
PROVIDER_ATTEMPTS = 0
HTTP_RESPONSES = 0
PROVIDER_CONFIRMATIONS = 0
CONFIRMED_INFERENCE_CALLS = 0
WORKER_BINDING_REQUEST_SENT = NO
WORKER_BINDING_STRUCTURED_REQUEST_ACCEPTED = NOT_RUN
REQUEST_RESPONSE_FORMAT_PRESERVED = NOT_RUN
V2_2_RESPONSE_BOUNDARY_REACHED = NOT_RUN
WORKER_BINDING_RESPONSE_CLASS = NOT_RUN
V2_2_STRUCTURAL_STATUS = NOT_RUN
D03_FACT_EXTRACTION = NOT_RUN
DIRECT_REST_VS_AI_BINDING_REQUEST_PARITY = NOT_PROVEN
DIRECT_REST_VS_AI_BINDING_RESPONSE_PARITY = NOT_PROVEN
STRUCTURED_OUTPUT_BINDING_PARITY = NOT_PROVEN
PARITY_FAILURE_LAYER = NOT_RUN
RETRIES = 0
```

## Safety and next gate

```text
LINE_SEND = 0
CANDIDATE_WRITE = 0
OPERATIONAL_OFFICIAL_WRITE = 0
ABNORMAL_OFFICIAL_WRITE = 0
FINANCE_WRITE = 0
QUEUE_BUSINESS_WRITE = 0
MIGRATION = NONE
PRODUCTION_DEPLOYMENT = NOT_DONE
HISTORICAL_TRANSPORT_FAIL_PRESERVED = YES
CURRENT_EFFECTIVE_DEV_SMOKE = PASS
READY_FOR_TEST_GROUP_SHADOW = BLOCKED
READY_FOR_HUMAN_PRODUCTION_PATH_ACCEPTANCE = NO
READY_FOR_PRODUCTION_ACTIVATION = NO
```

The next action requires an explicitly approved, genuinely isolated
non-Production Worker-binding execution mechanism. This gate does not
authorize Production deployment, Shadow, Active Route, another provider
request, or human LINE acceptance.

## Local Worker + remote AI-only parity attempt — 2026-08-28 (latest)

This follow-up used the dedicated parity configuration and the minimal
developer-only entrypoint added in commit `b02d62e2bc9e1c2033dbff81792cfed79474c7b9`.
The three read-only audits all passed. The static isolation tests passed and
the effective Wrangler startup output showed only the `AI` remote binding and
the non-secret parity flag. No Production D1, Queue, LINE, route, or cron
binding was loaded.

The local Worker listener was confirmed on `127.0.0.1:8787`; no tunnel or
public listener was active. The single localhost D03 route request was made,
but Wrangler's remote AI proxy session stopped during authorization-code
initialization. The bounded failure class is `REMOTE_BINDING_AUTH`. The
Worker therefore did not reach `env.AI.run`; no Workers AI inference request,
provider response, or response-boundary evaluation occurred.

```text
SUBAGENT_A = PASS
SUBAGENT_B = PASS
SUBAGENT_C = PASS
WRANGLER_VERSION = 4.124.0
REMOTE_BINDING_VERSION_MINIMUM = 4.37.0
WRANGLER_VERSION_GATE = PASS
LOCAL_WORKER_EXECUTION_AVAILABLE = YES
PER_BINDING_REMOTE_SUPPORTED = YES
WORKERS_AI_REMOTE_BINDING_SUPPORTED = YES
WORKERS_AI_LOCAL_SIMULATION_AVAILABLE = NO
AI_SELECTIVE_REMOTE_SUPPORTED = YES
WRANGLER_DEV_REMOTE_ALLOWED = NO
WRANGLER_DEV_LOCAL_FLAG_ALLOWED_FOR_THIS_GATE = NO
DEDICATED_PARITY_CONFIG_FEASIBLE = YES
DEDICATED_PARITY_CONFIG_USED = YES
PARITY_CONFIG_PATH = wrangler.parity.jsonc
AI_REMOTE_EXPLICIT = YES
AI_REMOTE_VALUE = TRUE
PRODUCTION_D1_DECLARED_IN_PARITY_CONFIG = NO
PRODUCTION_QUEUE_DECLARED_IN_PARITY_CONFIG = NO
LINE_BINDING_DECLARED_IN_PARITY_CONFIG = NO
OTHER_PRODUCTION_WRITE_BINDING_DECLARED = NO
ROUTES_DECLARED = NO
CRONS_DECLARED = NO
PARITY_ROUTE_REQUIRES_AI = YES
PARITY_ROUTE_REQUIRES_DB = NO
PARITY_ROUTE_REQUIRES_QUEUE = NO
PARITY_ROUTE_REQUIRES_LINE = NO
PARITY_ROUTE_REQUIRES_CANDIDATE = NO
PARITY_ROUTE_REQUIRES_OFFICIAL_WRITE_PATH = NO
PARITY_ROUTE_REQUIRES_ONLY_AI = YES
FULL_INDEX_SAFE_WITH_AI_ONLY_CONFIG = NO
DEDICATED_LOCAL_PARITY_ENTRYPOINT_REQUIRED = YES
LOCAL_REMOTE_AI_PARITY_ISOLATION = NOT_PROVEN
PARITY_CONFIG_ACTUALLY_LOADED = YES
WORKER_EXECUTION_LOCATION = LOCAL
DEV_SERVER_LISTENER = 127.0.0.1
PUBLIC_TUNNEL_ACTIVE = NO
REMOTE_BINDINGS = AI_ONLY
REMOTE_AI_BINDING = YES
REMOTE_D1_BINDING = NO
REMOTE_QUEUE_BINDING = NO
REMOTE_OTHER_WRITE_BINDING = NO
TYPESCRIPT = PASS
TARGETED_PROVIDER_PARITY_TESTS = PASS
V2_2_TARGETED = PASS
FULL_VITEST = PASS
GIT_DIFF_CHECK = PASS
PARITY_ROUTE_DB_ACCESS_TEST = PASS
PARITY_ROUTE_QUEUE_ACCESS_TEST = PASS
PARITY_ROUTE_LINE_ACCESS_TEST = PASS
PARITY_ROUTE_CANDIDATE_ACCESS_TEST = PASS
PARITY_ROUTE_OFFICIAL_WRITE_ACCESS_TEST = PASS
PARITY_ISOLATION_COMMIT = b02d62e2bc9e1c2033dbff81792cfed79474c7b9
PROVIDER_ATTEMPTS = 0
HTTP_RESPONSES = 0
PROVIDER_CONFIRMATIONS = 0
CONFIRMED_INFERENCE_CALLS = 0
WORKER_BINDING_REQUEST_SENT = NO
PROVIDER_RESPONSE_CONFIRMED = NOT_RUN
REQUEST_RESPONSE_FORMAT_PRESENT = NOT_RUN
REQUEST_RESPONSE_FORMAT_PRESERVED = NOT_RUN
WORKER_BINDING_RESPONSE_VALUE_TYPE = NOT_RUN
V2_2_RESPONSE_BOUNDARY_REACHED = NOT_RUN
V2_2_RESPONSE_CLASS = NOT_RUN
V2_2_STRUCTURAL_STATUS = NOT_RUN
D03_FACT_EXTRACTION = NOT_RUN
DIRECT_REST_VS_AI_BINDING_REQUEST_PARITY = NOT_PROVEN
DIRECT_REST_VS_AI_BINDING_RESPONSE_PARITY = NOT_PROVEN
STRUCTURED_OUTPUT_BINDING_PARITY = NOT_PROVEN
PARITY_FAILURE_LAYER = REMOTE_BINDING_AUTH
EXPECTED_PARITY_SIDE_EFFECT = NONE
RETRIES = 0
PRODUCTION_WORKER_VERSION_CHANGED = NO
PRODUCTION_ROUTES_CHANGED = NO
PRODUCTION_TRAFFIC_CHANGED = NO
PRODUCTION_D1_REMOTE_ACCESS = 0
PRODUCTION_QUEUE_REMOTE_ACCESS = 0
LINE_SEND = 0
CANDIDATE_WRITE = 0
OPERATIONAL_OFFICIAL_WRITE = 0
ABNORMAL_OFFICIAL_WRITE = 0
FINANCE_WRITE = 0
MIGRATION = NONE
PRODUCTION_DEPLOYMENT = NOT_DONE
HISTORICAL_TRANSPORT_FAIL_PRESERVED = YES
CURRENT_EFFECTIVE_DEV_SMOKE = PASS
NEXT_SINGLE_GATE = WRANGLER_AUTH_DECISION
READY_FOR_TEST_GROUP_SHADOW = BLOCKED
READY_FOR_HUMAN_PRODUCTION_PATH_ACCEPTANCE = NO
READY_FOR_PRODUCTION_ACTIVATION = NO
```

The request did not reach the provider binding, so this result neither
proves nor disproves Direct REST versus `env.AI` response parity. It also does
not authorize another provider request, an Auth change, Shadow, Active Route,
LINE testing, Production writes, or deployment. Any future auth action must
be separately authorized; no credential was printed or persisted here.

## Wrangler device-login parity attempt — 2026-08-29 (latest)

The project-local Wrangler version remained `4.124.0`. The one authorized
`login --device` attempt failed before a device URL or user code was issued:
the environment could not resolve Cloudflare's API hostname. No OAuth session
was created or changed. Per the gate stop rule, no second login, fallback auth
path, parity Worker startup, localhost route request, or provider request was
performed.

```text
WRANGLER_VERSION = 4.124.0
WRANGLER_DEVICE_LOGIN = FAIL
WRANGLER_AUTH_SOURCE = OAUTH_DEVICE_FLOW_SESSION
WRANGLER_REMOTE_BINDING_AUTH = NOT_RUN
DEV_SECRETS_LOCAL_USED_THIS_GATE = NO
DIRECT_REST_AUTH_EVALUATED_THIS_GATE = NO
PARITY_CONFIG_ACTUALLY_LOADED = NOT_RUN
WORKER_EXECUTION_LOCATION = NOT_RUN
DEV_SERVER_LISTENER = NOT_RUN
REMOTE_BINDINGS = NOT_RUN
REMOTE_AI_BINDING = NOT_RUN
REMOTE_D1_BINDING = NOT_RUN
REMOTE_QUEUE_BINDING = NOT_RUN
PUBLIC_TUNNEL_ACTIVE = NOT_RUN
LOCAL_PARITY_ROUTE_REQUESTS = 0
PROVIDER_ATTEMPTS = 0
PROVIDER_CONFIRMATIONS = 0
CONFIRMED_INFERENCE_CALLS = 0
WORKER_BINDING_REQUEST_SENT = NO
PROVIDER_RESPONSE_CONFIRMED = NOT_RUN
REQUEST_RESPONSE_FORMAT_PRESENT = NOT_RUN
REQUEST_RESPONSE_FORMAT_PRESERVED = NOT_RUN
WORKER_BINDING_RESPONSE_VALUE_TYPE = NOT_RUN
V2_2_RESPONSE_BOUNDARY_REACHED = NOT_RUN
V2_2_RESPONSE_CLASS = NOT_RUN
V2_2_STRUCTURAL_STATUS = NOT_RUN
D03_FACT_EXTRACTION = NOT_RUN
DIRECT_REST_VS_AI_BINDING_REQUEST_PARITY = NOT_PROVEN
DIRECT_REST_VS_AI_BINDING_RESPONSE_PARITY = NOT_PROVEN
STRUCTURED_OUTPUT_BINDING_PARITY = NOT_PROVEN
FAILURE_LAYER = WRANGLER_DEVICE_LOGIN
RETRIES = 0
WRANGLER_OAUTH_SESSION_CHANGE = NO
EXPECTED_PARITY_SIDE_EFFECT = NONE
PRODUCTION_D1_REMOTE_ACCESS = 0
PRODUCTION_QUEUE_REMOTE_ACCESS = 0
LINE_SEND = 0
CANDIDATE_WRITE = 0
OPERATIONAL_OFFICIAL_WRITE = 0
ABNORMAL_OFFICIAL_WRITE = 0
FINANCE_WRITE = 0
MIGRATION = NONE
PRODUCTION_DEPLOYMENT = NOT_DONE
CODE_CHANGED = NO
CONFIG_CHANGED = NO
CURRENT_EFFECTIVE_DEV_SMOKE = PASS
READY_FOR_TEST_GROUP_SHADOW = BLOCKED
READY_FOR_HUMAN_PRODUCTION_PATH_ACCEPTANCE = NO
READY_FOR_PRODUCTION_ACTIVATION = NO
NEXT_SINGLE_GATE = WRANGLER_DEVICE_LOGIN_FAILURE_ANALYSIS
```

This gate stops here. The failure does not establish a Workers AI or model
failure, and no credential content was printed or persisted.

## DNS pre-auth resolution analysis — 2026-08-29 (latest)

The previous bounded Wrangler error named `api.cloudflare.com` or
`dash.cloudflare.com` but did not distinguish them. Static inspection of the
installed Wrangler device-flow path shows that the default auth domain is
`dash.cloudflare.com`, and no `WRANGLER_AUTH_DOMAIN` override was present in
the checked process. This identifies the failed hostname without repeating
the login command.

Read-only tests found no system-resolver answers for `dash.cloudflare.com`,
`api.cloudflare.com`, `www.cloudflare.com`, or `example.com`. Direct DNS
queries to `1.1.1.1` and `8.8.8.8` also returned no bounded answer for
`dash.cloudflare.com`. `scutil --dns` was not readable in this environment,
so resolver count and VPN-scoped resolver status remain `UNKNOWN`. `scutil
--proxy` reported no enabled proxy or PAC, and `/etc/hosts` had no matching
Cloudflare override. No HTTP/API/provider request was made.

```text
FAILED_HOSTNAME = dash.cloudflare.com
FAILED_RESOLUTION_ERROR = DNS_RESOLUTION_FAILURE
AUTHENTICATION_REACHED = NO
CREDENTIAL_EVALUATED = NO
OAUTH_SESSION_CHANGED = NO
ACTIVE_DNS_RESOLVER_COUNT = UNKNOWN
VPN_SCOPED_RESOLVER_PRESENT = UNKNOWN
PROXY_ENABLED = NO
PAC_ENABLED = NO
HOSTS_OVERRIDE_PRESENT = NO
FAILED_HOST_SYSTEM_RESOLUTION = FAIL
CLOUDFLARE_DASH_RESOLUTION = FAIL
CLOUDFLARE_WWW_RESOLUTION = FAIL
GENERAL_CONTROL_RESOLUTION = FAIL
CLOUDFLARE_PUBLIC_DNS = FAIL
GOOGLE_PUBLIC_DNS = FAIL
CURRENT_DNS_STATE = FAIL
PREVIOUS_FAILURE_CLASS = GENERAL_DNS_FAILURE
ROOT_CAUSE_CLASS = BROADER_NETWORK_OR_DNS_REACHABILITY
CODE_CHANGED = NO
CONFIG_CHANGED = NO
AUTH_CHANGED = NO
NETWORK_CONFIGURATION_CHANGED = NO
WRANGLER_LOGIN_ATTEMPTS = 0
PROVIDER_ATTEMPTS = 0
WORKERS_AI_CALLS = 0
PRODUCTION_D1_REMOTE_ACCESS = 0
PRODUCTION_QUEUE_REMOTE_ACCESS = 0
LINE_SEND = 0
PRODUCTION_DEPLOYMENT = NOT_DONE
STRUCTURED_OUTPUT_BINDING_PARITY = NOT_PROVEN
READY_FOR_TEST_GROUP_SHADOW = BLOCKED
READY_FOR_HUMAN_PRODUCTION_PATH_ACCEPTANCE = NO
READY_FOR_PRODUCTION_ACTIVATION = NO
NEXT_SINGLE_GATE = LOCAL_NETWORK_RESOLUTION_REPAIR_DECISION
```

This was a read-only pre-auth audit. No DNS, proxy, VPN, Tailscale, WARP,
hosts, Auth, source, config, or Production state was changed.

## Host vs Codex network-boundary confirmation — 2026-08-29 (latest)

The earlier DNS results were collected inside the restricted Codex command
environment. A single approved host-level, read-only execution then tested
only the two requested host lookups and summarized `scutil --dns` without
retaining its private network details.

The host resolved both `example.com` and `dash.cloudflare.com`, with resolver
information available. This contrasts with the Codex sandbox, where both
system and public DNS tests failed. The differential confirms an execution
network boundary rather than a demonstrated macOS DNS failure. No DNS,
network, VPN, proxy, hosts, Auth, source, config, or Production setting was
changed.

```text
CODEX_SANDBOX_ACTIVE = YES
CODEX_NETWORK_ACCESS = RESTRICTED
CODEX_CAN_REQUEST_ONE_TIME_UNSANDBOXED_COMMAND = YES
CODEX_SANDBOX_DNS = FAIL
HOST_CONTROL_EXECUTED = YES
HOST_CONTROL_EXECUTION_MODE = ONE_TIME_UNSANDBOXED
HOST_EXAMPLE_COM_RESOLUTION = PASS
HOST_DASH_CLOUDFLARE_COM_RESOLUTION = PASS
HOST_DNS_RESOLVER_AVAILABLE = YES
HOST_DNS_RESOLVER_COUNT = 11
HOST_DNS_SERVER_COUNT = 8
HOST_VPN_SCOPED_RESOLVER_PRESENT = YES
MAC_HOST_DNS = PASS
NETWORK_BOUNDARY_DIFFERENTIAL = CONFIRMED
ROOT_CAUSE_CLASS = CODEX_EXECUTION_NETWORK_BOUNDARY
LOCAL_NETWORK_REPAIR_REQUIRED = NO
AUTH_CHANGED = NO
NETWORK_CONFIGURATION_CHANGED = NO
WRANGLER_LOGIN_ATTEMPTS = 0
PROVIDER_ATTEMPTS = 0
WORKERS_AI_CALLS = 0
CODE_CHANGED = NO
CONFIG_CHANGED = NO
PRODUCTION_DEPLOYMENT = NOT_DONE
STRUCTURED_OUTPUT_BINDING_PARITY = NOT_PROVEN
READY_FOR_TEST_GROUP_SHADOW = BLOCKED
READY_FOR_HUMAN_PRODUCTION_PATH_ACCEPTANCE = NO
READY_FOR_PRODUCTION_ACTIVATION = NO
NEXT_SINGLE_GATE = ONE_TIME_NETWORK_ENABLED_PARITY_EXECUTION
```

The DNS gate stops here. It does not authorize DNS repair, another login,
parity execution, provider calls, Shadow, Active Route, or deployment.

## One-time network-enabled Worker-AI parity execution — 2026-08-29 (latest)

The host/network boundary was used after the prior DNS differential was
confirmed. The single Wrangler device login completed successfully. The
existing dedicated parity config was loaded and Wrangler reported a local
Worker with only the explicit remote `AI` binding; no D1, Queue, LINE, route,
or cron binding was present.

The local Worker did not reach a listener. During local runtime startup,
workerd rejected the dedicated entrypoint because it exposes named constant
exports that are interpreted as service entries rather than handlers. This
is a source-level implementation issue, not a provider, model, schema, or
credential result. Per the gate, no source/config fix, second login, second
Worker start, localhost D03 request, or provider request was made.

```text
ROOT_CAUSE_PREVIOUS_NETWORK_FAILURE = CODEX_EXECUTION_NETWORK_BOUNDARY
MAC_HOST_DNS = PASS
HOST_NETWORK_ENABLED_EXECUTION_USED = YES
DEVICE_FLOW_CODE_ISSUED = YES
HUMAN_DEVICE_AUTH_COMPLETED = YES
WRANGLER_DEVICE_LOGIN = PASS
WRANGLER_AUTH_SOURCE = OAUTH_DEVICE_FLOW_SESSION
DEV_SECRETS_LOCAL_USED_THIS_GATE = NO
DIRECT_REST_AUTH_EVALUATED_THIS_GATE = NO
PARITY_CONFIG_ACTUALLY_LOADED = YES
WORKER_EXECUTION_LOCATION = LOCAL
DEV_SERVER_LISTENER = NOT_RUN
PUBLIC_TUNNEL_ACTIVE = NO
REMOTE_BINDINGS = AI_ONLY
REMOTE_AI_BINDING = YES
REMOTE_D1_BINDING = NO
REMOTE_QUEUE_BINDING = NO
REMOTE_OTHER_WRITE_BINDING = NO
LOCAL_PARITY_ROUTE_REQUESTS = 0
PROVIDER_ATTEMPTS = 0
PROVIDER_CONFIRMATIONS = 0
CONFIRMED_INFERENCE_CALLS = 0
WORKER_BINDING_REQUEST_SENT = NO
PROVIDER_RESPONSE_CONFIRMED = NOT_RUN
REQUEST_RESPONSE_FORMAT_PRESENT = NOT_RUN
REQUEST_RESPONSE_FORMAT_PRESERVED = NOT_RUN
WORKER_BINDING_RESPONSE_VALUE_TYPE = NOT_RUN
V2_2_RESPONSE_BOUNDARY_REACHED = NOT_RUN
V2_2_RESPONSE_CLASS = NOT_RUN
V2_2_STRUCTURAL_STATUS = NOT_RUN
D03_FACT_EXTRACTION = NOT_RUN
DIRECT_REST_VS_AI_BINDING_REQUEST_PARITY = NOT_PROVEN
DIRECT_REST_VS_AI_BINDING_RESPONSE_PARITY = NOT_PROVEN
STRUCTURED_OUTPUT_BINDING_PARITY = NOT_PROVEN
FAILURE_LAYER = LOCAL_WRANGLER_LAUNCH
UNEXPECTED_IMPLEMENTATION_CHANGE_REQUIRED = YES
RETRIES = 0
WRANGLER_OAUTH_SESSION_CHANGE = YES
WORKERS_AI_USAGE = 0
PRODUCTION_D1_REMOTE_ACCESS = 0
PRODUCTION_QUEUE_REMOTE_ACCESS = 0
LINE_SEND = 0
CANDIDATE_WRITE = 0
OPERATIONAL_OFFICIAL_WRITE = 0
ABNORMAL_OFFICIAL_WRITE = 0
FINANCE_WRITE = 0
MIGRATION = NONE
PRODUCTION_DEPLOYMENT = NOT_DONE
CODE_CHANGED = NO
CONFIG_CHANGED = NO
CURRENT_EFFECTIVE_DEV_SMOKE = PASS
READY_FOR_TEST_GROUP_SHADOW = BLOCKED
READY_FOR_HUMAN_PRODUCTION_PATH_ACCEPTANCE = NO
READY_FOR_PRODUCTION_ACTIVATION = NO
NEXT_SINGLE_GATE = PARITY_IMPLEMENTATION_REVIEW
```

The parity gate stops before provider execution. The named-export entrypoint
issue requires explicit implementation review; it does not authorize a
source change, a retry, Shadow, Active Route, LINE testing, or deployment.

## Wrangler local filesystem EPERM analysis — 2026-08-29

This read-only analysis uses the previously captured launch output and the
installed Wrangler 4.124.0/Miniflare sources. The first EPERM occurred while
Wrangler tried to open its debug log before the local workerd listener was
ready. The same launch then hit a second EPERM while opening the dev-registry
entry. No Worker was restarted and no network or provider request was made by
this analysis.

```text
EPERM_SYSCALL = open
EPERM_PATH = /Users/joe/Library/Preferences/.wrangler/logs/wrangler-2026-08-28_23-46-19_306.log
EPERM_PATH_CLASS = WRANGLER_LOG
EPERM_OCCURRED_BEFORE_WORKERD_READY = YES
SECONDARY_EPERM_SYSCALL = open
SECONDARY_EPERM_PATH = /Users/joe/Library/Preferences/.wrangler/registry/chicken-line-v2-2-ai-parity-local
SECONDARY_EPERM_PATH_CLASS = WRANGLER_DEV_REGISTRY
WRANGLER_LOG_PATH_SUPPORTED = YES
WRANGLER_LOG_PATH_SOURCE = node_modules/wrangler/wrangler-dist/cli.js:61278
DEFAULT_WRANGLER_LOG_PATH = <global-wrangler-config>/logs/wrangler-YYYY-MM-DD_HH-mm-ss_SSS.log
LOG_WRITE_IS_PRIMARY_BLOCKER = YES
DEV_REGISTRY_ENABLED = YES
DEV_REGISTRY_PATH = /Users/joe/Library/Preferences/.wrangler/registry
DEV_REGISTRY_WRITE_REQUIRED_BY_CURRENT_CLI = YES
PARITY_WORKER_HAS_SERVICE_BINDINGS = NO
PARITY_WORKER_NEEDS_CROSS_WORKER_DISCOVERY = NO
DISABLE_DEV_REGISTRY_API_EXISTS = YES
CLI_DISABLE_DEV_REGISTRY_OPTION_EXISTS = NO
CONFIG_DISABLE_DEV_REGISTRY_OPTION_EXISTS = NO
PATH_EXISTS = NO
PARENT_EXISTS = YES
OWNER_IS_CURRENT_USER = YES
POSIX_MODE = 0755
ACL_PRESENT = NO
CURRENT_USER_POSIX_WRITE_BIT = YES
PROJECT_WORKSPACE_WRITE_ALLOWED = YES
EPERM_PARENT_INSIDE_ALLOWED_WRITE_ROOT = NO
CODEX_FILESYSTEM_RESTRICTION_CAN_EXPLAIN_EPERM = YES
MULTIPLE_WRANGLER_HOME_WRITE_PATHS_AT_RISK = YES
PROJECT_LOCAL_LOG_REDIRECT_FEASIBLE = YES
SUPPORTED_REGISTRY_PATH_OVERRIDE = YES
REGISTRY_PATH_OVERRIDE_MECHANISM = WRANGLER_REGISTRY_PATH
BOUNDED_HOME_WRANGLER_WRITE_APPROVAL_FEASIBLE = YES
ROOT_CAUSE_CLASS = CODEX_FILESYSTEM_SANDBOX_BOUNDARY
SOURCE_CHANGED = NO
CONFIG_CHANGED = NO
FILESYSTEM_CHANGED = NO
AUTH_CHANGED = NO
NETWORK_REQUESTS = 0
WRANGLER_WORKER_START_ATTEMPTS = 0
LOCAL_PARITY_ROUTE_REQUESTS = 0
PROVIDER_ATTEMPTS = 0
WORKERS_AI_CALLS = 0
STRUCTURED_OUTPUT_BINDING_PARITY = NOT_PROVEN
READY_FOR_TEST_GROUP_SHADOW = BLOCKED
READY_FOR_HUMAN_PRODUCTION_PATH_ACCEPTANCE = NO
READY_FOR_PRODUCTION_ACTIVATION = NO
NEXT_SINGLE_GATE = PROJECT_LOCAL_WRANGLER_LOG_PARITY_EXECUTION
```

Source evidence: Wrangler derives the macOS global config directory from the
XDG config path and uses `WRANGLER_LOG_PATH` for the log directory
(`node_modules/wrangler/wrangler-dist/cli.js:61278`). It recognizes
`WRANGLER_REGISTRY_PATH` and otherwise uses the global config directory's
`registry` child (`node_modules/wrangler/wrangler-dist/cli.js:52580`). The
dev setup passes the registry path to Miniflare unless the programmatic
`disableDevRegistry` option is set (`node_modules/wrangler/wrangler-dist/cli.js:485104`);
the installed CLI has no corresponding disable flag or config switch.

The exact target file did not exist after the denied open, while its parent
directories existed with owner `joe`, mode `0755`, and no ACL marker. The
project workspace is writable, but `/Users/joe/Library/Preferences/.wrangler`
is outside the managed writable roots. This explains both EPERMs without
evidence of host filesystem permission corruption.

The smallest safe future execution should solve both home-path writes in one
gate, preferably by supplying the installed path controls
`WRANGLER_LOG_PATH` and `WRANGLER_REGISTRY_PATH` to project-local ignored
runtime directories. This is a design for a future parity execution only; no
override was set in this analysis. A narrowly scoped write approval for only
the two exact Wrangler directories is an alternative, not full filesystem
access. No `disableDevRegistry` workaround or programmatic launcher is
selected.

## Post-fix single Worker-AI parity execution — 2026-08-29

The one-time host/network execution approval was granted for the exact parity
command. Preflight confirmed commit `146d453` was present at `HEAD`; the only
working-tree changes were existing documentation/forensic files, with no new
source or Wrangler configuration change. The existing parity configuration was
loaded and Wrangler reported only the explicit remote `AI` binding.

The Worker reached local startup initialization but exited before creating a
listener because the execution environment denied Wrangler's local log/registry
file writes. This is classified as a local Wrangler launch failure. The named
export runtime failure was not reproduced. No localhost route request reached
the Worker and no `env.AI.run` call was made. The process exited; no parity
Worker was left running.

```text
PARITY_FIX_COMMIT = 146d453
PARITY_FIX_PRESENT = YES
WORKTREE_HAS_NEW_SOURCE_OR_CONFIG_CHANGE = NO
LOCAL_TEST_EVIDENCE_REUSED = YES
EXECUTION_APPROVAL = APPROVED
HOST_NETWORK_ENABLED_EXECUTION_USED = YES
WRANGLER_DEVICE_LOGIN_REPEATED = NO
WRANGLER_AUTH_SOURCE = OAUTH_DEVICE_FLOW_SESSION
PARITY_WORKER_START_ATTEMPTS = 1
PARITY_WORKER_STARTUP = FAIL
PARITY_ENTRYPOINT_NAMED_EXPORT_RUNTIME_ERROR = NO
PARITY_CONFIG_ACTUALLY_LOADED = YES
WORKER_EXECUTION_LOCATION = LOCAL
DEV_SERVER_LISTENER = NOT_RUN
PUBLIC_TUNNEL_ACTIVE = NO
REMOTE_BINDINGS = AI_ONLY
REMOTE_AI_BINDING = YES
REMOTE_D1_BINDING = NO
REMOTE_QUEUE_BINDING = NO
REMOTE_OTHER_WRITE_BINDING = NO
LOCAL_PARITY_ROUTE_REQUESTS = 0
PROVIDER_ATTEMPTS = 0
PROVIDER_CONFIRMATIONS = 0
CONFIRMED_INFERENCE_CALLS = 0
WORKER_BINDING_REQUEST_SENT = NO
PROVIDER_RESPONSE_CONFIRMED = NOT_RUN
REQUEST_RESPONSE_FORMAT_PRESENT = NOT_RUN
REQUEST_RESPONSE_FORMAT_PRESERVED = NOT_RUN
WORKER_BINDING_RESPONSE_VALUE_TYPE = NOT_RUN
V2_2_RESPONSE_BOUNDARY_REACHED = NOT_RUN
V2_2_RESPONSE_CLASS = NOT_RUN
V2_2_STRUCTURAL_STATUS = NOT_RUN
D03_FACT_EXTRACTION = NOT_RUN
DIRECT_REST_VS_AI_BINDING_REQUEST_PARITY = NOT_PROVEN
DIRECT_REST_VS_AI_BINDING_RESPONSE_PARITY = NOT_PROVEN
STRUCTURED_OUTPUT_BINDING_PARITY = NOT_PROVEN
FAILURE_LAYER = LOCAL_WRANGLER_LAUNCH
WRANGLER_LOCAL_WRITE_ERROR = EPERM
RETRIES = 0
WORKERS_AI_USAGE = 0
PARITY_WORKER_STOPPED = YES
PRODUCTION_D1_REMOTE_ACCESS = 0
PRODUCTION_QUEUE_REMOTE_ACCESS = 0
LINE_SEND = 0
CANDIDATE_WRITE = 0
OPERATIONAL_OFFICIAL_WRITE = 0
ABNORMAL_OFFICIAL_WRITE = 0
FINANCE_WRITE = 0
MIGRATION = NONE
PRODUCTION_DEPLOYMENT = NOT_DONE
CODE_CHANGED_THIS_GATE = NO
CONFIG_CHANGED_THIS_GATE = NO
CURRENT_EFFECTIVE_DEV_SMOKE = PASS
READY_FOR_TEST_GROUP_SHADOW = BLOCKED
READY_FOR_HUMAN_PRODUCTION_PATH_ACCEPTANCE = NO
READY_FOR_PRODUCTION_ACTIVATION = NO
NEXT_SINGLE_GATE = PARITY_LOCAL_RUNTIME_FAILURE_ANALYSIS
```

This gate stops at local runtime launch. It does not authorize a second Worker
start, a second approval attempt, a localhost request, provider execution,
Shadow, Active Route, LINE testing, or deployment.

## Bounded Wrangler filesystem + network parity execution — 2026-08-29

The explicitly authorized recursive read/write access to the Wrangler home
directory and host network access were available for this single execution.
The existing `146d453` entrypoint fix was used without source or configuration
changes. Wrangler created its expected local log/registry state, started the
local Worker, and exposed only the remote `AI` binding. The one frozen D03
localhost request reached `env.AI.run` exactly once and completed with a
structured object response. The Worker then shut down normally.

```text
PARITY_FIX_COMMIT = 146d453
FILESYSTEM_APPROVAL = APPROVED
WRANGLER_HOME_WRITE_ROOT = /Users/joe/Library/Preferences/.wrangler
WRANGLER_HOME_WRITE_ACCESS = READ_WRITE_RECURSIVE
HOST_NETWORK_ENABLED_EXECUTION_USED = YES
EXPECTED_WRANGLER_LOCAL_STATE_WRITE = YES
LOCAL_TEST_EVIDENCE_REUSED = YES
CODE_CHANGED_THIS_GATE = NO
CONFIG_CHANGED_THIS_GATE = NO
WRANGLER_DEVICE_LOGIN_REPEATED = NO
WRANGLER_AUTH_SOURCE = OAUTH_DEVICE_FLOW_SESSION
PARITY_WORKER_START_ATTEMPTS = 1
PARITY_WORKER_STARTUP = PASS
PARITY_ENTRYPOINT_NAMED_EXPORT_RUNTIME_ERROR = NO
PARITY_CONFIG_ACTUALLY_LOADED = YES
WORKER_EXECUTION_LOCATION = LOCAL
DEV_SERVER_LISTENER = LOCALHOST
PUBLIC_TUNNEL_ACTIVE = NO
REMOTE_BINDINGS = AI_ONLY
REMOTE_AI_BINDING = YES
REMOTE_D1_BINDING = NO
REMOTE_QUEUE_BINDING = NO
REMOTE_OTHER_WRITE_BINDING = NO
LOCAL_PARITY_ROUTE_REQUESTS = 1
PROVIDER_ATTEMPTS = 1
PROVIDER_CONFIRMATIONS = 1
CONFIRMED_INFERENCE_CALLS = 1
WORKER_BINDING_REQUEST_SENT = YES
PROVIDER_RESPONSE_CONFIRMED = YES
REQUEST_RESPONSE_FORMAT_PRESENT = YES
REQUEST_RESPONSE_FORMAT_PRESERVED = YES
REQUEST_SCHEMA_FINGERPRINT = EXISTING_SAFE_FINGERPRINT_UNCHANGED
MODEL_UNCHANGED = YES
PROMPT_UNCHANGED = YES
SCHEMA_UNCHANGED = YES
WORKER_BINDING_RESPONSE_VALUE_TYPE = OBJECT
V2_2_RESPONSE_BOUNDARY_REACHED = YES
V2_2_RESPONSE_CLASS = STRUCTURED_OBJECT_RESPONSE
V2_2_STRUCTURAL_STATUS = PASS
D03_FACT_EXTRACTION = PASS
DIRECT_REST_VS_AI_BINDING_REQUEST_PARITY = PROVEN
DIRECT_REST_VS_AI_BINDING_RESPONSE_PARITY = PROVEN
STRUCTURED_OUTPUT_BINDING_PARITY = PASS
FAILURE_LAYER = NONE
RETRIES = 0
WORKERS_AI_USAGE = 1
PARITY_WORKER_STOPPED = YES
PRODUCTION_D1_REMOTE_ACCESS = 0
PRODUCTION_QUEUE_REMOTE_ACCESS = 0
LINE_SEND = 0
CANDIDATE_WRITE = 0
OPERATIONAL_OFFICIAL_WRITE = 0
ABNORMAL_OFFICIAL_WRITE = 0
FINANCE_WRITE = 0
MIGRATION = NONE
PRODUCTION_DEPLOYMENT = NOT_DONE
CURRENT_EFFECTIVE_DEV_SMOKE = PASS
READY_FOR_TEST_GROUP_SHADOW = YES
READY_FOR_HUMAN_PRODUCTION_PATH_ACCEPTANCE = NO
READY_FOR_PRODUCTION_ACTIVATION = NO
NEXT_SINGLE_GATE = IMPLEMENT_TEST_GROUP_SHADOW
```

This proves the current Direct REST to Worker `env.AI` request/response
structured-output parity for the single D03 case. It does not authorize Shadow
implementation, Active Route, LINE acceptance, or Production activation.
