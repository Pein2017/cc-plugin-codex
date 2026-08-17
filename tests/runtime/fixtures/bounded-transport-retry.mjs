/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * One bounded re-attempt for a fixture-server call that failed on transport.
 *
 * ## Why this exists
 *
 * These suites start their own ephemeral loopback Server per test. Under heavy
 * parallel load the very first connection to a just-started listener can fail
 * before it is accepted, which the Driver and client correctly classify as a
 * retryable transport failure. A scenario that is asserting something else --
 * a malformed body, a policy gate, a route refusal -- then observes that
 * transport failure instead of the classification it came to prove, and fails
 * for a reason it is not testing.
 *
 * Observed twice, both times under load and never in isolation:
 *
 *   - a full-suite gate run: `opencode-driver.test.mjs` "fails the gate closed
 *     when the scope names another Server" failed in setup with
 *     `instance_not_ready (service_unreachable)` against its own fake Server;
 *     the same suite passed 34/34 in isolation and the full check passed on
 *     rerun.
 *   - an eight-way concurrent stress run: `opencode-client.test.mjs` "fails
 *     closed on an oversized agent field instead of truncating it" returned
 *     `network_error`/`retryable: true` instead of
 *     `malformed_response`/`retryable: false`, in 4ms, against a ~1 KB
 *     response far under every declared bound.
 *
 * ## What it deliberately does not do
 *
 * It re-attempts exactly ONCE and never loops, so a genuinely broken transport
 * still fails the test on the second observation rather than hanging or
 * masking.
 *
 * It also does not cover `job-store.test.mjs`'s high-contention mailbox case,
 * which has been seen to fail once under the same load. That one is a different
 * shape: eight spawned writer processes contending on a durable file lock, whose
 * failure is a writer exiting non-zero on an acquire deadline, not a transport
 * receipt. Re-running it would replay 600 durable enqueues and could hide a real
 * serialization defect, which is exactly what that test exists to catch, so it
 * stays a documented load-sensitive case instead. It is applied per call site, only where the scenario asserts a
 * NON-transport classification: a test that asserts a transport classification
 * on purpose must never be wrapped, or it would be asserting the retry instead
 * of the contract. It touches no production code and changes no deadline,
 * ceiling, or retry policy the runtime itself owns.
 */

/** The closed transport-class codes a fixture Server can produce under load. */
const TRANSPORT_DETAIL_CODES = new Set([
  "service_unreachable",
  "deadline_exceeded",
  "network_error",
]);

/**
 * Run one discovery-shaped call, re-attempting once when its receipt says the
 * failure was transport and retryable. Returns the receipt of the last
 * attempt, whatever it says.
 *
 * @template T
 * @param {() => Promise<T>} call
 * @returns {Promise<T>}
 */
export async function withOneTransportRetry(call) {
  const first = await call();
  if (first?.ok === false && first?.retryable === true) return call();
  return first;
}

/**
 * Inspect one Driver's instances, re-attempting once when the only reading is
 * an unready instance whose detail is transport-class. A test that wants to
 * observe unreadiness itself asserts on this Driver directly instead.
 *
 * @param {{inspectInstances: (scope: any) => Promise<any[]>}} driver
 * @param {any} scope
 */
export async function inspectInstancesWithOneTransportRetry(driver, scope) {
  const first = await driver.inspectInstances(scope);
  const unreachable = Array.isArray(first) &&
    first.length > 0 &&
    first.every((inspection) =>
      inspection?.readiness !== "ready" && TRANSPORT_DETAIL_CODES.has(inspection?.detailCode));
  return unreachable ? driver.inspectInstances(scope) : first;
}
