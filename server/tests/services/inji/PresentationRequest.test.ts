import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError } from "../../../services/errors.js";
import { presentationUri } from "../../../services/inji/PresentationRequest.js";
import { testRun } from "../../fixtures.js";

test("passes the verifier's request URI by reference", () => {
  const uri = new URL(
    presentationUri(
      { requestUri: "https://verify.example/vp-request/req-1" },
      testRun(),
    ).replace("openid4vp://", "https://wallet.invalid/"),
  );
  assert.equal(
    uri.searchParams.get("request_uri"),
    "https://verify.example/vp-request/req-1",
  );
});

test("a malformed request URI is a verifier error, not a server crash", () => {
  for (const requestUri of ["vp-request/req-1", "ftp://verify.example/x"])
    assert.throws(
      () => presentationUri({ requestUri }, testRun()),
      (error) =>
        error instanceof AppError &&
        error.status === 502 &&
        /invalid request URI/.test(error.message),
    );
});
