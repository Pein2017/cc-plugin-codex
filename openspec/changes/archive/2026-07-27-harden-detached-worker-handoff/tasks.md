## 1. Freeze the handoff boundary with red tests

- [x] 1.1 Add fault-injection coverage proving a worker-claim race is accepted
  before the cleanup fence, has `killCount=0`, and retains its exact-session
  lease
- [x] 1.2 Add identity/publication and post-spawn async-error coverage proving
  the launcher wins an atomic `queued` to `cancelling` fence before it
  terminates an unclaimed child, and only terminal lifecycle releases the lease
- [x] 1.3 Add rollback and cleanup coverage proving a launch-started job cannot
  be deleted and a post-handoff log close error cannot fail the launch
- [x] 1.4 Add AgentRuntime coverage proving spawn and activating follow-up roll
  back Agent lifecycle/mailbox only for a `rollback_safe` disposition;
  `lifecycle_owned` and `ownership_uncertain` preserve attachment and lease

## 2. Implement one-way worker ownership transfer

- [x] 2.1 Persist the launch-start marker and make prepared-job abort refuse any
  receipt that may already have a detached worker
- [x] 2.2 Require PID identity and launcher identity/generation predicates for
  publication and cleanup CAS, while keeping the child referenced until
  publication, claim, terminalization, or durable uncertainty is proven
- [x] 2.3 Restrict parent lease release to pre-spawn failures and route all
  post-spawn cleanup through an execution-fenced terminal job lifecycle
- [x] 2.4 Propagate the structured handoff disposition through AgentRuntime and
  gate Agent lifecycle/mailbox rollback on `rollback_safe`

## 3. Verify and release

- [x] 3.1 Pass focused fault-injection and exact-session lease tests without
  invoking real Claude
- [x] 3.2 Pass `npm run check`, strict OpenSpec validation, and an independent
  xhigh audit; stop any later real CC tests on explicit account-limit exhaustion
- [x] 3.3 Sync and archive the OpenSpec change, commit, push `main` over HTTPS
  through proxy port 9090, and verify the sole checkout is clean and aligned
