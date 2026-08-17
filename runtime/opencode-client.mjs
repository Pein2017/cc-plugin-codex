/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Fixed-origin, auth-safe OpenCode client construction and side-effect-free
 * discovery (add-opencode-explorer-driver, Task 2).
 *
 * This module owns the one tracked loopback Server connection: it resolves
 * and validates exactly one configured literal-IP loopback origin, composes
 * optional Basic auth from the inherited operator process environment only,
 * and wraps the pinned `@opencode-ai/sdk` v2 client with bounded
 * connect/discovery/acceptance/turn deadlines, caller cancellation, a
 * fixed-origin/GET-only/reject-on-redirect fetch seam, a response byte
 * bound, and sanitized closed error codes. It never creates a session,
 * message, or prompt.
 *
 * The pinned SDK client is never returned to a caller: its low-level surface
 * (`client.client.get/post/request(...)`) accepts a per-call `baseUrl`/
 * `fetch` override that would otherwise let any holder of the returned value
 * redirect requests (and any configured Authorization header) to an
 * arbitrary origin, or issue a mutating request, bypassing this module's
 * fixed-origin/GET-only/deadline/size boundary entirely. Discovery functions
 * instead take an opaque handle; the real client lives only in a
 * module-private WeakMap keyed by that handle.
 */
import { createOpencodeClient as createOpencodeSdkClient } from "@opencode-ai/sdk/v2/client";

import { readOpencodeSecrets, resolveRuntimeEnvironment } from "./environment.mjs";

export const DEFAULT_OPENCODE_SERVER_URL = "http://127.0.0.1:4096";

// Turn deadlines are reserved here so the future session/turn Driver reuses
// one composed-deadline boundary instead of inventing a second one; Task 2
// only exercises connect/discovery. These are absolute ceilings: a handle or
// per-call request may only shorten them (see boundPositiveInteger), never
// extend or bypass them.
export const OPENCODE_DEADLINES_MS = Object.freeze({
  connect: 5_000,
  discovery: 10_000,
  acceptance: 15_000,
  turn: 120_000,
});

// Absolute ceiling on a single discovery response body, enforced at the fetch
// seam for both a declared Content-Length and a streamed/chunked body. It is
// the ceiling for every discovery path except the one documented exception
// below.
export const OPENCODE_MAX_RESPONSE_BYTES = 262_144; // 256 KiB

/** The one path whose response is the provider catalog (`provider.list`). */
export const OPENCODE_PROVIDER_CATALOG_PATH = "/provider";

/**
 * The provider-catalog endpoint's own hard ceiling.
 *
 * That endpoint legitimately carries the Server's hydrated models.dev registry:
 * an operator Server that reached the registry at start answers it with the
 * complete provider/model metadata catalog -- measured live at 188 providers,
 * ~308 KB on the wire and ~5.0 MB decoded, which the 256 KiB discovery bound
 * refused outright, leaving the exact model route permanently unconfirmable.
 * Every other discovery response keeps the 256 KiB bound; only this path gets
 * the larger one, and it is still a hard cap rather than an unbounded read.
 *
 * Both ceilings are frozen module constants. A caller may shorten either one
 * (see `boundPositiveInteger`), and can never widen or bypass one.
 */
export const OPENCODE_MAX_PROVIDER_CATALOG_RESPONSE_BYTES = 8_388_608; // 8 MiB

/**
 * The frozen response ceiling for one request path, resolved before the network
 * call. The catalog path is matched exactly: a neighbouring endpoint such as
 * `/api/provider`, `/provider/auth`, or `/provider/` keeps the global bound.
 */
export function resolveOpencodeResponseCeiling(pathname) {
  return pathname === OPENCODE_PROVIDER_CATALOG_PATH
    ? OPENCODE_MAX_PROVIDER_CATALOG_RESPONSE_BYTES
    : OPENCODE_MAX_RESPONSE_BYTES;
}

