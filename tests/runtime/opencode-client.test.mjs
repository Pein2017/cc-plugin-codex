/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Task 2 of add-opencode-explorer-driver: fixed-origin auth-safe client
 * construction and side-effect-free discovery. Zero model/session/prompt
 * requests are made anywhere in this suite; the fake Server implements no
 * session/message/prompt route at all.
 *
 * Correction round 1: a lead review reproduced a real cross-origin/auth-leak
 * escape through the low-level SDK client that Task 2 v1 returned directly,
 * plus post-hoc-only mutation detection, an unbounded response size, a
 * credential-presence leak, an unbounded/bypassable timeout, and a
 * DNS-resolvable "localhost" loopback admission. This file's tests target
 * the corrected, hardened contract; see task-2-report.md for the original v1
 * evidence and the correction RED/GREEN evidence.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import {
  DEFAULT_OPENCODE_SERVER_URL,
  OPENCODE_DEADLINES_MS,
  OPENCODE_MAX_RESPONSE_BYTES,
  OpencodeClientError,
  boundPositiveInteger,
  createFixedOriginFetch,
  createOpencodeDiscoveryClient,
  discoverOpencodeCapabilities,
  discoverOpencodeHealth,
  discoverOpencodeProfile,
  discoverOpencodeProviderCatalog,
  getOpencodeDiscoveryAudit,
  isLoopbackOpencodeUrl,
  resolveOpencodeServerUrl,
  runOpencodeSideEffectFreeDiscovery,
  summarizeRequestAudit,
} from "../../runtime/opencode-client.mjs";
import { createFakeOpencodeServer } from "./fixtures/fake-opencode-server.mjs";

const PROVIDER_ID = "opencode-go";
const MODEL_ID = "deepseek-v4-flash";

const cleanups = [];
afterEach(async () => {
  while (cleanups.length) {
    const cleanup = cleanups.pop();
    await cleanup();
  }
});

function fixtureCodexHome() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cc-opencode-client-"));
  cleanups.push(async () => fs.rmSync(root, { recursive: true, force: true }));
  const codexHome = path.join(root, ".codex");
  fs.mkdirSync(codexHome, { recursive: true });
  // An empty tracked file so resolution stops here instead of falling through
  // to the repository's own config/runtime.env default OPENCODE_SERVER_URL.
  fs.writeFileSync(path.join(codexHome, ".env"), "");
  return { root, codexHome };
}

async function startServer(scenario) {
  const server = createFakeOpencodeServer(scenario);
  const url = await server.listen();
  cleanups.push(() => server.close());
  return { server, url };
}

function baseEnv(codexHome, extra = {}) {
  return { CODEX_HOME: codexHome, ...extra };
}

