# Sanitized Haiku/low terminal metrics witness

Observed once on 2026-08-07 in the fixed terminal-parity environment with
`claude-haiku-4-5`, `low`, and behavioral `write: false`. The turn completed.
This witness retains only field names and JSON value types. It retains no
prompt, answer, credential, identifier value, session value, UUID value, or raw
event content.

## Admitted numeric fields

- Terminal `result`: `duration_ms`, `duration_api_ms`, `num_turns`, and
  `total_cost_usd` were numbers.
- Top-level `usage`: `input_tokens`, `output_tokens`,
  `cache_creation_input_tokens`, and `cache_read_input_tokens` were numbers.

The v1 projection maps `num_turns` to `turn_count` and `total_cost_usd` to
`reported_cost_usd`; it preserves numbers only when they meet the closed
safe-integer/finite/non-negative checks.

## Rejected observed shapes

- Terminal strings: `result`, `session_id`, `subtype`, `stop_reason`,
  `terminal_reason`, `fast_mode_state`, and `fast_mode_disabled_reason`.
- Terminal arrays: `permission_denials`.
- Terminal objects: `modelUsage` and `usage` itself (only the four selected
  direct numeric `usage` children above are considered).
- Other terminal numbers: `time_to_request_ms`, `ttft_ms`, and `ttft_stream_ms`.
- Nested `usage` objects: `cache_creation` and `server_tool_use`.
- Nested `usage` strings: `inference_geo`, `service_tier`, and `speed`.
- Nested `usage` arrays: `iterations`.

This is protocol-shape evidence only. It is not billing evidence, a pricing
claim, or authorization to expose future provider fields.
