import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mdocWalletUnsupported,
  scenarios,
  scenarioUnavailable,
} from "../../models/scenarios.js";
// mDoc availability: negative scenarios are refused (gap V4), and the
// Mimoto-backed wallets cannot download mDoc (gap M12).

test("only the normal flow is available for mDoc", () => {
  for (const scenario of scenarios)
    assert.equal(
      Boolean(scenarioUnavailable(scenario.id, "INJI_MOBILE", "mso_mdoc")),
      scenario.id !== "NONE",
      scenario.id,
    );
});

test("Mimoto-backed wallets cannot download mDoc; Inji Mobile can", () => {
  assert.match(
    mdocWalletUnsupported("INJI_WEB", "mso_mdoc") ?? "",
    /no mso_mdoc format handler/,
  );
  assert.ok(mdocWalletUnsupported("INJI_MIMOTO", "mso_mdoc"));
  assert.equal(mdocWalletUnsupported("INJI_MOBILE", "mso_mdoc"), undefined);
  assert.equal(mdocWalletUnsupported("INJI_WEB", "ldp_vc"), undefined);
  assert.equal(mdocWalletUnsupported("INJI_WEB", "vc+sd-jwt"), undefined);
});