describe("opencode-client: fixed loopback URL validation", () => {
  it("accepts only literal-IP loopback http(s) origins with no credentials/query/fragment/path", () => {
    assert.equal(isLoopbackOpencodeUrl("http://127.0.0.1:4096"), true);
    assert.equal(isLoopbackOpencodeUrl("https://127.0.0.1:4096"), true);
    assert.equal(isLoopbackOpencodeUrl("http://[::1]:4096"), true);
    assert.equal(isLoopbackOpencodeUrl("http://127.0.0.1:4096/"), true);
  });

  it("rejects the DNS-resolvable hostname 'localhost' to avoid a DNS/TOCTOU loopback escape", () => {
    // "localhost" requires a resolver step (which may be misconfigured, e.g.
    // via /etc/hosts) between validation and connection; only a literal IP
    // loopback address proves the destination without that gap.
    assert.equal(isLoopbackOpencodeUrl("http://localhost:4096"), false);
  });

  it("rejects embedded credentials", () => {
    assert.equal(isLoopbackOpencodeUrl("http://user:pass@127.0.0.1:4096"), false);
  });

  it("rejects remote/non-loopback hosts", () => {
    assert.equal(isLoopbackOpencodeUrl("http://example.com:4096"), false);
    assert.equal(isLoopbackOpencodeUrl("http://10.0.0.5:4096"), false);
  });

  it("rejects a query string or fragment", () => {
    assert.equal(isLoopbackOpencodeUrl("http://127.0.0.1:4096/?x=1"), false);
    assert.equal(isLoopbackOpencodeUrl("http://127.0.0.1:4096#frag"), false);
  });

  it("rejects a non-root path", () => {
    assert.equal(isLoopbackOpencodeUrl("http://127.0.0.1:4096/session"), false);
  });

  it("rejects an unsupported scheme", () => {
    assert.equal(isLoopbackOpencodeUrl("ftp://127.0.0.1:4096"), false);
    assert.equal(isLoopbackOpencodeUrl("ws://127.0.0.1:4096"), false);
    assert.equal(isLoopbackOpencodeUrl("file:///etc/passwd"), false);
  });

  it("rejects unparsable input", () => {
    assert.equal(isLoopbackOpencodeUrl("not a url"), false);
  });

  it("resolveOpencodeServerUrl defaults to the tracked loopback origin and normalizes trailing slash", () => {
    assert.equal(resolveOpencodeServerUrl({}), DEFAULT_OPENCODE_SERVER_URL);
    assert.equal(resolveOpencodeServerUrl({ OPENCODE_SERVER_URL: "http://127.0.0.1:4096/" }), "http://127.0.0.1:4096");
  });

  it("resolveOpencodeServerUrl throws a closed error for a rejected configured URL", () => {
    assert.throws(
      () => resolveOpencodeServerUrl({ OPENCODE_SERVER_URL: "http://example.com:4096" }),
      (error) => error instanceof OpencodeClientError && error.code === "invalid_server_url"
    );
  });
});

describe("opencode-client: the discovery client is an opaque handle (no low-level escape surface)", () => {
  it("exposes only serverUrl; no .client, .hasCredentials, or requestAudit records", () => {
    const { root, codexHome } = fixtureCodexHome();
    const handle = createOpencodeDiscoveryClient({
      cwd: root,
      env: baseEnv(codexHome, { OPENCODE_SERVER_URL: DEFAULT_OPENCODE_SERVER_URL }),
    });
    assert.equal(handle.serverUrl, DEFAULT_OPENCODE_SERVER_URL);
    assert.deepEqual(Object.keys(handle), ["serverUrl"]);
    assert.equal("client" in handle, false);
    assert.equal("hasCredentials" in handle, false);
    assert.equal("requestAudit" in handle, false);
    assert.ok(Object.isFrozen(handle));
  });

  it("rejects an incomplete credential pair before any request", () => {
    const { root, codexHome } = fixtureCodexHome();
    assert.throws(
      () =>
        createOpencodeDiscoveryClient({
          cwd: root,
          env: baseEnv(codexHome, {
            OPENCODE_SERVER_URL: DEFAULT_OPENCODE_SERVER_URL,
            OPENCODE_SERVER_USERNAME: "admin",
          }),
        }),
      (error) => error instanceof OpencodeClientError && error.code === "credentials_incomplete"
    );
  });

  it("never leaks composed Basic-auth credentials through the serialized handle", () => {
    const { root, codexHome } = fixtureCodexHome();
    const handle = createOpencodeDiscoveryClient({
      cwd: root,
      env: baseEnv(codexHome, {
        OPENCODE_SERVER_URL: DEFAULT_OPENCODE_SERVER_URL,
        OPENCODE_SERVER_USERNAME: "admin",
        OPENCODE_SERVER_PASSWORD: "hunter2",
      }),
    });
    const serialized = JSON.stringify(handle);
    assert.equal(serialized.includes("hunter2"), false);
    assert.equal(serialized.includes("admin"), false);
    assert.equal(serialized.includes("Basic"), false);
  });

  it("reproduces and blocks the reported low-level per-call baseUrl/fetch escape (client.client.get({url, baseUrl: originB})), leaking no auth to origin B", async () => {
    const { url: urlA } = await startServer({ auth: { username: "admin", password: "hunter2" } });
    const { url: urlB, server: serverB } = await startServer({});
    const { root, codexHome } = fixtureCodexHome();
    const handle = createOpencodeDiscoveryClient({
      cwd: root,
      env: baseEnv(codexHome, {
        OPENCODE_SERVER_URL: urlA,
        OPENCODE_SERVER_USERNAME: "admin",
        OPENCODE_SERVER_PASSWORD: "hunter2",
      }),
    });
    let escapedOk = false;
    try {
      // The exact reported v1 escape path; must be structurally unreachable.
      const escaped = await handle.client.client.get({ url: "/global/health", baseUrl: urlB });
      escapedOk = escaped?.error === undefined;
    } catch {
      escapedOk = false;
    }
    assert.equal(escapedOk, false);
    assert.equal(serverB.requests.length, 0);
    assert.equal(serverB.requests.some((request) => request.hasAuthorizationHeader), false);
  });
});

