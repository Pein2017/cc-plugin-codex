## Context

The Agent store must persist a complete mailbox record to preserve delivery ordering, recovery, assignment, and steering evidence. The current `sendMessage()` method leaks that internal record back through the model-facing lifecycle receipt, and the Skill tells the parent to print it verbatim. The public consumer only needs to know which Agent was targeted and whether the message was dispatched, activation-pending, or queued without a turn.

`runtime/index.mjs` remains the sole public lifecycle boundary. MCP continues to serialize the runtime receipt as both JSON text and structured content, but the receipt itself becomes operation-specific and bounded. Durable evidence remains owned by the Agent store and job/steering stores.

## Goals / Non-Goals

**Goals:**

- Remove echoed message content and internal identifiers/timestamps from successful `send_message` model context.
- Preserve every delivery outcome the parent needs for its next orchestration decision.
- Keep concise human presentation aligned with the compact machine receipt.
- Leave durable storage, recovery, and actionable errors unchanged.

**Non-Goals:**

- Change mailbox state or delivery timing.
- Add a separate debug receipt endpoint or shrink other lifecycle operations.
- Hide failure evidence needed for recovery.

## Decisions

### Project a two-field operation-specific receipt

Successful `send_message` returns:

```json
{
  "agent_name": "/root/example",
  "delivery": "dispatched_active"
}
```

`agent_name` uses the stable path already used by `list_agents`, and `delivery` preserves the existing three dispositions. Agent status is deliberately omitted: it can race independently with delivery and is redundant with the disposition for the parent's next decision. This is preferred to retaining IDs because none is accepted by a later delivery operation, and preferred to returning a formatted sentence because structured consumers still benefit from typed fields.

### Keep full evidence behind the lifecycle boundary

The runtime still enqueues the complete message and delivers it using the existing Agent/job/steering paths. Only the returned object changes. Operator diagnostics and durable files remain the evidence path; MCP owns no copy.

### Make presentation concise but disposition-aware

The Skill instructs the parent to emit one short confirmation, not raw JSON. `queued_no_turn` must still explain that `followup_task` is required to activate an idle Agent. Raw detail is shown only when the user explicitly requests debugging.

## Risks / Trade-offs

- [Existing callers inspect nested receipt fields] → Treat the pre-1.0 public receipt change as a minor-version breaking change and update all repository tests/docs together.
- [A future incident needs message or steering IDs] → Retain them unchanged in durable operator evidence rather than paying their token cost on every successful send.
- [Concise presentation could hide a queued message] → Preserve `delivery` and require disposition-aware wording for `queued_no_turn`.

## Migration Plan

1. Change only the public return projection after the existing enqueue/delivery work succeeds.
2. Update Skill guidance, documentation, and focused tests.
3. Bump the minor version, run the full gate, and install the versioned local snapshot.
4. Start a new Codex task to load the new Skill; compatible checkout runtime projection hot-loads for existing tasks.

Rollback is a checkout revert and versioned local refresh. No persisted state migration is required.

## Open Questions

None.
