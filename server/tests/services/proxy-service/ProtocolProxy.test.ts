import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import { after, before, test } from "node:test";
import { bridge, listen } from "./bridge.js";
// ProtocolProxy forwarding: the path and method allowlist, an unconfigured
// upstream, and byte-for-byte relaying.

let upstream: Awaited<ReturnType<typeof listen>>;
let proxy: Awaited<ReturnType<typeof bridge>>;
// Requests that reached the stub upstream, which answers every one with 201
// and a header the bridge must not relay.
const received: {
  method?: string;
  url?: string;
  headers: IncomingMessage["headers"];
  body: string;
}[] = [];

before(async () => {
  upstream = await listen((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      received.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: Buffer.concat(chunks).toString(),
      });
      res.writeHead(201, {
        "content-type": "application/json",
        "x-internal": "hidden",
      });
      res.end('{"c_nonce":"fresh"}');
    });
  });
  proxy = await bridge(upstream.url);
});
after(async () => {
  await proxy.close();
  await upstream.close();
});

for (const [name, path, method] of [
  ["unknown bridges", "/bridge/admin/credential", "GET"],
  ["paths outside the allowlist", "/bridge/certify/admin", "GET"],
  ["encoded traversal", "/bridge/verify/vp-request/%2e%2e/admin", "GET"],
  ["encoded backslash traversal", "/bridge/verify/vp-request/a%5cb", "GET"],
  ["methods other than GET and POST", "/bridge/certify/credential", "PUT"],
] as const)
  test(`rejects ${name}`, async () => {
    const before = received.length;
    const response = await fetch(`${proxy.url}${path}`, { method });
    assert.equal(response.status, 404);
    assert.equal(received.length, before);
  });

test("reports an unconfigured upstream as a conflict", async () => {
  const response = await fetch(`${proxy.url}/bridge/authorization/token`, {
    method: "POST",
  });
  assert.equal(response.status, 409);
});

test("forwards allowed requests byte-for-byte without cookies", async () => {
  // The irregular spacing would not survive JSON re-serialisation.
  const body = '{"proof":{"jwt":"a.b.c"},  "format":"vc+sd-jwt"}';
  const response = await fetch(`${proxy.url}/bridge/certify/credential?x=1`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer t",
      cookie: "session=1",
    },
    body,
  });
  assert.equal(response.status, 201);
  assert.equal(await response.text(), '{"c_nonce":"fresh"}');
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.equal(response.headers.get("x-internal"), null);
  const forwarded = received.at(-1)!;
  assert.equal(forwarded.url, "/credential?x=1");
  assert.equal(forwarded.body, body);
  assert.equal(forwarded.headers.authorization, "Bearer t");
  assert.equal(forwarded.headers.cookie, undefined);
});