describe("opencode-client: fixed-origin fetch seam (direct controlled wrapper tests)", () => {
  it("rejects a cross-origin request before any network call reaches it", async () => {
    const { url: urlA } = await startServer({});
    const { url: urlB, server: serverB } = await startServer({});
    const auditRecords = [];
    const wrapped = createFixedOriginFetch({
      baseOrigin: new URL(urlA).origin,
      maxResponseBytes: OPENCODE_MAX_RESPONSE_BYTES,
      auditRecords,
    });
    await assert.rejects(
      () => wrapped(new Request(`${urlB}/global/health`)),
      (error) => error instanceof OpencodeClientError && error.code === "cross_origin_rejected"
    );
    assert.equal(serverB.requests.length, 0);
    assert.equal(auditRecords.length, 0);
  });

  it("blocks a non-GET request before any network call reaches it", async () => {
    const { url, server } = await startServer({});
    const auditRecords = [];
    const wrapped = createFixedOriginFetch({
      baseOrigin: new URL(url).origin,
      maxResponseBytes: OPENCODE_MAX_RESPONSE_BYTES,
      auditRecords,
    });
    await assert.rejects(
      () => wrapped(new Request(`${url}/agent`, { method: "POST" })),
      (error) => error instanceof OpencodeClientError && error.code === "mutating_request_blocked"
    );
    assert.equal(server.requests.length, 0);
    assert.equal(auditRecords.length, 0);
  });

  it("forces redirect rejection regardless of the incoming Request's own redirect mode", async () => {
    const { url } = await startServer({ redirectPaths: { "/global/health": "/global/health-v2" } });
    const auditRecords = [];
    const wrapped = createFixedOriginFetch({
      baseOrigin: new URL(url).origin,
      maxResponseBytes: OPENCODE_MAX_RESPONSE_BYTES,
      auditRecords,
    });
    await assert.rejects(() => wrapped(new Request(`${url}/global/health`, { redirect: "follow" })));
  });

  it("records only bounded method/path in the audit, never a query string or fragment", async () => {
    const { url } = await startServer({});
    const auditRecords = [];
    const wrapped = createFixedOriginFetch({
      baseOrigin: new URL(url).origin,
      maxResponseBytes: OPENCODE_MAX_RESPONSE_BYTES,
      auditRecords,
    });
    await wrapped(new Request(`${url}/global/health?x=1`));
    assert.deepEqual(auditRecords, [{ method: "GET", path: "/global/health" }]);
  });

  it("enforces a declared-Content-Length bound without reading the oversized body", async () => {
    const { url, server } = await startServer({ oversizedDeclaredLengthPaths: ["/global/health"] });
    const auditRecords = [];
    const wrapped = createFixedOriginFetch({ baseOrigin: new URL(url).origin, maxResponseBytes: 1024, auditRecords });
    await assert.rejects(
      () => wrapped(new Request(`${url}/global/health`)),
      (error) => error instanceof OpencodeClientError && error.code === "response_too_large"
    );
    assert.equal(server.requests.length, 1);
  });

  it("enforces a streaming/chunked response bound without buffering the full oversized body", async () => {
    const { url } = await startServer({ oversizedStreamingPaths: { "/global/health": 5_000_000 } });
    const auditRecords = [];
    const wrapped = createFixedOriginFetch({ baseOrigin: new URL(url).origin, maxResponseBytes: 1024, auditRecords });
    const start = Date.now();
    const response = await wrapped(new Request(`${url}/global/health`));
    await assert.rejects(
      () => response.text(),
      (error) => error instanceof OpencodeClientError && error.code === "response_too_large"
    );
    assert.ok(Date.now() - start < 2000, "must reject promptly, not after draining 5MB");
  });
});

