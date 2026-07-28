## Context

The runtime already defaults `wait_agent` to 600000 ms and returns eligible
completion or progress before that deadline. The wait skill nevertheless shows
`--timeout-ms` as an ordinary argument, so callers sometimes invent a 60000 ms
window and then issue repeated waits.

## Goals / Non-Goals

**Goals:**

- Make the shortest ordinary invocation the canonical one.
- Preserve the established ten-minute default, one-hour maximum, early return,
  root scope, and durable acknowledgement semantics.

**Non-Goals:**

- Changing runtime timing, the 500 ms internal observation cadence, or progress
  delivery policy.
- Adding an MCP server or changing the seven-operation public lifecycle.
- Making a completed background Agent reactivate an ended Codex parent turn.

## Decisions

The skill will instruct callers to omit `--timeout-ms` for ordinary required
joins. It will describe explicit timeout values as overrides for intentional
immediate probes, shorter observation windows, or longer bounded waits. This is
preferred to hiding or removing the option because tests, diagnostics, and
special scheduling decisions still need explicit control.

The runtime constant remains unchanged. A contract test will verify both the
600000 ms default text and the omit-by-default instruction so future prompt
edits cannot regress to the noisy form.

## Risks / Trade-offs

- [A parent assumes ten minutes means delayed completion] -> State that the
  value is only an upper bound and completion/progress returns immediately.
- [A caller still invents a short override] -> Use imperative default guidance
  in both skill body and discovery prompt; runtime continues to accept explicit
  overrides when the decision is intentional.
