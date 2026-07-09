import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { buildAssistantTools } from "@/lib/assistant-tools.server";

const SYSTEM =
  "أنت مساعد ذكي داخل نظام Aqari لإدارة العقارات. أجب دائماً بالعربية بأسلوب موجز وواضح. " +
  "استخدم الأدوات لقراءة البيانات الفعلية قبل الإجابة على أي سؤال يتطلب أرقاماً. " +
  "قبل تنفيذ أي إجراء يعدّل البيانات (إنشاء مهمة، تذكير)، اعرض ملخص العملية للمستخدم واستأذنه صراحة في نفس الرسالة، " +
  "ثم نفّذ فقط عندما يوافق. لا تخترع أرقاماً — إذا لم تعثر على البيانات قل ذلك.";

function isNewApiKey(v: string) {
  return v.startsWith("sb_publishable_") || v.startsWith("sb_secret_");
}

function scopedClient(token: string) {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(url, key, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (isNewApiKey(key) && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

export const Route = createFileRoute("/api/assistant/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authHeader = request.headers.get("authorization") ?? "";
          const token = authHeader.replace(/^Bearer\s+/i, "");
          if (!token || token.split(".").length !== 3) {
            return new Response("Unauthorized", { status: 401 });
          }

          const apiKey = process.env.LOVABLE_API_KEY;
          if (!apiKey) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

          const supabase = scopedClient(token);
          const { data: claimsData, error: cErr } = await supabase.auth.getClaims(token);
          if (cErr || !claimsData?.claims?.sub) {
            return new Response("Unauthorized", { status: 401 });
          }
          const userId = claimsData.claims.sub;

          // Resolve org + role. Staff/owner_investor come from organization_members;
          // tenants come from profiles.tenant_id → tenants.org_id.
          let orgId: string | null = null;
          let orgRole = "";
          let tenantId: string | null = null;

          const { data: mem } = await supabase
            .from("organization_members")
            .select("org_id, role")
            .eq("user_id", userId)
            .limit(1)
            .maybeSingle();
          if (mem?.org_id) {
            orgId = mem.org_id as string;
            orgRole = String(mem.role ?? "");
          } else {
            const { data: prof } = await supabase
              .from("profiles")
              .select("tenant_id")
              .eq("id", userId)
              .maybeSingle();
            if (prof?.tenant_id) {
              const { data: t } = await supabase
                .from("tenants")
                .select("id, org_id")
                .eq("id", prof.tenant_id)
                .maybeSingle();
              if (t?.org_id) {
                orgId = t.org_id as string;
                tenantId = t.id as string;
                orgRole = "tenant";
              }
            }
          }
          if (!orgId) return new Response("No organization", { status: 403 });

          // Rate limit: 30 user messages / hour / user (per المواصفة)
          const RATE_LIMIT = 30;
          const windowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString();
          const { data: recentThreads } = await supabase
            .from("assistant_threads")
            .select("id")
            .eq("user_id", userId);
          const threadIds = (recentThreads ?? []).map((t) => t.id);
          if (threadIds.length) {
            const { count } = await supabase
              .from("assistant_messages")
              .select("id", { count: "exact", head: true })
              .eq("role", "user")
              .gte("created_at", windowStart)
              .in("thread_id", threadIds);
            if ((count ?? 0) >= RATE_LIMIT) {
              return new Response(
                JSON.stringify({
                  error: "rate_limited",
                  message: `تم تجاوز الحد المسموح (${RATE_LIMIT} رسالة/ساعة). يرجى المحاولة لاحقاً.`,
                }),
                {
                  status: 429,
                  headers: {
                    "Content-Type": "application/json",
                    "Retry-After": "3600",
                    "X-RateLimit-Limit": String(RATE_LIMIT),
                    "X-RateLimit-Remaining": "0",
                  },
                },
              );
            }
          }

          const body = (await request.json()) as { messages?: UIMessage[]; threadId?: string };
          const messages = body.messages ?? [];
          const threadId = body.threadId;

          // Persist last user message (with a compact text summary of parts).
          const lastUser = [...messages].reverse().find((m) => m.role === "user");
          if (threadId && lastUser) {
            const text = (lastUser.parts ?? [])
              .map((p: any) =>
                p.type === "text"
                  ? p.text
                  : p.type === "file"
                    ? `[ملف: ${p.filename ?? p.mediaType ?? "attachment"}]`
                    : "",
              )
              .join("\n")
              .trim();
            if (text) {
              await supabase.from("assistant_messages").insert({
                thread_id: threadId,
                role: "user",
                content: text,
              });
              const { data: t } = await supabase
                .from("assistant_threads")
                .select("title")
                .eq("id", threadId)
                .maybeSingle();
              if (t && (t.title === "محادثة جديدة" || !t.title)) {
                await supabase
                  .from("assistant_threads")
                  .update({ title: text.slice(0, 60) })
                  .eq("id", threadId);
              }
            }
          }

          await supabase
            .rpc("log_assistant_access", {
              _org: orgId,
              _action: "ASSISTANT_REQUEST",
              _diff: { thread_id: threadId ?? null, role: orgRole } as any,
            })
            .then(
              () => null,
              () => null,
            );

          const gateway = createLovableAiGatewayProvider(apiKey);
          const tools = buildAssistantTools({ supabase, orgId, orgRole, userId, tenantId });
          const roleHint =
            orgRole === "tenant"
              ? " المستخدم مستأجر في البوابة — استخدم أدوات my_rent_status و create_maintenance_ticket فقط. لا تصل إلى بيانات المؤسسة."
              : "";

          // Accumulate assistant text as chunks arrive so we can persist even
          // if the client disconnects mid-stream or the model errors out.
          let accumulated = "";
          let persisted = false;
          const persist = async (reason: "finish" | "error" | "abort") => {
            if (persisted || !threadId) return;
            const text = accumulated.trim();
            if (!text) return;
            persisted = true;
            try {
              await supabase.from("assistant_messages").insert({
                thread_id: threadId,
                role: "assistant",
                content: text,
              });
              await supabase
                .from("assistant_threads")
                .update({ updated_at: new Date().toISOString() })
                .eq("id", threadId);
              if (reason !== "finish") {
                await supabase
                  .rpc("log_assistant_access", {
                    _org: orgId,
                    _action:
                      reason === "abort" ? "ASSISTANT_STREAM_ABORTED" : "ASSISTANT_STREAM_ERROR",
                    _diff: { thread_id: threadId, chars: text.length } as any,
                  })
                  .then(
                    () => null,
                    () => null,
                  );
              }
            } catch (e) {
              console.error("[assistant.chat] persist failed:", e);
            }
          };

          const result = streamText({
            model: gateway("google/gemini-2.5-flash"),
            system: SYSTEM + roleHint,
            messages: await convertToModelMessages(messages),
            tools,
            stopWhen: stepCountIs(50),
            abortSignal: request.signal,
            onChunk: ({ chunk }) => {
              if ((chunk as any).type === "text-delta") {
                accumulated += (chunk as any).text ?? (chunk as any).delta ?? "";
              }
            },
            onError: (e) => {
              console.error("[assistant.chat] streamText error:", e);
              void persist("error");
            },
            onAbort: () => {
              void persist("abort");
            },
          });

          // Keep consuming server-side even if the HTTP client disconnects, so
          // the model completes and onFinish/onAbort fires.
          void result.consumeStream({
            onError: (e) => console.error("[assistant.chat] consumeStream error:", e),
          });

          return result.toUIMessageStreamResponse({
            originalMessages: messages,
            onFinish: async ({ messages: finalMessages }) => {
              if (!threadId) return;
              // Prefer the fully-assembled final assistant message if available,
              // otherwise fall back to our streamed accumulator.
              const assistant = [...finalMessages].reverse().find((m) => m.role === "assistant");
              const finalText = assistant
                ? (assistant.parts ?? [])
                    .map((p: any) => (p.type === "text" ? p.text : ""))
                    .join("")
                    .trim()
                : "";
              if (finalText) accumulated = finalText;
              await persist("finish");
            },
          });
        } catch (e: any) {
          console.error("[assistant.chat] fatal:", e);
          return new Response("Internal server error", { status: 500 });
        }
      },
    },
  },
});