describe("opencode-client: side-effect-free discovery against a fake Server", () => {
  it("reports health when the Server is ready", async () => {
    const { url } = await startServer({});
    const handle = createOpencodeDiscoveryClient({ env: { OPENCODE_SERVER_URL: url } });
    const result = await discoverOpencodeHealth(handle);
    assert.deepEqual(result, { ok: true, healthy: true, version: "1.18.18" });
  });

  it("returns a sanitized auth_failed classification when Basic auth is missing", async () => {
    const { url } = await startServer({ auth: { username: "admin", password: "hunter2" } });
    const handle = createOpencodeDiscoveryClient({ env: { OPENCODE_SERVER_URL: url } });
    const result = await discoverOpencodeHealth(handle);
    assert.equal(result.ok, false);
    assert.equal(result.code, "auth_failed");
    assert.equal(result.retryable, false);
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes("hunter2"), false);
    assert.equal(serialized.includes("admin"), false);
    assert.equal(serialized.includes("Authorization"), false);
  });

  it("succeeds with matching inherited Basic auth credentials", async () => {
    const { url } = await startServer({ auth: { username: "admin", password: "hunter2" } });
    const { root, codexHome } = fixtureCodexHome();
    const handle = createOpencodeDiscoveryClient({
      cwd: root,
      env: baseEnv(codexHome, {
        OPENCODE_SERVER_URL: url,
        OPENCODE_SERVER_USERNAME: "admin",
        OPENCODE_SERVER_PASSWORD: "hunter2",
      }),
    });
    const result = await discoverOpencodeHealth(handle);
    assert.equal(result.ok, true);
  });

  it("reports the target provider/model catalog match without the full connected list", async () => {
    const { url } = await startServer({
      provider: {
        status: 200,
        body: {
          connected: ["opencode-go", "anthropic"],
          default: {},
          all: [
            {
              id: PROVIDER_ID,
              models: {
                [MODEL_ID]: { id: MODEL_ID, providerID: PROVIDER_ID, name: "DeepSeek V4 Flash", family: "deepseek-flash" },
              },
            },
          ],
        },
      },
    });
    const handle = createOpencodeDiscoveryClient({ env: { OPENCODE_SERVER_URL: url } });
    const result = await discoverOpencodeProviderCatalog(handle, { providerId: PROVIDER_ID, modelId: MODEL_ID });
    assert.deepEqual(result, {
      ok: true,
      providerPresent: true,
      providerConnected: true,
      model: { id: MODEL_ID, providerID: PROVIDER_ID, name: "DeepSeek V4 Flash", family: "deepseek-flash" },
    });
  });

  it("reports catalog absence truthfully when the target model is not present", async () => {
    const { url } = await startServer({ provider: { status: 200, body: { connected: [], default: {}, all: [] } } });
    const handle = createOpencodeDiscoveryClient({ env: { OPENCODE_SERVER_URL: url } });
    const result = await discoverOpencodeProviderCatalog(handle, { providerId: PROVIDER_ID, modelId: MODEL_ID });
    assert.deepEqual(result, { ok: true, providerPresent: false, providerConnected: false, model: null });
  });

  it("reports the codex-explorer profile presence from the sanitized agent list", async () => {
    const { url } = await startServer({
      agents: { status: 200, body: [{ name: "codex-explorer", mode: "primary", native: false }, { name: "build", mode: "primary", native: true }] },
    });
    const handle = createOpencodeDiscoveryClient({ env: { OPENCODE_SERVER_URL: url } });
    const result = await discoverOpencodeProfile(handle);
    assert.equal(result.ok, true);
    assert.ok(result.agents.some((agent) => agent.name === "codex-explorer"));
    assert.equal(result.agents.length, 2);
  });

  it("fails closed on an oversized agents array instead of returning partial raw data", async () => {
    const agents = Array.from({ length: 300 }, (_, index) => ({ name: `agent-${index}`, mode: "primary", native: false }));
    const { url } = await startServer({ agents: { status: 200, body: agents } });
    const handle = createOpencodeDiscoveryClient({ env: { OPENCODE_SERVER_URL: url } });
    const result = await discoverOpencodeProfile(handle);
    assert.deepEqual(result, { ok: false, code: "malformed_response", retryable: false });
  });

  it("fails closed on an oversized agent field instead of truncating it", async () => {
    const { url } = await startServer({ agents: { status: 200, body: [{ name: "x".repeat(1000), mode: "primary", native: false }] } });
    const handle = createOpencodeDiscoveryClient({ env: { OPENCODE_SERVER_URL: url } });
    const result = await discoverOpencodeProfile(handle);
    assert.deepEqual(result, { ok: false, code: "malformed_response", retryable: false });
  });

  it("fails closed on an oversized provider catalog model field", async () => {
    const { url } = await startServer({
      provider: {
        status: 200,
        body: {
          connected: [PROVIDER_ID],
          default: {},
          all: [{ id: PROVIDER_ID, models: { [MODEL_ID]: { id: MODEL_ID, providerID: PROVIDER_ID, name: "n".repeat(1000), family: "f" } } }],
        },
      },
    });
    const handle = createOpencodeDiscoveryClient({ env: { OPENCODE_SERVER_URL: url } });
    const result = await discoverOpencodeProviderCatalog(handle, { providerId: PROVIDER_ID, modelId: MODEL_ID });
    assert.deepEqual(result, { ok: false, code: "malformed_response", retryable: false });
  });

  it("reports capabilities booleans only", async () => {
    const { url } = await startServer({ capabilities: { status: 200, body: { backgroundSubagents: false, someFutureField: "x" } } });
    const handle = createOpencodeDiscoveryClient({ env: { OPENCODE_SERVER_URL: url } });
    const result = await discoverOpencodeCapabilities(handle);
    assert.deepEqual(result, { ok: true, backgroundSubagents: false });
  });

  it("classifies a connection loss as a retryable network_error", async () => {
    const { server, url } = await startServer({});
    await server.close();
    const handle = createOpencodeDiscoveryClient({ env: { OPENCODE_SERVER_URL: url } });
    const result = await discoverOpencodeHealth(handle);
    assert.equal(result.ok, false);
    assert.equal(result.code, "network_error");
    assert.equal(result.retryable, true);
  });

  it("classifies an exceeded deadline as deadline_exceeded without waiting for the configured ceiling", async () => {
    const { url } = await startServer({ hangPaths: ["/global/health"] });
    const handle = createOpencodeDiscoveryClient({ env: { OPENCODE_SERVER_URL: url } });
    const start = Date.now();
    const result = await discoverOpencodeHealth(handle, { timeoutMs: 100 });
    assert.equal(result.ok, false);
    assert.equal(result.code, "deadline_exceeded");
    assert.equal(result.retryable, true);
    assert.ok(Date.now() - start < 2000);
  });

  it("classifies a malformed (invalid JSON) response as non-retryable malformed_response", async () => {
    const { url } = await startServer({ malformedPaths: ["/global/health"] });
    const handle = createOpencodeDiscoveryClient({ env: { OPENCODE_SERVER_URL: url } });
    const result = await discoverOpencodeHealth(handle);
    assert.equal(result.ok, false);
    assert.equal(result.code, "malformed_response");
    assert.equal(result.retryable, false);
  });

  it("classifies a schema-invalid but well-formed JSON health body as malformed_response", async () => {
    const { url } = await startServer({ health: { status: 200, body: { healthy: "yes" } } });
    const handle = createOpencodeDiscoveryClient({ env: { OPENCODE_SERVER_URL: url } });
    const result = await discoverOpencodeHealth(handle);
    assert.equal(result.ok, false);
    assert.equal(result.code, "malformed_response");
  });

  it("classifies a rejected redirect as non-retryable redirect_rejected", async () => {
    const { url } = await startServer({ redirectPaths: { "/global/health": "/global/health-v2" } });
    const handle = createOpencodeDiscoveryClient({ env: { OPENCODE_SERVER_URL: url } });
    const result = await discoverOpencodeHealth(handle);
    assert.equal(result.ok, false);
    assert.equal(result.code, "redirect_rejected");
    assert.equal(result.retryable, false);
  });

  it("classifies a declared oversized response as non-retryable response_too_large", async () => {
    const { url } = await startServer({ oversizedDeclaredLengthPaths: ["/global/health"] });
    const handle = createOpencodeDiscoveryClient({ env: { OPENCODE_SERVER_URL: url }, maxResponseBytes: 1024 });
    const result = await discoverOpencodeHealth(handle);
    assert.deepEqual(result, { ok: false, code: "response_too_large", retryable: false });
  });

  it("classifies an oversized streamed response as non-retryable response_too_large promptly", async () => {
    const { url } = await startServer({ oversizedStreamingPaths: { "/global/health": 5_000_000 } });
    const handle = createOpencodeDiscoveryClient({ env: { OPENCODE_SERVER_URL: url }, maxResponseBytes: 1024 });
    const start = Date.now();
    const result = await discoverOpencodeHealth(handle);
    assert.deepEqual(result, { ok: false, code: "response_too_large", retryable: false });
    assert.ok(Date.now() - start < 2000);
  });

  it("caller-composed abort produces aborted_by_caller and fires before the discovery ceiling", async () => {
    const { url } = await startServer({ hangPaths: ["/global/health"] });
    const handle = createOpencodeDiscoveryClient({ env: { OPENCODE_SERVER_URL: url } });
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 50);
    const result = await discoverOpencodeHealth(handle, { signal: controller.signal });
    assert.equal(result.ok, false);
    assert.equal(result.code, "aborted_by_caller");
  });

  it("ignores an unrecognized per-call option and never diverts from the fixed origin/path", async () => {
    const { url, server } = await startServer({});
    const handle = createOpencodeDiscoveryClient({ env: { OPENCODE_SERVER_URL: url } });
    await discoverOpencodeHealth(handle, { endpoint: "http://127.0.0.1:1/evil" });
    assert.equal(server.requests.length, 1);
    assert.equal(server.requests[0].path, "/global/health");
  });

  it("bypasses configured proxy environment variables for the fixed loopback origin", async () => {
    const { url } = await startServer({});
    const { root, codexHome } = fixtureCodexHome();
    const handle = createOpencodeDiscoveryClient({
      cwd: root,
      env: baseEnv(codexHome, { OPENCODE_SERVER_URL: url, HTTP_PROXY: "http://127.0.0.1:1", http_proxy: "http://127.0.0.1:1" }),
    });
    const result = await discoverOpencodeHealth(handle);
    assert.equal(result.ok, true);
  });
});

