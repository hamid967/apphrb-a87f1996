import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import {
  getAssistantThread,
  createAssistantThread,
  renameAssistantThread,
  deleteAssistantThread,
  setAssistantMessageFeedback,
} from "@/lib/assistant-threads.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Bot,
  Loader2,
  Send,
  User,
  FileDown,
  FileText,
  Paperclip,
  Wrench,
  X,
  MoreHorizontal,
  Pencil,
  Trash2,
  Plus,
  Type,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  exportAssistantAsPdf,
  exportAssistantAsCsv,
  type AssistantMsg,
} from "@/lib/assistant-export";
import { motion, AnimatePresence } from "motion/react";
import { CopyButton } from "@/components/assistant/CopyButton";

import { detailHead } from "@/lib/detail-og-head";
export const Route = createFileRoute("/_authenticated/assistant/$threadId")({
  head: ({ params }) => detailHead({ entityAr: "محادثة", entityEn: "Conversation", id: String(params.threadId), path: `/assistant/${params.threadId}`, kind: "article", section: "assistant" }),
  component: ThreadView,
});

const SUGGESTION_KEYS = ["s1", "s2", "s3", "s4", "s5", "s6"] as const;

// Strip emojis / pictographs / decorative markdown symbols from assistant text.
// Keeps Arabic, Latin, digits, punctuation, and whitespace.
function stripSymbols(text: string): string {
  if (!text) return text;
  return (
    text
      // remove emoji + pictographs + dingbats + misc symbols
      .replace(/\p{Extended_Pictographic}/gu, "")
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu, "")
      // decorative markdown headers/bullets/quotes at line starts
      .replace(/^[ \t]*[#>\-*•●◦▪●■□◆★☆✓✔✖✗→←↑↓»«]+[ \t]*/gmu, "")
      // bold/italic markers **text** *text* __text__ `text`
      .replace(/(\*\*|__)(.*?)\1/g, "$2")
      .replace(/(\*|_)(.*?)\1/g, "$2")
      .replace(/`([^`]+)`/g, "$1")
      // collapse extra blank lines
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

const FONT_FAMILIES = {
  naskh: { label: "نسخ", css: "'Noto Naskh Arabic','Amiri',serif" },
  sans: { label: "Sans", css: "'Inter',system-ui,sans-serif" },
  serif: { label: "Serif", css: "Georgia,'Times New Roman',serif" },
  mono: { label: "Mono", css: "ui-monospace,SFMono-Regular,Menlo,monospace" },
} as const;
type FontKey = keyof typeof FONT_FAMILIES;
const FONT_SIZES = { sm: 13, md: 15, lg: 18 } as const;
type SizeKey = keyof typeof FONT_SIZES;

function ThreadView() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language?.startsWith("ar") ?? true;
  const { threadId } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const getFn = useServerFn(getAssistantThread);
  const createFn = useServerFn(createAssistantThread);
  const renameFn = useServerFn(renameAssistantThread);
  const deleteFn = useServerFn(deleteAssistantThread);
  const feedbackFn = useServerFn(setAssistantMessageFeedback);

  const threadQ = useQuery({
    queryKey: ["assistant-thread", threadId],
    queryFn: () => getFn({ data: { threadId } }),
  });

  // Local feedback map keyed by DB message uuid. Seeded from thread load,
  // updated optimistically on click.
  const [feedbackMap, setFeedbackMap] = useState<Record<string, "up" | "down" | null>>({});
  useEffect(() => {
    const src = threadQ.data?.messages ?? [];
    if (!src.length) return;
    setFeedbackMap((prev) => {
      const next = { ...prev };
      for (const m of src as any[]) if (m.id) next[m.id] = (m.feedback ?? null) as any;
      return next;
    });
  }, [threadQ.data]);

  const isUuid = (s: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

  const rateMessage = async (messageId: string, next: "up" | "down") => {
    if (!isUuid(messageId)) {
      toast.error(t("assistant.thread.feedbackNeedsUpdate"));
      return;
    }
    const current = feedbackMap[messageId] ?? null;
    const value: "up" | "down" | null = current === next ? null : next;
    setFeedbackMap((prev) => ({ ...prev, [messageId]: value }));
    try {
      await feedbackFn({ data: { messageId, feedback: value } });
      toast.success(
        value === null
          ? t("assistant.thread.feedbackCleared")
          : value === "up"
            ? t("assistant.thread.thanksUp")
            : t("assistant.thread.thanksDown"),
      );
    } catch (e: any) {
      setFeedbackMap((prev) => ({ ...prev, [messageId]: current }));
      toast.error(e?.message ?? t("assistant.thread.feedbackFailed"));
    }
  };

  const initialMessages: UIMessage[] = useMemo(
    () =>
      (threadQ.data?.messages ?? [])
        .filter((m: any) => m.role === "user" || m.role === "assistant")
        .map((m: any, i: number) => ({
          id: m.id ?? `p-${i}`,
          role: m.role,
          parts: [{ type: "text", text: m.content ?? "" }],
        })) as UIMessage[],
    [threadQ.data],
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/assistant/chat",
        body: { threadId },
        fetch: async (input, init) => {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          const headers = new Headers(init?.headers);
          if (token) headers.set("Authorization", `Bearer ${token}`);
          return fetch(input, { ...init, headers });
        },
      }),
    [threadId],
  );

  const { messages, sendMessage, status, error, setMessages } = useChat({
    id: threadId,
    transport,
    onFinish: () => {
      qc.invalidateQueries({ queryKey: ["assistant-thread", threadId] });
      qc.invalidateQueries({ queryKey: ["assistant-threads"] });
    },
    onError: (e) => toast.error(e.message ?? t("assistant.thread.connectFailed")),
  });

  // Load persisted history when the thread loads/changes.
  useEffect(() => {
    if (initialMessages.length && messages.length === 0) setMessages(initialMessages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessages.length, threadId]);

  const isPending = status === "submitted" || status === "streaming";
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const submit = useCallback(async () => {
    const text = input.trim();
    if ((!text && files.length === 0) || isPending) return;
    const fileParts = await Promise.all(
      files.map(async (f) => {
        const url = await new Promise<string>((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result as string);
          r.onerror = rej;
          r.readAsDataURL(f);
        });
        return {
          type: "file" as const,
          mediaType: f.type || "application/octet-stream",
          filename: f.name,
          url,
        };
      }),
    );
    sendMessage({ text: text || `(${t("assistant.thread.attachment")})`, files: fileParts.length ? (fileParts as any) : undefined });
    setInput("");
    setFiles([]);
  }, [input, files, isPending, sendMessage, t]);

  const flatMessages: AssistantMsg[] = useMemo(
    () =>
      messages
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: (m.parts ?? [])
            .filter((p: any) => p.type === "text")
            .map((p: any) => p.text)
            .join("\n"),
        }))
        .filter((m) => m.content),
    [messages],
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isPending]);

  const hasReply = messages.some((m) => m.role === "assistant");

  // ── Thread management (create / rename / delete) ─────────────────────────
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const createM = useMutation({
    mutationFn: () => createFn({ data: {} }),
    onSuccess: (row: any) => {
      qc.invalidateQueries({ queryKey: ["assistant-threads"] });
      navigate({ to: "/assistant/$threadId", params: { threadId: row.id } });
    },
    onError: (e: any) => toast.error(e?.message ?? t("assistant.createFailed")),
  });

  const renameM = useMutation({
    mutationFn: (title: string) => renameFn({ data: { threadId, title } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assistant-thread", threadId] });
      qc.invalidateQueries({ queryKey: ["assistant-threads"] });
      setRenameOpen(false);
      toast.success(t("assistant.thread.titleUpdated"));
    },
    onError: (e: any) => toast.error(e?.message ?? t("assistant.thread.renameFailed")),
  });

  const deleteM = useMutation({
    mutationFn: () => deleteFn({ data: { threadId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assistant-threads"] });
      qc.removeQueries({ queryKey: ["assistant-thread", threadId] });
      toast.success(t("assistant.thread.threadDeleted"));
      navigate({ to: "/assistant" });
    },
    onError: (e: any) => toast.error(e?.message ?? t("assistant.thread.deleteFailed")),
  });

  const openRename = () => {
    setRenameValue(threadQ.data?.thread?.title ?? "");
    setRenameOpen(true);
  };

  // Font / formatting preferences (persisted per user in localStorage).
  const [fontKey, setFontKey] = useState<FontKey>(
    () =>
      (typeof window !== "undefined" && (localStorage.getItem("assistant.font") as FontKey)) ||
      "naskh",
  );
  const [sizeKey, setSizeKey] = useState<SizeKey>(
    () =>
      (typeof window !== "undefined" && (localStorage.getItem("assistant.size") as SizeKey)) ||
      "md",
  );
  const [cleanSymbols, setCleanSymbols] = useState<boolean>(() =>
    typeof window === "undefined" ? true : localStorage.getItem("assistant.clean") !== "0",
  );
  useEffect(() => {
    localStorage.setItem("assistant.font", fontKey);
  }, [fontKey]);
  useEffect(() => {
    localStorage.setItem("assistant.size", sizeKey);
  }, [sizeKey]);
  useEffect(() => {
    localStorage.setItem("assistant.clean", cleanSymbols ? "1" : "0");
  }, [cleanSymbols]);
  const assistantTextStyle = {
    fontFamily: FONT_FAMILIES[fontKey].css,
    fontSize: `${FONT_SIZES[sizeKey]}px`,
  } as const;

  return (
    <div className="h-full flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold truncate">{threadQ.data?.thread?.title ?? t("assistant.thread.title")}</h2>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => createM.mutate()}
          disabled={createM.isPending}
        >
          <Plus className="size-4 ml-1" /> {t("assistant.thread.newBtn")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportAssistantAsPdf(flatMessages)}
          disabled={!hasReply}
        >
          <FileText className="size-4 ml-1" /> PDF
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportAssistantAsCsv(flatMessages)}
          disabled={!hasReply}
        >
          <FileDown className="size-4 ml-1" /> CSV
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={openRename}>
              <Pencil className="size-4 ml-2" /> {t("assistant.thread.renameBtn")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="size-4 ml-2" /> {t("assistant.thread.deleteBtn")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" title={t("assistant.thread.fontMenuTitle")}>
              <Type className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 p-2 space-y-2">
            <div className="text-[11px] font-medium text-muted-foreground px-1">{t("assistant.thread.fontFamily")}</div>
            <div className="grid grid-cols-2 gap-1">
              {(Object.keys(FONT_FAMILIES) as FontKey[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setFontKey(k)}
                  style={{ fontFamily: FONT_FAMILIES[k].css }}
                  className={`text-xs px-2 py-1.5 rounded border transition ${fontKey === k ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}
                >
                  {FONT_FAMILIES[k].label}
                </button>
              ))}
            </div>
            <div className="text-[11px] font-medium text-muted-foreground px-1 pt-1">{t("assistant.thread.fontSize")}</div>
            <div className="grid grid-cols-3 gap-1">
              {(Object.keys(FONT_SIZES) as SizeKey[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setSizeKey(k)}
                  className={`text-xs px-2 py-1.5 rounded border transition ${sizeKey === k ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}
                >
                  {k === "sm" ? t("assistant.thread.sizeSmall") : k === "md" ? t("assistant.thread.sizeMedium") : t("assistant.thread.sizeLarge")}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs px-1 pt-2 cursor-pointer">
              <input
                type="checkbox"
                checked={cleanSymbols}
                onChange={(e) => setCleanSymbols(e.target.checked)}
              />
              {t("assistant.thread.hideSymbols")}
            </label>
            <div className="pt-2">
              <div className="text-[11px] font-medium text-muted-foreground px-1 mb-1">
                {t("assistant.thread.livePreview")}
              </div>
              <div
                dir={isRtl ? "rtl" : "ltr"}
                className="rounded-md border bg-muted/40 p-2 leading-relaxed whitespace-pre-wrap max-h-28 overflow-auto"
                style={assistantTextStyle}
              >
                {cleanSymbols
                  ? stripSymbols("## ملخص ✨\n- **الإيرادات** ارتفعت 12٪ ✅\n- التحصيل 96٪ → ممتاز")
                  : "## ملخص ✨\n- **الإيرادات** ارتفعت 12٪ ✅\n- التحصيل 96٪ → ممتاز"}
              </div>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardContent ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {threadQ.isLoading && (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" /> {t("assistant.thread.loadingThread")}
            </div>
          )}

          {!threadQ.isLoading && messages.length === 0 && (
            <motion.div
              className="space-y-4"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <p className="text-muted-foreground text-sm">{t("assistant.thread.trySuggestion")}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {SUGGESTION_KEYS.map((key, i) => {
                  const label = t(`assistant.thread.suggestions.${key}` as const);
                  return (
                    <motion.button
                      key={key}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.04 * i, duration: 0.22 }}
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => sendMessage({ text: label })}
                      disabled={isPending}
                      className={`${isRtl ? "text-right" : "text-left"} text-sm p-3 rounded-lg border hover:bg-accent hover:border-primary/40 transition disabled:opacity-50`}
                    >
                      {label}
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          )}

          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <motion.div
                key={m.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className={`group flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}
              >
                <div
                  className={`size-8 rounded-full grid place-items-center shrink-0 ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                >
                  {m.role === "user" ? <User className="size-4" /> : <Bot className="size-4" />}
                </div>
                <div className="max-w-[80%] space-y-2">
                  {(m.parts ?? []).map((part: any, idx: number) => {
                    if (part.type === "text") {
                      const shown =
                        cleanSymbols && m.role === "assistant"
                          ? stripSymbols(part.text)
                          : part.text;
                      return (
                        <div
                          key={idx}
                          className="whitespace-pre-wrap leading-relaxed"
                          style={m.role === "assistant" ? assistantTextStyle : undefined}
                        >
                          {shown}
                        </div>
                      );
                    }
                    if (part.type === "file") {
                      const isImg = String(part.mediaType ?? "").startsWith("image/");
                      return isImg ? (
                        <img
                          key={idx}
                          src={part.url}
                          alt={part.filename ?? "attachment"}
                          className="max-h-48 rounded-md border"
                        />
                      ) : (
                        <a
                          key={idx}
                          href={part.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 text-xs px-2 py-1 rounded border"
                        >
                          <Paperclip className="size-3" /> {part.filename ?? "ملف"}
                        </a>
                      );
                    }
                    if (typeof part.type === "string" && part.type.startsWith("tool-")) {
                      const name = part.type.replace(/^tool-/, "");
                      const state = part.state as string | undefined;
                      const out: any = part.output;
                      const denialCodes = [
                        "forbidden_role",
                        "field_not_allowed",
                        "value_out_of_range",
                      ];
                      const isDenial =
                        out &&
                        typeof out === "object" &&
                        typeof out.code === "string" &&
                        denialCodes.includes(out.code);
                      if (isDenial) {
                        const codeLabel: Record<string, string> = {
                          forbidden_role: t("assistant.thread.denials.forbidden_role"),
                          field_not_allowed: t("assistant.thread.denials.field_not_allowed"),
                          value_out_of_range: t("assistant.thread.denials.value_out_of_range"),
                        };
                        return (
                          <div
                            key={idx}
                            className="text-xs rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-2"
                          >
                            <div className="flex items-center gap-2 font-medium text-destructive">
                              <Wrench className="size-3" />
                              <span>{t("assistant.thread.toolRejected", { name })}</span>
                            </div>
                            <div className="text-[11px] font-medium">
                              {codeLabel[out.code] ?? out.code}
                            </div>
                            {out.reason && (
                              <div className="text-muted-foreground">{out.reason}</div>
                            )}
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {out.role && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-[10px]">
                                  {t("assistant.thread.role")} <b>{out.role}</b>
                                </span>
                              )}
                              {Array.isArray(out.allowed_roles) && out.allowed_roles.length > 0 && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[10px]">
                                  {t("assistant.thread.allowedRoles")} {out.allowed_roles.join(isRtl ? "، " : ", ")}
                                </span>
                              )}
                            </div>
                            {Array.isArray(out.allowed_fields) && out.allowed_fields.length > 0 && (
                              <div>
                                <div className="text-[10px] text-muted-foreground mb-1">
                                  {t("assistant.thread.allowedFields")}
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {out.allowed_fields.map((f: string) => (
                                    <span
                                      key={f}
                                      className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[10px] font-mono"
                                    >
                                      {f}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {Array.isArray(out.restricted_fields) &&
                              out.restricted_fields.length > 0 && (
                                <div>
                                  <div className="text-[10px] text-muted-foreground mb-1">
                                    {t("assistant.thread.restrictedFields")}
                                  </div>
                                  <div className="flex flex-wrap gap-1">
                                    {out.restricted_fields.map((f: string) => (
                                      <span
                                        key={f}
                                        className="px-1.5 py-0.5 rounded bg-destructive/10 text-destructive text-[10px] font-mono"
                                      >
                                        {f}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                          </div>
                        );
                      }
                      return (
                        <div key={idx} className="text-xs rounded-md border bg-muted/40 p-2">
                          <div className="flex items-center gap-2 font-medium">
                            <Wrench className="size-3" />
                            <span>{name}</span>
                            <span className="text-muted-foreground">
                              {state === "output-available"
                                ? t("assistant.thread.toolDone")
                                : state === "input-available"
                                  ? t("assistant.thread.toolRunning")
                                  : (state ?? "")}
                            </span>
                          </div>
                          {part.output != null && (
                            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-[10px] text-muted-foreground">
                              {typeof part.output === "string"
                                ? part.output
                                : JSON.stringify(part.output, null, 2)}
                            </pre>
                          )}
                        </div>
                      );
                    }
                    return null;
                  })}
                  {m.role === "assistant" &&
                    (() => {
                      const raw = (m.parts ?? [])
                        .filter((p: any) => p.type === "text")
                        .map((p: any) => p.text)
                        .join("\n");
                      const text = cleanSymbols ? stripSymbols(raw) : raw;
                      if (!text.trim()) return null;
                      const fb = feedbackMap[m.id] ?? null;
                      return (
                        <div className="flex items-center gap-1.5 pt-1">
                          <CopyButton text={text} />
                          <button
                            type="button"
                            onClick={() => rateMessage(m.id, "up")}
                            aria-label={t("assistant.thread.helpful")}
                            title={t("assistant.thread.helpful")}
                            className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] transition hover:bg-muted ${
                              fb === "up"
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/40"
                                : "text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100"
                            }`}
                          >
                            <ThumbsUp className="size-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => rateMessage(m.id, "down")}
                            aria-label={t("assistant.thread.notHelpful")}
                            title={t("assistant.thread.notHelpful")}
                            className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] transition hover:bg-muted ${
                              fb === "down"
                                ? "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/40"
                                : "text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100"
                            }`}
                          >
                            <ThumbsDown className="size-3" />
                          </button>
                        </div>
                      );
                    })()}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {isPending && messages[messages.length - 1]?.role === "user" && (
            <motion.div
              className="flex gap-3"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              aria-live="polite"
            >
              <div className="size-8 rounded-full grid place-items-center bg-muted">
                <Bot className="size-4" />
              </div>
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="size-4 animate-spin" />
                <span>{t("assistant.thread.thinking")}</span>
                <motion.span
                  animate={{ opacity: [0.2, 1, 0.2] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                >
                  …
                </motion.span>
              </div>
            </motion.div>
          )}

          {error && <div className="text-xs text-destructive">{t("assistant.thread.errorPrefix")} {error.message}</div>}
        </CardContent>

        <div className="border-t p-3 space-y-2">
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {files.map((f, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-muted"
                >
                  <Paperclip className="size-3" />
                  <span className="max-w-[140px] truncate">{f.name}</span>
                  <button
                    type="button"
                    onClick={() => setFiles((xs) => xs.filter((_, j) => j !== i))}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              accept="image/*,application/pdf,text/csv,text/plain"
              onChange={(e) => {
                const list = Array.from(e.target.files ?? []).filter(
                  (f) => f.size <= 8 * 1024 * 1024,
                );
                if (list.length !== (e.target.files?.length ?? 0))
                  toast.error("الحد الأقصى للملف 8MB");
                setFiles((prev) => [...prev, ...list]);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            />
            <Button
              variant="outline"
              size="icon"
              className="h-auto"
              onClick={() => fileInputRef.current?.click()}
              disabled={isPending}
            >
              <Paperclip className="size-4" />
            </Button>
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="اكتب سؤالك… (Shift+Enter لسطر جديد)"
              rows={2}
              disabled={isPending}
            />
            <Button
              onClick={submit}
              disabled={(!input.trim() && files.length === 0) || isPending}
              size="icon"
              className="h-auto"
            >
              {isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
            </Button>
          </div>
        </div>
      </Card>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إعادة تسمية المحادثة</DialogTitle>
            <DialogDescription>اختر عنواناً وصفياً للمحادثة.</DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="عنوان المحادثة"
            maxLength={120}
            onKeyDown={(e) => {
              if (e.key === "Enter" && renameValue.trim()) renameM.mutate(renameValue.trim());
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              إلغاء
            </Button>
            <Button
              onClick={() => renameM.mutate(renameValue.trim())}
              disabled={!renameValue.trim() || renameM.isPending}
            >
              {renameM.isPending ? <Loader2 className="size-4 animate-spin" /> : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>حذف المحادثة</DialogTitle>
            <DialogDescription>
              سيتم حذف هذه المحادثة وجميع رسائلها نهائياً. لا يمكن التراجع.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              إلغاء
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteM.mutate()}
              disabled={deleteM.isPending}
            >
              {deleteM.isPending ? <Loader2 className="size-4 animate-spin" /> : "حذف"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
