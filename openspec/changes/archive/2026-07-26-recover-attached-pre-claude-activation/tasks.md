## 1. Freeze the durable boundaries with red tests

- [x] 1.1 Add public spawn and activating-follow-up regressions proving invalid effort, profile, and permission combinations create no Agent, mailbox, job, or steering mutation
- [x] 1.2 Add mailbox tests proving the spawn prompt is sequence one, raced messages preserve order, and synchronous rollback never deletes concurrent messages
- [x] 1.3 Add adapter, runner, and supervisor tests proving durable child acceptance precedes every prompt write and rejection, exception, or missing identity writes zero bytes and terminates the child
- [x] 1.4 Add attached and unattached terminal pre-Claude recovery tests covering exact-session preservation, message requeue, repeated reconciliation, newer-turn monotonicity, no completion, and bounded diagnostic retention

## 2. Validate and launch atomically

- [x] 2.1 Extract one pure complete execution-profile validator and call it before public spawn or activating follow-up persistence, with prepare-time defense in depth
- [x] 2.2 Persist the initial spawn message during Agent creation, reserve the complete ordered mailbox batch, launch from that batch, and make rollback concurrency-safe
- [x] 2.3 Move `preClaudeLaunch` clearing into the accepted child PID compare-and-swap before stdin delivery, propagate callback acceptance through the adapter and supervisor, and terminate unaccepted children

## 3. Recover without projecting a false turn

- [x] 3.1 Gate terminal session binding and completion publication on the attachment-independent pre-Claude marker
- [x] 3.2 Reconcile terminal pre-Claude diagnostics before generic Agent projection, restoring prior lifecycle and requeueing only messages still linked to the failed job without regressing newer turns
- [x] 3.3 Make recovery idempotent, release relevant leases, preserve validated Claude session pointers, and permit bounded cleanup only after diagnostic projection is marked

## 4. Verify and release

- [x] 4.1 Run focused local/fake boundary, mailbox, reconciliation, cleanup, runner, supervisor, and adapter tests without invoking real Claude
- [x] 4.2 Run `npm run check`, strict OpenSpec validation, and an independent xhigh code audit; stop any later real CC testing if account-limit exhaustion is observed
- [x] 4.3 Sync and archive the OpenSpec change, commit the clean checkout, and push `main` over HTTPS through proxy port 9090