describe("opencode-client: a per-call or handle-level timeout/byte request can only shorten the Driver-owned ceiling", () => {
  it("boundPositiveInteger keeps a valid smaller request", () => {
    assert.equal(boundPositiveInteger(100, 5000), 100);
  });

  it("boundPositiveInteger clamps to the ceiling for larger/invalid/equal requests", () => {
    assert.equal(boundPositiveInteger(999_999, 5000), 5000);
    assert.equal(boundPositiveInteger(5000, 5000), 5000);
    assert.equal(boundPositiveInteger(0, 5000), 5000);
    assert.equal(boundPositiveInteger(-5, 5000), 5000);
    assert.equal(boundPositiveInteger(Infinity, 5000), 5000);
    assert.equal(boundPositiveInteger(Number.NaN, 5000), 5000);
    assert.equal(boundPositiveInteger(1.5, 5000), 5000);
    assert.equal(boundPositiveInteger(undefined, 5000), 5000);
  });

  it("a per-call timeoutMs cannot extend past the handle's own (already-bounded) connect ceiling", async () => {
    const { url } = await startServer({ hangPaths: ["/global/health"] });
    const handle = createOpencodeDiscoveryClient({ env: { OPENCODE_SERVER_URL: url }, connectTimeoutMs: 150 });
    const start = Date.now();
    const result = await discoverOpencodeHealth(handle, { timeoutMs: 999_999 });
    assert.equal(result.code, "deadline_exceeded");
    assert.ok(Date.now() - start < 2000, "must be bounded by the 150ms handle ceiling, not 999999ms");
  });
});

