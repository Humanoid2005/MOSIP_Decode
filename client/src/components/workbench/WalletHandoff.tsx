import { qrHandoff } from "../../../../server/models/scenarios";
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, ExternalLink, ScanLine } from "lucide-react";
import { copyText } from "../../services/clipboard";
// Hands a credential offer or presentation request to Inji Web or Inji Mobile
// as a QR code, a deep link and a copyable link. A URI too large to scan
// reliably gets no QR code. RunStage turns deepLink off for Inji Mobile
// offers, which are scanned in the app; webUrl and webPresentationUrl add
// Inji Web buttons. Without a URI, the user is told to start the download
// from the wallet itself.
export function WalletHandoff({
  uri,
  webUrl,
  webPresentationUrl,
  instruction,
  deepLink = true,
}: {
  uri?: string;
  webUrl?: string;
  webPresentationUrl?: string;
  instruction?: string;
  deepLink?: boolean;
}) {
  const [message, setMessage] = useState("");
  const fitsQr = uri && qrHandoff(uri).fitsQr;
  return (
    <div className="my-6 flex flex-col items-center gap-4 rounded-xl bg-slate-50 p-6 text-center">
      {fitsQr ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <QRCodeSVG
            value={uri}
            size={200}
            level="M"
            title="Scan with your Inji wallet"
          />
        </div>
      ) : (
        <ScanLine size={44} className="text-teal-700" />
      )}
      {uri ? (
        <>
          <p className="max-w-sm text-sm leading-6 text-slate-500">
            {!fitsQr
              ? "This request is too large for a reliable QR code. Copy the link or open it on the wallet device."
              : (instruction ??
                "Scan with Inji Wallet, or open the link on the wallet device.")}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {webPresentationUrl && (
              <a
                href={webPresentationUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-primary"
              >
                Present with Inji Web
                <ExternalLink size={15} />
              </a>
            )}
            {deepLink && (
              <a href={uri} className="btn-primary">
                Open wallet
                <ExternalLink size={15} />
              </a>
            )}
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                copyText(uri)
                  .then(() => setMessage("Wallet link copied."))
                  .catch(() =>
                    setMessage(
                      "Clipboard access unavailable. Select the link below to copy it.",
                    ),
                  );
              }}
            >
              <Copy size={15} />
              Copy link
            </button>
          </div>
          <p aria-live="polite" className="text-xs text-slate-500">
            {message}
          </p>
          <details className="w-full text-left">
            <summary className="cursor-pointer text-xs text-slate-500">
              View wallet link
            </summary>
            <textarea
              aria-label="Wallet link"
              readOnly
              value={uri}
              className="field min-h-24 break-all font-mono"
            />
          </details>
        </>
      ) : (
        <>
          <p className="max-w-sm text-sm leading-6 text-slate-500">
            {webUrl
              ? "Open Inji Web, select your issuer and credential, then complete authentication and download."
              : "Open Inji Mobile, select your configured issuer and credential, then complete authentication and download."}
          </p>
          {webUrl && (
            <a
              href={webUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-primary"
            >
              Open Inji Web
              <ExternalLink size={15} />
            </a>
          )}
        </>
      )}
    </div>
  );
}
