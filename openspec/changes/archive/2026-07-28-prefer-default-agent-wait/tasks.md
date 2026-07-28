## 1. Wait Guidance

- [x] 1.1 Make the wait skill use omission of `--timeout-ms` as the canonical ordinary invocation while retaining the explicit override cases.
- [x] 1.2 Align wait skill discovery metadata with the same ten-minute default guidance.

## 2. Contract And Lifecycle

- [x] 2.1 Add a focused contract assertion that ordinary wait guidance omits an explicit timeout and still documents the 600000 ms default and 3600000 ms maximum.
- [x] 2.2 Validate the skill, focused contract, complete test suite, and strict OpenSpec state.
- [x] 2.3 Sync the canonical spec, archive the completed change, and refresh the installed local Plugin snapshot.