describe("opencode-client: composed side-effect-free discovery proves zero mutation/session/model calls", () => {
  it("runs health + profile + provider + capabilities as GET-only requests and reports a bounded audit", async () => {
    const { url, server } = await startServer({
      provider: {
        status: 200,
        body: {
          connected: [PROVIDER_ID],
          default: {},
          all: [{ id: PROVIDER_ID, models: { [MODEL_ID]: { id: MODEL_ID, providerID: PROVIDER_ID, name: "n", family: "f" } } }],
        },
      },
    });
    const result = await runOpencodeSideEffectFreeDiscovery({
      env: { OPENCODE_SERVER_URL: url },
      providerId: PROVIDER_ID,
      modelId: MODEL_ID,
    });
    assert.equal(result.ok, true);
    assert.equal(result.health.healthy, true);
    assert.equal(result.provider.providerConnected, true);
    assert.equal(result.profile.ok, true);
    assert.equal(result.capabilities.ok, true);
    assert.equal(result.requestAudit.totalRequests, 4);
    assert.equal(result.requestAudit.mutatingRequestCount, 0);
    assert.ok(result.requestAudit.methods.every((method) => method === "GET"));
    assert.equal("hasCredentials" in result, false);
    assert.equal(JSON.stringify(result).includes("hasCredentials"), false);
    assert.ok(server.requests.every((record) => record.path !== "/session" && !record.path.startsWith("/session")));
  });

  it("stops after health and never calls discovery endpoints when the Server is unhealthy", async () => {
    const { url, server } = await startServer({ health: { status: 200, body: { healthy: false, version: "1.18.18" } } });
    const result = await runOpencodeSideEffectFreeDiscovery({ env: { OPENCODE_SERVER_URL: url } });
    assert.equal(result.ok, false);
    assert.equal(result.profile, null);
    assert.equal(server.requests.length, 1);
  });

  it("getOpencodeDiscoveryAudit reports the same bounded shape after real discovery calls", async () => {
    const { url } = await startServer({});
    const handle = createOpencodeDiscoveryClient({ env: { OPENCODE_SERVER_URL: url } });
    await discoverOpencodeHealth(handle);
    const audit = getOpencodeDiscoveryAudit(handle);
    assert.deepEqual(audit, { totalRequests: 1, mutatingRequestCount: 0, methods: ["GET"] });
  });
});