const MAX_ARRAY_LENGTH = 256;
const MAX_FIELD_LENGTH = 512;

/**
 * Absolute ceiling on the number of provider entries in the catalog payload.
 * The hydrated models.dev registry is measured live at 188 providers, so the
 * shared 256-entry array bound left only ~27% headroom before ordinary
 * registry growth would fail the catalog read as `malformed_response` and
 * leave readiness permanently unconfirmable. The catalog byte ceiling remains
 * the real payload limit; this bound only keeps iteration finite.
 */
export const OPENCODE_MAX_PROVIDER_CATALOG_ENTRIES = 2048;

export class OpencodeClientError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "OpencodeClientError";
    this.code = code;
  }
}

function nonEmptyString(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

/**
 * Only a literal IP loopback origin is admitted (127.0.0.1, or a correctly
 * parsed [::1]). "localhost" is deliberately rejected: it requires a
 * resolver step between validation and connection (a DNS/TOCTOU gap, e.g. a
 * misconfigured or poisoned /etc/hosts), while a literal IP address needs no
 * resolution and cannot be redirected elsewhere after validation.
 */
export function isLoopbackOpencodeUrl(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl));
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (url.search || url.hash) return false;
  if (url.pathname !== "" && url.pathname !== "/") return false;
  return url.hostname === "127.0.0.1" || url.hostname === "[::1]";
}

/** Resolves and validates the one tracked loopback Server origin from a merged runtime environment. */
export function resolveOpencodeServerUrl(env) {
  const configured = nonEmptyString(env?.OPENCODE_SERVER_URL) ?? DEFAULT_OPENCODE_SERVER_URL;
  if (!isLoopbackOpencodeUrl(configured)) {
    throw new OpencodeClientError(
      "invalid_server_url",
      "OPENCODE_SERVER_URL must be a literal-IP loopback http(s) origin with no credentials, query, fragment, or path"
    );
  }
  const normalized = new URL(configured);
  return `${normalized.protocol}//${normalized.host}`;
}

