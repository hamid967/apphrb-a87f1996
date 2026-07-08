import { describe, it, expect } from "vitest";

const URL = "http://localhost:8080/lovable/email/auth/webhook";

async function post(headers: Record<string, string>, body = "{}") {
  return fetch(URL, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

describe("POST /lovable/email/auth/webhook — signature/timestamp guards", () => {
  it("rejects unsigned probe with 401 and a canonical Unauthorized body", async () => {
    const res = await post({});
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error?: string };
    // The unsigned-probe branch returns the generic "Unauthorized" body;
    // the signed-but-invalid branches return "Invalid signature" / "Missing
    // timestamp header" instead. Asserting on this string is what proves
    // the request short-circuited on the cheap probe filter rather than
    // reaching WebhookError parsing (which would otherwise log an error).
    expect(json.error).toBe("Unauthorized");
  });

  it("rejects signature-without-timestamp with 400 Missing timestamp header", async () => {
    // Any non-empty signature is fine — verifyWebhookRequest will fail on
    // the missing timestamp long before it tries to validate the HMAC.
    const res = await post({ "x-lovable-signature": "sha256=deadbeef" });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBe("Missing timestamp header");
  });

  it("rejects signature-with-malformed-timestamp with 400 Invalid timestamp", async () => {
    const res = await post({
      "x-lovable-signature": "sha256=deadbeef",
      "x-lovable-timestamp": "not-a-number",
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBe("Invalid timestamp");
  });

  it("rejects bad signature with 401 Invalid signature (fresh timestamp)", async () => {
    // Fresh unix-ms timestamp so we hit signature verification, not skew.
    const ts = Date.now().toString();
    const res = await post({
      "x-lovable-signature": "sha256=deadbeef",
      "x-lovable-timestamp": ts,
    });
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBe("Invalid signature");
  });
});