describe("opencode-client: sanitized audit summarization", () => {
  it("summarizes a request audit as bounded counts/methods only", () => {
    const summary = summarizeRequestAudit({
      records: [
        { method: "GET", path: "/global/health" },
        { method: "GET", path: "/agent" },
      ],
    });
    assert.deepEqual(summary, { totalRequests: 2, mutatingRequestCount: 0, methods: ["GET", "GET"] });
  });
});

describe("opencode-client: deadline and response-size constants", () => {
  it("exposes closed, positive, ascending connect/discovery/acceptance/turn bounds", () => {
    assert.ok(OPENCODE_DEADLINES_MS.connect > 0);
    assert.ok(OPENCODE_DEADLINES_MS.discovery >= OPENCODE_DEADLINES_MS.connect);
    assert.ok(OPENCODE_DEADLINES_MS.acceptance >= OPENCODE_DEADLINES_MS.discovery);
    assert.ok(OPENCODE_DEADLINES_MS.turn >= OPENCODE_DEADLINES_MS.acceptance);
    assert.deepEqual(Object.keys(OPENCODE_DEADLINES_MS).sort(), ["acceptance", "connect", "discovery", "turn"]);
  });

  it("exposes a closed, positive default response byte bound", () => {
    assert.ok(Number.isInteger(OPENCODE_MAX_RESPONSE_BYTES));
    assert.ok(OPENCODE_MAX_RESPONSE_BYTES > 0);
  });
});
