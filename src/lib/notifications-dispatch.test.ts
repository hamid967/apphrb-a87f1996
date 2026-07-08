import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { toE164, renderTemplate, tryDispatch } from "./notifications-dispatch.server";

describe("toE164", () => {
  it("keeps valid +CC number", () => {
    expect(toE164("+966501234567")).toBe("+966501234567");
  });
  it("converts 00-prefixed to +", () => {
    expect(toE164("00966501234567")).toBe("+966501234567");
  });
  it("prepends default CC for national trunk 0", () => {
    expect(toE164("0501234567")).toBe("+966501234567");
  });
  it("prepends default CC for bare local", () => {
    expect(toE164("501234567")).toBe("+966501234567");
  });
  it("rejects garbage", () => {
    expect(toE164("abc")).toBeNull();
    expect(toE164("")).toBeNull();
    expect(toE164(null)).toBeNull();
  });
});

describe("renderTemplate", () => {
  it("substitutes {{key}} placeholders", () => {
    expect(renderTemplate("مرحباً {{name}}، مبلغ {{amount}} ريال", { name: "أحمد", amount: 500 }))
      .toBe("مرحباً أحمد، مبلغ 500 ريال");
  });
  it("uses variables.body when template has no placeholders", () => {
    expect(renderTemplate("payment_reminder", { body: "دفعة مستحقة" })).toBe("دفعة مستحقة");
  });
  it("leaves unknown keys as empty string", () => {
    expect(renderTemplate("{{x}}-{{y}}", { x: "A" })).toBe("A-");
  });
});

describe("tryDispatch — SMS via Twilio", () => {
  const origFetch = globalThis.fetch;
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env.LOVABLE_API_KEY = "lov_test";
    process.env.TWILIO_API_KEY = "tw_test";
    process.env.TWILIO_FROM_SMS = "+14155551234";
    delete process.env.WHATSAPP_API_KEY;
    delete process.env.WHATSAPP_PHONE_ID;
  });
  afterEach(() => {
    globalThis.fetch = origFetch;
    process.env = { ...origEnv };
  });

  it("posts to Twilio gateway with form-encoded body", async () => {
    const spy = vi.fn(async () => new Response("{}", { status: 201 }));
    globalThis.fetch = spy as never;
    const res = await tryDispatch("sms", "0501234567", "tpl", { body: "مرحبا" });
    expect(res).toEqual({ ok: true });
    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://connector-gateway.lovable.dev/twilio/Messages.json");
    expect(init.method).toBe("POST");
    const h = init.headers as Record<string, string>;
    expect(h["Authorization"]).toBe("Bearer lov_test");
    expect(h["X-Connection-Api-Key"]).toBe("tw_test");
    expect(h["Content-Type"]).toBe("application/x-www-form-urlencoded");
    const body = init.body as URLSearchParams;
    expect(body.get("To")).toBe("+966501234567");
    expect(body.get("From")).toBe("+14155551234");
    expect(body.get("Body")).toBe("مرحبا");
  });

  it("returns error when Twilio responds non-2xx", async () => {
    globalThis.fetch = vi.fn(async () => new Response("bad", { status: 400 })) as never;
    const res = await tryDispatch("sms", "0501234567", "t", { body: "x" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("Twilio SMS 400");
  });

  it("fails fast when TWILIO_API_KEY missing", async () => {
    delete process.env.TWILIO_API_KEY;
    globalThis.fetch = vi.fn() as never;
    const res = await tryDispatch("sms", "0501234567", "t", { body: "x" });
    expect(res).toEqual({ ok: false, error: "Twilio not connected (SMS)" });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("fails fast when TWILIO_FROM_SMS missing", async () => {
    delete process.env.TWILIO_FROM_SMS;
    globalThis.fetch = vi.fn() as never;
    const res = await tryDispatch("sms", "0501234567", "t", { body: "x" });
    expect(res).toEqual({ ok: false, error: "TWILIO_FROM_SMS not configured" });
  });

  it("rejects invalid phone", async () => {
    globalThis.fetch = vi.fn() as never;
    const res = await tryDispatch("sms", "abc", "t", { body: "x" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("Invalid phone");
  });
});

describe("tryDispatch — WhatsApp via Twilio fallback", () => {
  const origFetch = globalThis.fetch;
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env.LOVABLE_API_KEY = "lov_test";
    process.env.TWILIO_API_KEY = "tw_test";
    process.env.WHATSAPP_PROVIDER = "twilio";
    delete process.env.WHATSAPP_API_KEY;
    delete process.env.WHATSAPP_PHONE_ID;
  });
  afterEach(() => {
    globalThis.fetch = origFetch;
    process.env = { ...origEnv };
  });

  it("uses Twilio WhatsApp endpoint with sandbox From by default", async () => {
    const spy = vi.fn(async () => new Response("{}", { status: 201 }));
    globalThis.fetch = spy as never;
    const res = await tryDispatch("whatsapp", "0501234567", "hi", { body: "أهلاً" });
    expect(res).toEqual({ ok: true });
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/twilio/Messages.json");
    const body = init.body as URLSearchParams;
    expect(body.get("To")).toBe("whatsapp:+966501234567");
    expect(body.get("From")).toBe("whatsapp:+14155238886");
    expect(body.get("Body")).toBe("أهلاً");
  });
});