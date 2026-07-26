## 1. Reproduce the isolation defect

- [x] 1.1 Add deterministic regressions proving root A list/wait reconciliation leaves root B terminal jobs, completion inboxes, session bindings, and Agent registry unchanged
- [x] 1.2 Add stale-job, legacy-owner, owner-precedence, and internal status-path coverage, including deferred repair when root B next reconciles

## 2. Scope normal reconciliation

- [x] 2.1 Add owner-scoped bounded and Agent-projection job-store views that filter before lifecycle mutation
- [x] 2.2 Route Agent root reconciliation and normal internal list/status through the owner-scoped views while preserving post-reap legacy migration
- [x] 2.3 Preserve explicit global cleanup, read-only operator diagnostics, retention tails, and settled read-only behavior

## 3. Verify and release

- [x] 3.1 Run focused root-isolation, retention, completion, interrupt, and settled-read tests
- [x] 3.2 Run `npm run check`, strict OpenSpec validation, and an independent xhigh code audit without invoking Claude
- [x] 3.3 Sync and archive the OpenSpec change, commit the clean checkout, and push `main` over HTTPS through proxy port 9090
