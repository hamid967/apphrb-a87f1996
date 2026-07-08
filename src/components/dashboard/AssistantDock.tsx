import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  Bot,
  Send,
  Loader2,
  ArrowUpRight,
  MessageSquarePlus,
  AlertTriangle,
  RotateCw,
  Square,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { getDashboardMetrics, type DashboardMetrics } from "@/lib/dashboard-metrics.functions";
import { cn } from "@/lib/utils";
import { CopyButton } from "@/components/assistant/CopyButton";

function buildContext(m: DashboardMetrics, isAr: boolean) {
  const p = (n: number) => `${Math.round(n)}%`;
  return isAr
    ? `سياق لوحة التحكم الحالية:
- الإشغال: ${p(m.occupancy_pct)} (${m.units_occupied}/${m.units_total} وحدة)
- التحصيل هذا الشهر: ${p(m.collection_pct)} (إيراد ${Math.round(m.revenue_month)} ريال)
- تذاكر صيانة مفتوحة: ${m.maintenance_open}
- تذاكر دعم مفتوحة: ${m.support_open}
- عقود نشطة: ${m.contracts_active}
- مؤشر صحة المحفظة: ${p(m.ai_score)}

استخدم هذه الأرقام لفهم السياق ولا تكررها في الرد إلا إذا سُئلت.`
    : `Current dashboard context:
- Occupancy: ${p(m.occupancy_pct)} (${m.units_occupied}/${m.units_total} units)
- Collection MTD: ${p(m.collection_pct)} (revenue ${Math.round(m.revenue_month)} SAR)
- Open maintenance: ${m.maintenance_open}
- Open support: ${m.support_open}
- Active contracts: ${m.contracts_active}
- Portfolio health: ${p(m.ai_score)}

Use these figures as context; don't repeat them unless asked.`;
}

function suggestions(m: DashboardMetrics | undefined, isAr: boolean) {
  if (!m) return [];
  const s: string[] = [];
  if (m.occupancy_pct < 80) s.push(isAr ? "كيف أرفع نسبة الإشغال؟" : "How can I raise occupancy?");
  if (m.collection_pct < 90)
    s.push(isAr ? "خطة لتحسين التحصيل هذا الأسبوع" : "Plan to improve collection this week");
  if (m.maintenance_open >= 5)
    s.push(isAr ? "رتّب أولوية تذاكر الصيانة" : "Prioritize maintenance tickets");
  if (s.length === 0) s.push(isAr ? "لخّص أداء المحفظة اليوم" : "Summarize today's performance");
  return s.slice(0, 3);
}

