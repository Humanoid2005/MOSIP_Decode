const host = (origin) => new URL(origin).host;
// did:web percent-encodes a port separator in the host.
const didHost = (origin) => host(origin).replaceAll(":", "%3A");
const literal = (value) => "'" + value.replaceAll("'", "''") + "'";

// Certify stores the issuer DID and the JSON-LD context URL in its database
// when the volume is created; move both to the new public origin.
export function identitySql(fromOrigin, toOrigin) {
  const pairs = [
    ["https://" + host(fromOrigin), "https://" + host(toOrigin)],
    ["did:web:" + didHost(fromOrigin), "did:web:" + didHost(toOrigin)],
  ];
  const rewrite = (expression) =>
    pairs.reduce(
      (sql, [from, to]) => `replace(${sql}, ${literal(from)}, ${literal(to)})`,
      expression,
    );
  const template = `replace(encode(convert_to(${rewrite(
    "convert_from(decode(vc_template, 'base64'), 'UTF8')",
  )}, 'UTF8'), 'base64'), E'\\n', '')`;
  return [
    "BEGIN;",
    `UPDATE certify.credential_config SET did_url = ${rewrite("did_url")}, vc_template = ${template};`,
    "COMMIT;",
    "",
  ].join("\n");
}

// cloudflared prints the quick-tunnel URL in a banner; the latest one wins.
// Failed requests to its API log api.trycloudflare.com, which is not a tunnel.
export function tunnelOrigin(logs) {
  return logs
    .match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g)
    ?.filter((url) => url !== "https://api.trycloudflare.com")
    .at(-1);
}
