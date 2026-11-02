// Shared with the client. A stock Inji Mobile only trusts publicly issued TLS
// certificates and must resolve the host from the phone's own network.
export function phoneReachability(origin: string): {
  reachable: boolean;
  reason?: string;
} {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return {
      reachable: false,
      reason: "No public issuer origin is configured.",
    };
  }
  if (url.protocol !== "https:")
    return {
      reachable: false,
      reason: "Inji Mobile requires HTTPS with a publicly trusted certificate.",
    };
  const host = url.hostname;
  // sslip.io and nip.io names resolve to the IP address embedded in them.
  const embedded = /(?:^|[.-])(\d{1,3}(?:[.-]\d{1,3}){3})\.(?:sslip|nip)\.io$/
    .exec(host)?.[1]
    ?.replaceAll("-", ".");
  const ip = embedded ?? (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) ? host : "");
  const [a = 0, b = 0] = ip.split(".").map(Number);
  // Loopback, link-local and private address ranges, and names that resolve
  // only on a local network.
  const local =
    ["localhost", "[::1]"].includes(host) ||
    /\.(?:localhost|local|internal|lan|home\.arpa)$/.test(host) ||
    (ip !== "" &&
      (a === 10 ||
        a === 127 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168)));
  return local
    ? {
        reachable: false,
        reason: `${host} only resolves on this computer or its local network, and phones do not trust its certificate.`,
      }
    : { reachable: true };
}
