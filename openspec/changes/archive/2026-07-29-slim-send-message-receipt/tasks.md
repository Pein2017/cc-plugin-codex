## 1. Public Receipt

- [x] 1.1 Replace the successful `send_message` projection with stable `agent_name` and `delivery` only.
- [x] 1.2 Preserve the complete durable mailbox record and all three existing delivery dispositions behind the public boundary.

## 2. Guidance And Contracts

- [x] 2.1 Replace raw-receipt Skill guidance with one concise disposition-aware confirmation and explicit debug opt-in.
- [x] 2.2 Update README, changelog, and focused tests for the compact public contract and unchanged actionable errors.

## 3. Verification And Release

- [x] 3.1 Bump the package-owned minor version and keep derived Plugin metadata synchronized.
- [x] 3.2 Run focused tests, strict OpenSpec validation, and `npm run check`; no paid Claude smoke is required because Claude launch and stream behavior are unchanged.
- [x] 3.3 Install the checkout-owned local release and pass the zero-model-cost release smoke.
