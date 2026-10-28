import { Smartphone, TriangleAlert } from "lucide-react";
import { phoneReachability } from "../../../../server/models/mobile";

export function MobileReadiness({ issuerUrl }: { issuerUrl: string }) {
  const { reachable, reason } = phoneReachability(issuerUrl);
  return reachable ? (
    <div
      role="status"
      className="flex gap-3 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm leading-6 text-teal-900"
    >
      <Smartphone size={18} className="mt-1 shrink-0" />
      <p>
        Your phone reaches this issuer at{" "}
        <span className="font-mono break-all">{issuerUrl}</span>. Use Inji
        Mobile 0.22: <strong>Add card → Scan &amp; Download Card</strong> for
        issuance, and <strong>Scan</strong> for verification.
      </p>
    </div>
  ) : (
    <div
      role="alert"
      className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900"
    >
      <TriangleAlert size={18} className="mt-1 shrink-0" />
      <div>
        <p>{reason}</p>
        <p className="mt-1">
          Run{" "}
          <code className="font-mono text-xs">
            node infra/inji/scripts/local/mobile.mjs start
          </code>{" "}
          to publish the wallet endpoints on a temporary HTTPS URL, then reload
          this page.
        </p>
      </div>
    </div>
  );
}
