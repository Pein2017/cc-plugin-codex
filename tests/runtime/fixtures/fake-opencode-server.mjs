/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * A minimal configurable HTTP fake of the OpenCode Server's side-effect-free
 * GET surface (health/agents/provider/capabilities), used to deterministically
 * exercise runtime/opencode-client.mjs discovery without a real Server. Only
 * the exact pinned endpoints production code calls are implemented; there is
 * no session/message/prompt route, so a client that ever tried one would 404.
 */
import http from "node:http";

const ROUTES = {
  "/global/health": "health",
  "/agent": "agents",
  "/provider": "provider",
  "/experimental/capabilities": "capabilities",
};

export function createFakeOpencodeServer(scenario = {}) {
  const state = {
    health: scenario.health ?? { status: 200, body: { healthy: true, version: "1.18.18" } },
    agents: scenario.agents ?? { status: 200, body: [{ name: "codex-explorer", mode: "primary", native: false }] },
    provider: scenario.provider ?? { status: 200, body: { all: [], connected: [], default: {} } },
    capabilities: scenario.capabilities ?? { status: 200, body: { backgroundSubagents: false } },
    auth: scenario.auth ?? null,
    delayMsByPath: scenario.delayMsByPath ?? {},
    hangPaths: new Set(scenario.hangPaths ?? []),
    redirectPaths: scenario.redirectPaths ?? {},
    malformedPaths: new Set(scenario.malformedPaths ?? []),
    // path -> declares a Content-Length far larger than the body actually sent,
    // to exercise a declared-size precheck without transferring real bytes.
    oversizedDeclaredLengthPaths: new Set(scenario.oversizedDeclaredLengthPaths ?? []),
    // path -> total bytes to actually stream with no Content-Length header
    // (chunked), to exercise a streaming/decoded size cap.
    oversizedStreamingPaths: scenario.oversizedStreamingPaths ?? {},
  };
  const requests = [];

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://placeholder.invalid");
    const pathname = url.pathname;
    requests.push({
      method: req.method,
      path: pathname,
      hasAuthorizationHeader: Boolean(req.headers.authorization),
    });

    if (state.hangPaths.has(pathname)) return; // never responds; caller deadline must fire

    if (state.auth) {
      const expected = `Basic ${Buffer.from(`${state.auth.username}:${state.auth.password}`, "utf8").toString("base64")}`;
      if (req.headers.authorization !== expected) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "unauthorized" }));
        return;
      }
    }

    if (state.redirectPaths[pathname]) {
      res.writeHead(302, { Location: state.redirectPaths[pathname] });
      res.end();
      return;
    }

    if (state.oversizedDeclaredLengthPaths.has(pathname)) {
      res.writeHead(200, { "Content-Type": "application/json", "Content-Length": "999999999" });
      res.end(JSON.stringify({ healthy: true, version: "1.18.18" }));
      return;
    }

    if (pathname in state.oversizedStreamingPaths) {
      res.writeHead(200, { "Content-Type": "application/json" }); // no Content-Length => chunked
      const totalBytes = state.oversizedStreamingPaths[pathname];
      const chunk = Buffer.alloc(4096, 0x20);
      let sent = 0;
      const pump = () => {
        if (sent >= totalBytes) {
          res.end();
          return;
        }
        const size = Math.min(chunk.length, totalBytes - sent);
        res.write(chunk.subarray(0, size));
        sent += size;
        setImmediate(pump);
      };
      pump();
      return;
    }

    const respond = () => {
      if (state.malformedPaths.has(pathname)) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{not-valid-json");
        return;
      }
      const key = ROUTES[pathname];
      const entry = key ? state[key] : null;
      if (!entry) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "not found" }));
        return;
      }
      res.writeHead(entry.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(entry.body));
    };

    const delay = state.delayMsByPath[pathname];
    if (delay) setTimeout(respond, delay);
    else respond();
  });

  return {
    requests,
    async listen() {
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const { port } = server.address();
      return `http://127.0.0.1:${port}`;
    },
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