function buildAuthorizationHeader(secrets) {
  const { username, password } = secrets;
  if (!username && !password) return null;
  if (!username || !password) {
    throw new OpencodeClientError(
      "credentials_incomplete",
      "OPENCODE_SERVER_USERNAME and OPENCODE_SERVER_PASSWORD must both be set together"
    );
  }
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

/**
 * A positive finite integer request may only shorten the Driver-owned
 * ceiling, never extend or bypass it: invalid (non-integer, non-finite,
 * non-positive), equal, or larger requests all fall back to the ceiling
 * itself.
 */
export function boundPositiveInteger(requested, ceiling) {
  if (typeof requested === "number" && Number.isInteger(requested) && requested > 0 && requested < ceiling) {
    return requested;
  }
  return ceiling;
}

function boundResponseSize(response, maxResponseBytes) {
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    const declaredBytes = Number(declared);
    if (Number.isFinite(declaredBytes) && declaredBytes > maxResponseBytes) {
      if (response.body) response.body.cancel().catch(() => {});
      throw new OpencodeClientError("response_too_large", "response exceeded the bounded size limit");
    }
  }
  if (!response.body) return response;
  let received = 0;
  const limiter = new TransformStream({
    transform(chunk, controller) {
      received += chunk.byteLength;
      if (received > maxResponseBytes) {
        controller.error(new OpencodeClientError("response_too_large", "response exceeded the bounded size limit"));
        return;
      }
      controller.enqueue(chunk);
    },
  });
  return new Response(response.body.pipeThrough(limiter), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

/**
 * Builds the one fetch implementation ever wired into the pinned SDK client.
 * Every request that reaches the network must pass through here: it rejects
 * a differing origin and blocks any non-GET method before any network call
 * (not after), forces redirect rejection regardless of the incoming
 * Request's own redirect mode, records only a bounded method/path audit
 * entry for allowed requests, and bounds the response size at both the
 * declared-Content-Length and streamed-byte level using the frozen ceiling for
 * that request's own path (`maxResponseBytes` may only shorten it). Exported for a direct
 * controlled-wrapper test; this is an internal seam, not runtime/index
 * public API.
 */
export function createFixedOriginFetch({ baseOrigin, maxResponseBytes, auditRecords }) {
  return async function fixedOriginFetch(input) {
    const request = input instanceof Request ? input : new Request(input);
    let requestUrl;
    try {
      requestUrl = new URL(request.url);
    } catch {
      throw new OpencodeClientError("cross_origin_rejected", "request URL could not be parsed");
    }
    if (requestUrl.origin !== baseOrigin) {
      throw new OpencodeClientError("cross_origin_rejected", "cross-origin request rejected");
    }
    if (request.method !== "GET") {
      throw new OpencodeClientError("mutating_request_blocked", "non-GET request blocked before network");
    }
    // The size ceiling is chosen from the request's own path before the network
    // call, never from the response, a header, or a caller-supplied widening: a
    // request may only ever shorten the frozen ceiling for its path.
    const effectiveMaxResponseBytes = boundPositiveInteger(
      maxResponseBytes,
      resolveOpencodeResponseCeiling(requestUrl.pathname)
    );
    const outboundRequest = new Request(request, { redirect: "error" });
    auditRecords.push({ method: outboundRequest.method, path: requestUrl.pathname });
    const response = await fetch(outboundRequest);
    return boundResponseSize(response, effectiveMaxResponseBytes);
  };
}

export function summarizeRequestAudit(requestAudit) {
  const methods = requestAudit.records.map((record) => record.method);
  return {
    totalRequests: requestAudit.records.length,
    mutatingRequestCount: methods.filter((method) => method !== "GET").length,
    methods,
  };
}

const HANDLE_ENTRIES = new WeakMap();

class OpencodeDiscoveryHandle {
  constructor(serverUrl) {
    this.serverUrl = serverUrl;
    Object.freeze(this);
  }
}

/** @typedef {InstanceType<typeof OpencodeDiscoveryHandle>} OpencodeDiscoveryHandleType */

function requireHandleEntry(handle) {
  const entry = handle instanceof OpencodeDiscoveryHandle ? HANDLE_ENTRIES.get(handle) : undefined;
  if (!entry) {
    throw new OpencodeClientError("invalid_discovery_handle", "not a valid OpenCode discovery handle");
  }
  return entry;
}

/**
 * Constructs the one pinned, fixed-origin OpenCode SDK client and returns
 * only an opaque handle: no `.client`, no credential-presence flag, and no
 * live audit records are ever exposed on it. Performs no I/O beyond
 * validation.
 *
 * @param {{env?: NodeJS.ProcessEnv, cwd?: string, envFile?: string, connectTimeoutMs?: number,
 *   discoveryTimeoutMs?: number, maxResponseBytes?: number}} [options]
 */
export function createOpencodeDiscoveryClient(options = {}) {
  const rawEnv = options.env ?? process.env;
  const { env: mergedEnv } = resolveRuntimeEnvironment({ cwd: options.cwd, envFile: options.envFile, env: rawEnv });
  const serverUrl = resolveOpencodeServerUrl(mergedEnv);
  const secrets = readOpencodeSecrets(rawEnv);
  const authorizationHeader = buildAuthorizationHeader(secrets);
  const baseOrigin = new URL(serverUrl).origin;
  // The requested bound is passed through unbounded on purpose: the fetch seam
  // bounds it against the frozen ceiling for each request's own path, so
  // pre-bounding it here against the global ceiling would silently cap the
  // provider catalog back down to 256 KiB.
  const maxResponseBytes = options.maxResponseBytes ?? null;
  const connectCeilingMs = boundPositiveInteger(options.connectTimeoutMs, OPENCODE_DEADLINES_MS.connect);
  const discoveryCeilingMs = boundPositiveInteger(options.discoveryTimeoutMs, OPENCODE_DEADLINES_MS.discovery);
  const requestAudit = { records: [] };
  const sdkClient = createOpencodeSdkClient({
    baseUrl: serverUrl,
    fetch: createFixedOriginFetch({ baseOrigin, maxResponseBytes, auditRecords: requestAudit.records }),
    headers: authorizationHeader ? { authorization: authorizationHeader } : undefined,
    redirect: "error",
  });
  const handle = new OpencodeDiscoveryHandle(serverUrl);
  HANDLE_ENTRIES.set(handle, { sdkClient, requestAudit, connectCeilingMs, discoveryCeilingMs });
  return handle;
}

/** Returns the bounded, sanitized request audit summary for a discovery handle. */
export function getOpencodeDiscoveryAudit(handle) {
  return summarizeRequestAudit(requireHandleEntry(handle).requestAudit);
}

function composeDeadlineSignal(timeoutMs, callerSignal) {
  const signals = [AbortSignal.timeout(timeoutMs)];
  if (callerSignal) signals.push(callerSignal);
  return AbortSignal.any(signals);
}

function classifyDiscoveryFailure(error, response) {
  if (error instanceof OpencodeClientError) return { code: error.code, retryable: false };
  if (response) {
    const status = response.status;
    if (status === 401 || status === 403) return { code: "auth_failed", retryable: false };
    if (status >= 500) return { code: "server_error", retryable: true };
    return { code: "bad_request", retryable: false };
  }
  if (error) {
    if (error.name === "TimeoutError") return { code: "deadline_exceeded", retryable: true };
    if (error.name === "AbortError") return { code: "aborted_by_caller", retryable: false };
    if (error?.cause?.message === "unexpected redirect") return { code: "redirect_rejected", retryable: false };
    if (error instanceof SyntaxError) return { code: "malformed_response", retryable: false };
    return { code: "network_error", retryable: true };
  }
  return { code: "unknown_error", retryable: false };
}

function isBoundedString(value, maxLength = MAX_FIELD_LENGTH) {
  return typeof value === "string" && value.length <= maxLength;
}

function isBoundedNullableString(value, maxLength = MAX_FIELD_LENGTH) {
  return value === null || value === undefined || isBoundedString(value, maxLength);
}

/**
 * @param {OpencodeDiscoveryHandleType} handle
 * @param {{signal?: AbortSignal, timeoutMs?: number}} [options]
 */
export async function discoverOpencodeHealth(handle, options = {}) {
  const entry = requireHandleEntry(handle);
  const timeoutMs = boundPositiveInteger(options.timeoutMs, entry.connectCeilingMs);
  const deadlineSignal = composeDeadlineSignal(timeoutMs, options.signal);
  try {
    const result = await entry.sdkClient.global.health({ signal: deadlineSignal });
    if (result.error !== undefined || !result.data) {
      return { ok: false, ...classifyDiscoveryFailure(result.error, result.response) };
    }
    if (typeof result.data.healthy !== "boolean" || !isBoundedNullableString(result.data.version)) {
      return { ok: false, code: "malformed_response", retryable: false };
    }
    return { ok: true, healthy: result.data.healthy, version: result.data.version ?? null };
  } catch (error) {
    return { ok: false, ...classifyDiscoveryFailure(error, undefined) };
  }
}

/**
 * @param {OpencodeDiscoveryHandleType} handle
 * @param {{signal?: AbortSignal, timeoutMs?: number}} [options]
 */
export async function discoverOpencodeProfile(handle, options = {}) {
  const entry = requireHandleEntry(handle);
  const timeoutMs = boundPositiveInteger(options.timeoutMs, entry.discoveryCeilingMs);
  const deadlineSignal = composeDeadlineSignal(timeoutMs, options.signal);
  try {
    const result = await entry.sdkClient.app.agents({}, { signal: deadlineSignal });
    if (result.error !== undefined) return { ok: false, ...classifyDiscoveryFailure(result.error, result.response) };
    if (!Array.isArray(result.data) || result.data.length > MAX_ARRAY_LENGTH) {
      return { ok: false, code: "malformed_response", retryable: false };
    }
    const agents = [];
    for (const agent of result.data) {
      if (!agent || typeof agent !== "object") continue;
      if (typeof agent.name !== "string") continue;
      if (!isBoundedString(agent.name) || !isBoundedNullableString(agent.mode)) {
        return { ok: false, code: "malformed_response", retryable: false };
      }
      agents.push({
        name: agent.name,
        mode: typeof agent.mode === "string" ? agent.mode : null,
        native: agent.native === true,
      });
    }
    return { ok: true, agents };
  } catch (error) {
    return { ok: false, ...classifyDiscoveryFailure(error, undefined) };
  }
}

/**
 * @param {OpencodeDiscoveryHandleType} handle
 * @param {{providerId?: string, modelId?: string, signal?: AbortSignal, timeoutMs?: number}} [options]
 */
export async function discoverOpencodeProviderCatalog(handle, options = {}) {
  const entry = requireHandleEntry(handle);
  const { providerId, modelId } = options;
  if (!providerId || !modelId) {
    throw new OpencodeClientError("provider_target_required", "providerId and modelId are required");
  }
  const timeoutMs = boundPositiveInteger(options.timeoutMs, entry.discoveryCeilingMs);
  const deadlineSignal = composeDeadlineSignal(timeoutMs, options.signal);
  try {
    const result = await entry.sdkClient.provider.list({}, { signal: deadlineSignal });
    if (result.error !== undefined) return { ok: false, ...classifyDiscoveryFailure(result.error, result.response) };
    const payload = result.data;
    if (
      !payload ||
      !Array.isArray(payload.all) ||
      !Array.isArray(payload.connected) ||
      payload.all.length > OPENCODE_MAX_PROVIDER_CATALOG_ENTRIES ||
      payload.connected.length > MAX_ARRAY_LENGTH
    ) {
      return { ok: false, code: "malformed_response", retryable: false };
    }
    if (!payload.connected.every((id) => isBoundedString(id))) {
      return { ok: false, code: "malformed_response", retryable: false };
    }
    const connected = payload.connected;
    const provider = payload.all.find((candidate) => candidate && candidate.id === providerId);
    const rawModel = provider && provider.models && typeof provider.models === "object" ? provider.models[modelId] : undefined;
    if (
      rawModel !== undefined &&
      (!isBoundedNullableString(rawModel.id) ||
        !isBoundedNullableString(rawModel.providerID) ||
        !isBoundedNullableString(rawModel.name) ||
        !isBoundedNullableString(rawModel.family))
    ) {
      return { ok: false, code: "malformed_response", retryable: false };
    }
    const model = rawModel
      ? {
          id: typeof rawModel.id === "string" ? rawModel.id : null,
          providerID: typeof rawModel.providerID === "string" ? rawModel.providerID : null,
          name: typeof rawModel.name === "string" ? rawModel.name : null,
          family: typeof rawModel.family === "string" ? rawModel.family : null,
        }
      : null;
    return {
      ok: true,
      providerPresent: Boolean(provider),
      providerConnected: connected.includes(providerId),
      model,
    };
  } catch (error) {
    return { ok: false, ...classifyDiscoveryFailure(error, undefined) };
  }
}

/**
 * @param {OpencodeDiscoveryHandleType} handle
 * @param {{signal?: AbortSignal, timeoutMs?: number}} [options]
 */
export async function discoverOpencodeCapabilities(handle, options = {}) {
  const entry = requireHandleEntry(handle);
  const timeoutMs = boundPositiveInteger(options.timeoutMs, entry.discoveryCeilingMs);
  const deadlineSignal = composeDeadlineSignal(timeoutMs, options.signal);
  try {
    const result = await entry.sdkClient.experimental.capabilities.get({}, { signal: deadlineSignal });
    if (result.error !== undefined) return { ok: false, ...classifyDiscoveryFailure(result.error, result.response) };
    const payload = result.data;
    if (!payload || typeof payload !== "object") return { ok: false, code: "malformed_response", retryable: false };
    return { ok: true, backgroundSubagents: payload.backgroundSubagents === true };
  } catch (error) {
    return { ok: false, ...classifyDiscoveryFailure(error, undefined) };
  }
}

/**
 * Absolute ceiling on the number of permission rules one resolved Agent policy
 * may carry. The Server merges configuration-level rules ahead of an Agent's
 * own, so a real ruleset is hundreds of rules long; this bound keeps a drifting
 * or hostile Server from handing the validator an unbounded array.
 */
export const OPENCODE_MAX_PERMISSION_RULES = 4096;

/**
 * Every field the pinned SDK's `Agent` type declares. A resolved Agent that
 * carries anything else is not the contract this checkout pinned, so the count
 * of unknown fields is reported rather than silently dropped: a future policy
 * field (a second tool map, for example) must fail readiness, not be ignored.
 */
const OPENCODE_AGENT_FIELDS = Object.freeze([
  "color",
  "description",
  "hidden",
  "mode",
  "model",
  "name",
  "native",
  "options",
  "permission",
  "prompt",
  "steps",
  "temperature",
  "topP",
  "variant",
]);

const OPENCODE_PERMISSION_ACTIONS = Object.freeze(["allow", "deny", "ask"]);

/**
 * Projects one resolved Agent into the bounded typed policy the Explorer
 * profile validator consumes, or `null` when the payload is not the pinned
 * shape. Provider option *values* never cross this boundary (only their count),
 * and the permission ruleset is passed through verbatim because its patterns
 * are the policy: they may hold operator-absolute paths, so only the
 * validator's own closed report is ever serialized.
 */
function projectOpencodeAgentPolicy(agent) {
  if (!Array.isArray(agent.permission) || agent.permission.length > OPENCODE_MAX_PERMISSION_RULES) return null;
  const ruleset = [];
  for (const rule of agent.permission) {
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) return null;
    if (!isBoundedString(rule.permission) || !isBoundedString(rule.pattern)) return null;
    if (!OPENCODE_PERMISSION_ACTIONS.includes(rule.action)) return null;
    ruleset.push({ permission: rule.permission, pattern: rule.pattern, action: rule.action });
  }
  if (agent.mode !== undefined && !isBoundedString(agent.mode)) return null;
  if (agent.variant !== undefined && !isBoundedNullableString(agent.variant)) return null;
  let model = null;
  if (agent.model !== undefined && agent.model !== null) {
    if (typeof agent.model !== "object" || Array.isArray(agent.model)) return null;
    if (!isBoundedString(agent.model.providerID) || !isBoundedString(agent.model.modelID)) return null;
    model = { providerID: agent.model.providerID, modelID: agent.model.modelID };
  }
  if (agent.options !== undefined) {
    if (!agent.options || typeof agent.options !== "object" || Array.isArray(agent.options)) return null;
  }
  return {
    name: agent.name,
    mode: agent.mode === undefined ? null : agent.mode,
    native: agent.native === true,
    hidden: agent.hidden === true,
    model,
    variant: typeof agent.variant === "string" ? agent.variant : null,
    optionKeyCount: agent.options === undefined ? 0 : Object.keys(agent.options).length,
    unknownFieldCount: Object.keys(agent).filter((field) => !OPENCODE_AGENT_FIELDS.includes(field)).length,
    ruleset,
  };
}

/**
 * Reads the resolved policy of exactly one named Agent profile. This is a
 * side-effect-free GET like every other discovery call: it creates no session,
 * message, or prompt, and it never returns the other Agents' names, so a
 * readiness report cannot disclose the operator's full Agent list.
 *
 * @param {OpencodeDiscoveryHandleType} handle
 * @param {{name?: string, signal?: AbortSignal, timeoutMs?: number}} [options] a bounded
 *   profile `name` is required; an absent or oversized one is refused.
 */
export async function discoverOpencodeAgentPolicy(handle, options = {}) {
  const entry = requireHandleEntry(handle);
  const name = nonEmptyString(options.name);
  if (!name || name.length > MAX_FIELD_LENGTH) {
    throw new OpencodeClientError("profile_target_required", "a bounded profile name is required");
  }
  const timeoutMs = boundPositiveInteger(options.timeoutMs, entry.discoveryCeilingMs);
  const deadlineSignal = composeDeadlineSignal(timeoutMs, options.signal);
  try {
    const result = await entry.sdkClient.app.agents({}, { signal: deadlineSignal });
    if (result.error !== undefined) return { ok: false, ...classifyDiscoveryFailure(result.error, result.response) };
    if (!Array.isArray(result.data) || result.data.length > MAX_ARRAY_LENGTH) {
      return { ok: false, code: "malformed_response", retryable: false };
    }
    const matches = result.data.filter(
      (agent) => agent && typeof agent === "object" && !Array.isArray(agent) && agent.name === name
    );
    if (matches.length === 0) return { ok: true, present: false, agent: null };
    // Two Agents answering to one name is ambiguous policy, not a profile.
    if (matches.length > 1) return { ok: false, code: "malformed_response", retryable: false };
    const agent = projectOpencodeAgentPolicy(matches[0]);
    if (!agent) return { ok: false, code: "malformed_response", retryable: false };
    return { ok: true, present: true, agent };
  } catch (error) {
    return { ok: false, ...classifyDiscoveryFailure(error, undefined) };
  }
}

/**
 * Orchestrates the fixed-origin client plus health/profile/provider/capabilities
 * discovery in one bounded, side-effect-free call. Never creates a session,
 * message, or prompt; throws if any dispatched request was not a GET. Never
 * discloses credential presence.
 *
 * @param {{env?: NodeJS.ProcessEnv, cwd?: string, envFile?: string, signal?: AbortSignal,
 *   connectTimeoutMs?: number, discoveryTimeoutMs?: number, maxResponseBytes?: number,
 *   providerId?: string, modelId?: string}} [options]
 */
export async function runOpencodeSideEffectFreeDiscovery(options = {}) {
  const handle = createOpencodeDiscoveryClient(options);
  const health = await discoverOpencodeHealth(handle, { signal: options.signal });
  if (!health.ok || !health.healthy) {
    return {
      ok: false,
      serverUrl: handle.serverUrl,
      health,
      profile: null,
      provider: null,
      capabilities: null,
      requestAudit: getOpencodeDiscoveryAudit(handle),
    };
  }
  const [profile, provider, capabilities] = await Promise.all([
    discoverOpencodeProfile(handle, { signal: options.signal }),
    options.providerId && options.modelId
      ? discoverOpencodeProviderCatalog(handle, {
          providerId: options.providerId,
          modelId: options.modelId,
          signal: options.signal,
        })
      : Promise.resolve(null),
    discoverOpencodeCapabilities(handle, { signal: options.signal }),
  ]);
  const audit = getOpencodeDiscoveryAudit(handle);
  if (audit.mutatingRequestCount > 0) {
    throw new OpencodeClientError(
      "mutating_request_detected",
      "discovery issued a mutating request; refusing to publish a discovery result"
    );
  }
  return { ok: true, serverUrl: handle.serverUrl, health, profile, provider, capabilities, requestAudit: audit };
}
