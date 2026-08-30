# LINE Interaction Standard

This Worker uses four complementary interaction paths:

1. Flex Menu is the persistent discovery entry point.
2. Message Action is used for main commands and deterministic queries, so the
   user immediately sees the natural command text in the group.
3. Postback plus `displayText` is used for structured choices such as Farm,
   House, Flock, pending selection, correction targets, and candidate actions.
   The server validates the structured ID and never trusts display text as an
   identifier.
4. Quick Reply is used for high-frequency, small option sets. It is a shortcut,
   not a required form; the equivalent natural-language input remains valid.

Every user-initiated action must leave a visible, plain Traditional-Chinese
operation in the LINE chat. Postback actions therefore carry a human
`displayText`; the internal `data` value remains unchanged and is never shown
to the user. Message Actions keep their existing natural-language `text`.
Navigation (More, Back, Home, and pagination) follows the same rule; it is
not a silent Postback and it is resolved before Conversation V2. An open
Candidate remains context only and cannot swallow navigation.

URI actions are the one API-level exception: a URI cannot create a user chat
bubble. The first step is consequently a visible Postback such as
「管理網頁」, followed by a second message containing the URI button. There
are currently no Datetime Picker actions in the Production source. If one is
added later, its selected value must be acknowledged by a Bot reply rather
than relying on an unsupported `displayText` field.

## Quiet group mode

Ordinary group text is quiet unless it is an exact system command, a true LINE
self-mention, an active group/user session, a pending response, or an explicit
button/Postback event. Ordinary record-like text is held in the short-lived
ambient buffer and is never written directly to an operational or abnormal
ledger.

Hourly ambient extraction can create only a candidate digest. A human must
confirm it before the existing Resolver, Validator, Quick Record, D1, and Audit
path is used. The ambient candidate source is `ambient_digest`; AI has no direct
write authority.

## User-facing invocation policy

The default user rule is intentionally simple:

- Read-only queries may be sent directly without mentioning the Bot.
- A new formal write or modification requires an explicit
  `@金雞協會助理Ai` invocation on the first message.
- Once a Bot interaction is active, follow-up answers, choices, confirmations,
  cancellations, corrections, and reversals do not require repeating the
  mention.
- Quick Reply and Postback actions are already explicit interactions and do not
  require a repeated mention.

This rule does not turn every record-like sentence into a write. Unmentioned
record-like group text may be buffered as Ambient input, but it must not
silently create formal operational data. Exact system commands, active or
pending workflows, and structured button actions remain routing-level
exceptions governed by the existing handlers.

`@金雞協會助理Ai 摘要` is the explicit on-demand digest command. It uses the
same digest pipeline as the hourly Cron, but claims only buffered Ambient
messages up to the mention event timestamp for that group. A bare `摘要` is
not a global wake word and remains quiet outside an explicit self-mention.
After a schema-valid candidate bundle is durably created, or after a valid
extraction determines there is no candidate, the source rows become
`digest_status = 'processed'`. AI failure, invalid output, or persistence
failure leaves them buffered and retryable. Candidate confirmation, snooze, and
ignore never reopen the consumed source rows. A short organization/group lease
prevents Manual and Cron extraction races and expires automatically for crash
recovery.

## Global LINE Bot notification policy

Every outbound LINE Messaging API request from the Worker is sent with the
request-level field `notificationDisabled: true`. This is enforced in the
shared Reply and Push sender payload builders, so Flex messages, Quick Replies,
AI responses, confirmations, validation messages, and hourly ambient digests
inherit the same silent-notification policy automatically.

This policy does not affect user-authored text produced by LINE Message
Actions or `displayText`; those are client-rendered user interactions rather
than Bot outbound messages. There is no per-feature notification exception in
V1.
