## 1. Contract and public boundary

- [x] 1.1 Replace bootstrap discovery with fixed canonical checkout/environment validation and protected host-root propagation
- [x] 1.2 Reject `--cwd`, `-C`, and `--env-file` across all seven model-facing lifecycle commands while preserving private worker/operator controls
- [x] 1.3 Pin both Claude config variables and the existing Conda/Claude/proxy envelope in `config/runtime.env`

## 2. Guidance and documentation

- [x] 2.1 Update all seven lifecycle skills to require Codex ambient-cwd confirmation and prohibit context flags
- [x] 2.2 Update README environment, runtime-source, and hot-refresh guidance to the fixed contract
- [x] 2.3 Validate all modified skills with the skill validator

## 3. Verification and rollout

- [x] 3.1 Add focused integration and Plugin-contract tests for fixed bootstrap selection, ambient cwd, public rejection, and private worker/operator preservation
- [x] 3.2 Run focused tests and the full `npm run check` suite
- [x] 3.3 Run one real Haiku/low bootstrap smoke from an explicit ambient cwd, stopping immediately if Claude reports subscription exhaustion (startup and workspace routing passed; Claude API acceptance remained unverified because the host OAuth token returned 401 expired)
- [x] 3.4 Archive/sync the OpenSpec change, refresh the local Plugin snapshot, validate the installed version, and commit the complete change without pushing