export function AssistantDock({ orgId, isAr }: { orgId?: string; isAr: boolean }) {
  const metricsQ = useQuery({
    queryKey: ["dashboard-metrics", orgId],
    queryFn: () => getDashboardMetrics({ data: { org_id: orgId! } }),
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const contextRef = useRef<string>("");
  useEffect(() => {
    if (metricsQ.data) contextRef.current = buildContext(metricsQ.data, isAr);
  }, [metricsQ.data, isAr]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/assistant/chat",
        fetch: async (input, init) => {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          const headers = new Headers(init?.headers);
          if (token) headers.set("Authorization", `Bearer ${token}`);
          return fetch(input, { ...init, headers });
        },
      }),
    [],
  );

  const { messages, sendMessage, status, setMessages, error, regenerate, stop } = useChat({
    id: `dock-${orgId ?? "none"}`,
    transport,
  });

  const [input, setInput] = useState("");
  const lastSentRef = useRef<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isPending = status === "submitted" || status === "streaming";

  // Track per-request timing so we can show elapsed seconds while pending.
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (isPending && startedAt == null) {
      setStartedAt(Date.now());
      setElapsed(0);
    } else if (!isPending && startedAt != null) {
      setStartedAt(null);
      setElapsed(0);
    }
  }, [isPending, startedAt]);
  useEffect(() => {
    if (startedAt == null) return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 250);
    return () => clearInterval(id);
  }, [startedAt]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  const send = (raw: string) => {
    const t = raw.trim();
    if (!t || isPending) return;
    const isFirst = messages.length === 0;
    const text = isFirst && contextRef.current ? `${contextRef.current}\n\n${t}` : t;
    lastSentRef.current = t;
    setStartedAt(Date.now());
    setElapsed(0);
    void sendMessage({ text });
    setInput("");
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const retry = () => {
    if (isPending) return;
    // Prefer re-sending the exact last user message so a failed request is
    // retried as-is, independent of regenerate()'s behavior.
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const lastUserText = lastUser
      ? (lastUser.parts ?? [])
          .map((p) => (p.type === "text" ? p.text : ""))
          .join("")
          .trim()
      : "";
    const text = lastUserText || lastSentRef.current;
    if (!text) {
      if (messages.some((m) => m.role === "user")) void regenerate();
      return;
    }
    // Drop the failed turn(s) after the last user message, then resend it.
    const idx = messages.map((m) => m.role).lastIndexOf("user");
    if (idx >= 0) setMessages(messages.slice(0, idx));
    void sendMessage({ text });
  };

  const chips = suggestions(metricsQ.data, isAr);

  const renderText = (m: UIMessage) =>
    (m.parts ?? []).map((p, i) => (p.type === "text" ? <span key={i}>{p.text}</span> : null));

  return (
    <div className="flex h-[520px] flex-col rounded-2xl border bg-card/60 shadow-sm backdrop-blur">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-xl bg-primary/10 text-primary">
            <Bot className="size-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold">{isAr ? "مساعد الذكاء" : "AI Assistant"}</h3>
            <p className="text-[11px] text-muted-foreground">
              {metricsQ.data
                ? isAr
                  ? "يعرف سياق لوحتك الحالية"
                  : "Aware of your dashboard context"
                : isAr
                  ? "جاري تحميل السياق…"
                  : "Loading context…"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => setMessages([])}
              aria-label={isAr ? "محادثة جديدة" : "New chat"}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <MessageSquarePlus className="size-4" />
            </button>
          )}
          <Link
            to="/assistant"
            aria-label={isAr ? "فتح المساعد الكامل" : "Open full assistant"}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowUpRight className="size-4" />
          </Link>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Bot className="size-8 text-muted-foreground/60" />
            <p className="max-w-[220px] text-xs text-muted-foreground">
              {isAr
                ? "اسألني عن الإشغال أو التحصيل أو الصيانة بناءً على مؤشرات لوحتك."
                : "Ask me about occupancy, collection or maintenance based on your dashboard."}
            </p>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
            >
              {m.role === "user" ? (
                <div className="max-w-[85%] rounded-2xl rounded-ee-md bg-primary px-3 py-2 text-[13px] text-primary-foreground">
                  {renderText(m)}
                </div>
              ) : (
                <div className="group relative max-w-[90%]">
                  <div className="prose prose-sm dark:prose-invert text-[13px] leading-relaxed [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1">
                    <ReactMarkdown>
                      {(m.parts ?? []).map((p) => (p.type === "text" ? p.text : "")).join("")}
                    </ReactMarkdown>
                  </div>
                  <div className="mt-1">
                    <CopyButton
                      text={(m.parts ?? []).map((p) => (p.type === "text" ? p.text : "")).join("")}
                      label={isAr ? "نسخ" : "Copy"}
                      successMessage={isAr ? "تم نسخ الرد" : "Response copied"}
                    />
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {isPending && messages[messages.length - 1]?.role !== "assistant" && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-start"
            aria-live="polite"
          >
            <div className="w-[90%] max-w-[90%] space-y-2 rounded-2xl rounded-es-md bg-muted/40 p-3">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="size-3 animate-spin" />
                  {status === "submitted"
                    ? isAr
                      ? "يفكّر…"
                      : "Thinking…"
                    : isAr
                      ? "يكتب…"
                      : "Streaming…"}
                </span>
                <span className="tabular-nums">{elapsed}s</span>
              </div>
              <div className="space-y-1.5">
                <div className="h-2.5 w-[85%] animate-pulse rounded bg-muted-foreground/20" />
                <div className="h-2.5 w-[70%] animate-pulse rounded bg-muted-foreground/20" />
                <div className="h-2.5 w-[55%] animate-pulse rounded bg-muted-foreground/20" />
              </div>
            </div>
          </motion.div>
        )}

        {error && !isPending && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-600 dark:text-rose-400"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="font-medium">
                {isAr ? "تعذّر الاتصال بالمساعد" : "Assistant request failed"}
              </div>
              <div className="mt-0.5 truncate text-[11px] opacity-80">
                {error.message || (isAr ? "خطأ غير معروف" : "Unknown error")}
              </div>
            </div>
            <button
              type="button"
              onClick={retry}
              className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-background/40 px-2 py-1 text-[11px] font-medium text-rose-600 transition hover:bg-rose-500/10 dark:text-rose-400"
            >
              <RotateCw className="size-3" />
              {isAr ? "إعادة" : "Retry"}
            </button>
          </motion.div>
        )}
      </div>

      {messages.length === 0 && chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t px-3 py-2">
          {chips.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => send(c)}
              disabled={isPending || !metricsQ.data}
              className="rounded-full border bg-background/60 px-2.5 py-1 text-[11px] text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-center gap-2 border-t p-2"
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={isAr ? "اسأل عن أي مؤشر…" : "Ask about any metric…"}
          disabled={isPending}
          className="flex-1 rounded-xl bg-background/60 px-3 py-2 text-[13px] outline-none ring-1 ring-border focus:ring-primary/40 disabled:opacity-50"
        />
        {isPending ? (
          <button
            type="button"
            onClick={() => stop()}
            aria-label={isAr ? "إيقاف" : "Stop"}
            className="grid size-9 place-items-center rounded-xl bg-rose-500 text-white transition hover:bg-rose-600"
          >
            <Square className="size-3.5 fill-current" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            aria-label={isAr ? "إرسال" : "Send"}
            className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            <Send className="size-4" />
          </button>
        )}
      </form>
    </div>
  );
}
