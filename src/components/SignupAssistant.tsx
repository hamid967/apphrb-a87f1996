import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  Bot,
  Send,
  Loader2,
  X,
  Sparkles,
  UserPlus,
  ChevronDown,
  ChevronUp,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { HBS } from "@/components/hbspro/tokens";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";

type Lang = "auto" | "ar" | "en";

const WELCOME_TEXT: Record<Lang, string> = {
  auto: "أهلاً، أنا حامد 👋 مساعد عقاري Aqari. اسألني بالعربية أو الإنجليزية. / Hi, I'm Hamid — ask me anything about the platform or how to sign up.",
  ar: "أهلاً، أنا حامد 👋 مساعد منصة عقاري Aqari. كيف أقدر أساعدك؟ (نبذة عن النظام، إنشاء حساب، أو تسجيل الدخول)",
  en: "Hi, I'm Hamid 👋 — assistant for Aqari by HRHBS. How can I help? (platform overview, new account, or sign-in)",
};

const QUICK: Record<Lang, string[]> = {
  auto: [
    "ابدأ الخطوة 1: إنشاء الحساب",
    "Step 2: Verify my email",
    "الخطوة 3: صفحة الترحيب",
    "Step 4: Profile setup",
    "الخطوة 5: الشركة ومساحة العمل",
  ],
  ar: [
    "الخطوة 1: إنشاء الحساب",
    "الخطوة 2: تأكيد البريد",
    "الخطوة 3: صفحة الترحيب",
    "الخطوة 4: إعداد الملف الشخصي",
    "الخطوة 5: الشركة ومساحة العمل",
  ],
  en: [
    "Step 1: Create account",
    "Step 2: Verify email",
    "Step 3: Welcome page",
    "Step 4: Profile setup",
    "Step 5: Company & workspace",
  ],
};

const LABELS: Record<
  Lang,
  {
    title: string;
    subtitle: string;
    placeholder: string;
    typing: string;
    error: string;
    close: string;
    open: string;
    langLabel: string;
  }
> = {
  auto: {
    title: "حامد · Hamid",
    subtitle: "مساعد Aqari — AR + EN",
    placeholder: "اسأل بأي لغة… / Ask in any language…",
    typing: "يكتب… / typing…",
    error: "حدث خطأ. / Something went wrong.",
    close: "إغلاق / Close",
    open: "تحدث مع حامد / Chat with Hamid",
    langLabel: "اللغة / Language",
  },
  ar: {
    title: "حامد — مساعد Aqari",
    subtitle: "بالعربية",
    placeholder: "اسأل حامد…",
    typing: "حامد يكتب…",
    error: "حدث خطأ. حاول مرة أخرى.",
    close: "إغلاق",
    open: "تحدث مع حامد",
    langLabel: "اللغة",
  },
  en: {
    title: "Hamid — Aqari Assistant",
    subtitle: "English",
    placeholder: "Ask Hamid…",
    typing: "Hamid is typing…",
    error: "Something went wrong. Please try again.",
    close: "Close",
    open: "Chat with Hamid",
    langLabel: "Language",
  },
};

const FORM_LABELS: Record<
  Lang,
  {
    toggleOpen: string;
    toggleClose: string;
    fullName: string;
    email: string;
    password: string;
    submit: string;
    submitting: string;
    success: string;
    needFields: string;
    weakPassword: string;
  }
> = {
  auto: {
    toggleOpen: "إنشاء حساب الآن / Create account",
    toggleClose: "إخفاء النموذج / Hide form",
    fullName: "الاسم الكامل / Full name",
    email: "البريد / Email",
    password: "كلمة المرور / Password (8+)",
    submit: "إنشاء الحساب / Sign up",
    submitting: "جارٍ الإنشاء… / Creating…",
    success: "تم إنشاء الحساب — تحقق من بريدك للتأكيد. / Account created — check your email.",
    needFields: "الرجاء تعبئة كل الحقول. / Please fill all fields.",
    weakPassword: "كلمة المرور 8 أحرف على الأقل. / Password must be 8+ chars.",
  },
  ar: {
    toggleOpen: "إنشاء حساب الآن",
    toggleClose: "إخفاء النموذج",
    fullName: "الاسم الكامل",
    email: "البريد الإلكتروني",
    password: "كلمة المرور (8 أحرف على الأقل)",
    submit: "إنشاء الحساب",
    submitting: "جارٍ الإنشاء…",
    success: "تم إنشاء الحساب بنجاح — تحقق من بريدك لتأكيد الحساب.",
    needFields: "الرجاء تعبئة كل الحقول.",
    weakPassword: "كلمة المرور يجب أن تكون 8 أحرف على الأقل.",
  },
  en: {
    toggleOpen: "Create account",
    toggleClose: "Hide form",
    fullName: "Full name",
    email: "Email",
    password: "Password (8+ chars)",
    submit: "Sign up",
    submitting: "Creating…",
    success: "Account created — check your email to confirm.",
    needFields: "Please fill all fields.",
    weakPassword: "Password must be at least 8 characters.",
  },
};

export function SignupAssistant() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [lang, setLang] = useState<Lang>("auto");
  const t = LABELS[lang];
  const f = FORM_LABELS[lang];
  const nav = useNavigate();
  const [formOpen, setFormOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signingUp, setSigningUp] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const welcome: UIMessage[] = useMemo(
    () => [
      {
        id: `welcome-${lang}`,
        role: "assistant",
        parts: [{ type: "text", text: WELCOME_TEXT[lang] }],
      },
    ],
    [lang],
  );
  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/public/signup-assistant", body: { lang } }),
    [lang],
  );
  const { messages, sendMessage, status, error } = useChat({
    id: `signup-assistant-${lang}`,
    messages: welcome,
    transport,
  });
  const busy = status === "submitted" || status === "streaming";

  // Auto-fill signup fields from chat answers (user-touched fields are never overwritten).
  const touched = useRef({ name: false, email: false });
  useEffect(() => {
    const userText = messages
      .filter((m) => m.role === "user")
      .map((m) => m.parts.map((p) => (p.type === "text" ? p.text : "")).join(" "))
      .join("\n");
    if (!userText) return;

    // Email
    const emailMatch = userText.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    if (emailMatch && !touched.current.email && !email) {
      setEmail(emailMatch[0]);
      setFormOpen(true);
    }

    // Name: "اسمي X" / "أنا X" / "my name is X" / "I am X" / "I'm X"
    const nameMatch =
      userText.match(/(?:اسمي|أنا|انا)\s+([\p{L}][\p{L}\s'’-]{1,60})/u) ||
      userText.match(/(?:my name is|i am|i'm)\s+([\p{L}][\p{L}\s'’-]{1,60})/iu);
    if (nameMatch && !touched.current.name && !fullName) {
      const cleaned = nameMatch[1]
        .trim()
        .replace(/[.,!?].*$/, "")
        .trim();
      if (cleaned.length >= 2 && cleaned.length <= 60) {
        setFullName(cleaned);
        setFormOpen(true);
      }
    }
  }, [messages, email, fullName]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    const name = fullName.trim();
    const mail = email.trim();
    if (!name || !mail || !password) {
      setFormError(f.needFields);
      return;
    }
    if (password.length < 8) {
      setFormError(f.weakPassword);
      return;
    }
    setSigningUp(true);
    try {
      const { error: signUpErr } = await supabase.auth.signUp({
        email: mail,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/onboarding/welcome`,
          data: { full_name: name },
        },
      });
      if (signUpErr) throw signUpErr;
      setFormSuccess(f.success);
      toast.success(f.success);
      setPassword("");
      const { data: sess } = await supabase.auth.getSession();
      if (sess.session) {
        nav({ to: "/onboarding/welcome", replace: true });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Signup failed";
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSigningUp(false);
    }
  };

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setInput("");
    await sendMessage({ text: t });
  };

  const INTERNAL = /^\/(auth|onboarding)(\/|$)/;
  const mdComponents = {
    a: ({
      href,
      children,
      ...rest
    }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href?: string }) => {
      const isInternal = href && INTERNAL.test(href);
      if (isInternal) {
        return (
          <a
            href={href}
            onClick={(e) => {
              e.preventDefault();
              setOpen(false);
              nav({ to: href as string });
            }}
            className="underline decoration-dotted underline-offset-2"
            style={{ color: HBS.goldSoft }}
          >
            {children}
          </a>
        );
      }
      return (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="underline"
          style={{ color: HBS.goldSoft }}
          {...rest}
        >
          {children}
        </a>
      );
    },
    p: ({ children }: { children?: React.ReactNode }) => (
      <p className="mb-1 last:mb-0">{children}</p>
    ),
    ul: ({ children }: { children?: React.ReactNode }) => (
      <ul className="my-1 list-disc space-y-0.5 ps-4">{children}</ul>
    ),
    ol: ({ children }: { children?: React.ReactNode }) => (
      <ol className="my-1 list-decimal space-y-0.5 ps-4">{children}</ol>
    ),
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 end-5 z-40 flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold text-white shadow-2xl backdrop-blur transition hover:-translate-y-0.5"
        style={{
          background: `linear-gradient(120deg, ${HBS.blue}, ${HBS.gold})`,
          border: `1px solid ${HBS.border}`,
          boxShadow: `0 20px 50px -15px ${HBS.gold}`,
        }}
        aria-label={t.open}
      >
        <Sparkles className="size-4" style={{ color: HBS.goldSoft }} />
        {t.open}
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-5 end-5 z-40 flex h-[520px] w-[360px] max-w-[92vw] flex-col overflow-hidden rounded-2xl backdrop-blur-2xl"
      style={{
        background: `linear-gradient(160deg, rgba(11,27,44,0.92), rgba(7,19,32,0.96))`,
        border: `1px solid ${HBS.border}`,
        boxShadow: `0 40px 120px -30px ${HBS.blue}, 0 0 0 1px rgba(212,175,55,0.08) inset`,
        color: HBS.white,
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: `1px solid ${HBS.border}` }}
      >
        <div className="flex items-center gap-2">
          <div
            className="grid size-8 place-items-center rounded-lg text-white"
            style={{ background: `linear-gradient(140deg, ${HBS.gold}, ${HBS.blue})` }}
          >
            <Bot className="size-4" />
          </div>
          <div>
            <div className="text-sm font-semibold" style={{ color: HBS.white }}>
              {t.title}
            </div>
            <div className="text-[10px]" style={{ color: HBS.gray }}>
              {t.subtitle}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <div
            role="group"
            aria-label={t.langLabel}
            className="flex overflow-hidden rounded-md text-[10px]"
            style={{ border: `1px solid ${HBS.border}` }}
          >
            {(["auto", "ar", "en"] as Lang[]).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                className="px-2 py-1 transition"
                style={
                  lang === l
                    ? {
                        background: `linear-gradient(140deg, ${HBS.gold}33, ${HBS.blue}33)`,
                        color: HBS.white,
                      }
                    : { background: "transparent", color: HBS.gray }
                }
                aria-pressed={lang === l}
              >
                {l === "auto" ? "Auto" : l.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            onClick={() => setOpen(false)}
            className="rounded-md p-1 transition hover:bg-white/10"
            style={{ color: HBS.gray }}
            aria-label={t.close}
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {messages.map((m) => {
          const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
          if (!text) return null;
          const isAssistant = m.role === "assistant";
          const showSignupCta =
            isAssistant &&
            /(sign\s?up|register|create\s+(an?\s+)?account|\/auth|إنشاء\s+حساب|تسجيل|سجّل|سجل)/i.test(
              text,
            );
          return (
            <div
              key={m.id}
              className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
            >
              <div className="flex max-w-[85%] flex-col gap-1.5">
                <div
                  className="max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed"
                  style={
                    m.role === "user"
                      ? {
                          background: `linear-gradient(120deg, ${HBS.blue}, ${HBS.gold})`,
                          color: HBS.white,
                          boxShadow: `0 10px 30px -12px ${HBS.blue}`,
                        }
                      : {
                          background: "rgba(255,255,255,0.04)",
                          color: HBS.white,
                          border: `1px solid ${HBS.border}`,
                        }
                  }
                >
                  {m.role === "assistant" ? (
                    <ReactMarkdown components={mdComponents}>{text}</ReactMarkdown>
                  ) : (
                    text
                  )}
                </div>
                {showSignupCta && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      const search: Record<string, string> = { mode: "signup" };
                      if (email) search.email = email;
                      if (fullName) search.name = fullName;
                      nav({ to: "/auth", search });
                    }}
                    className="inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1.5 text-[11px] font-semibold text-white transition hover:-translate-y-0.5"
                    style={{
                      background: `linear-gradient(120deg, ${HBS.blue}, ${HBS.gold})`,
                      boxShadow: `0 12px 30px -12px ${HBS.gold}`,
                    }}
                  >
                    <UserPlus className="size-3.5" />
                    {lang === "en" ? "Open signup page" : "افتح صفحة التسجيل"}
                    <ArrowRight className="size-3" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {busy && (
          <div className="flex items-center gap-2 text-xs" style={{ color: HBS.goldSoft }}>
            <Loader2 className="size-3 animate-spin" /> {t.typing}
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
            {t.error}
          </div>
        )}
      </div>

      <div
        className="flex flex-wrap gap-1.5 px-3 py-2"
        style={{ borderTop: `1px solid ${HBS.border}` }}
      >
        {QUICK[lang].map((q) => (
          <button
            key={q}
            onClick={() => send(q)}
            className="rounded-full px-2.5 py-1 text-[11px] transition hover:-translate-y-0.5"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${HBS.border}`,
              color: HBS.goldSoft,
            }}
          >
            {q}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-center gap-2 p-2"
        style={{ borderTop: `1px solid ${HBS.border}` }}
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t.placeholder}
          className="h-9 border-0 bg-white/5 text-white placeholder:text-white/40"
          style={{ border: `1px solid ${HBS.border}` }}
          disabled={busy}
        />
        <Button
          type="submit"
          size="sm"
          disabled={busy || !input.trim()}
          className="h-9 gap-1 border-0 text-white"
          style={{
            background: `linear-gradient(120deg, ${HBS.blue}, ${HBS.gold})`,
            boxShadow: `0 12px 30px -12px ${HBS.gold}`,
          }}
        >
          <Send className="size-4" />
        </Button>
      </form>

      <div style={{ borderTop: `1px solid ${HBS.border}` }}>
        <button
          type="button"
          onClick={() => setFormOpen((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-2 text-xs transition hover:bg-white/5"
          style={{ color: HBS.goldSoft }}
        >
          <span className="flex items-center gap-2">
            <UserPlus className="size-3.5" />
            {formOpen ? f.toggleClose : f.toggleOpen}
          </span>
          {formOpen ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
        </button>
        {formOpen && (
          <form onSubmit={handleSignup} className="space-y-2 px-3 pb-3">
            <Input
              value={fullName}
              onChange={(e) => {
                touched.current.name = true;
                setFullName(e.target.value);
              }}
              placeholder={f.fullName}
              className="h-8 border-0 bg-white/5 text-xs text-white placeholder:text-white/40"
              style={{ border: `1px solid ${HBS.border}` }}
              disabled={signingUp}
              autoComplete="name"
            />
            <Input
              type="email"
              value={email}
              onChange={(e) => {
                touched.current.email = true;
                setEmail(e.target.value);
              }}
              placeholder={f.email}
              className="h-8 border-0 bg-white/5 text-xs text-white placeholder:text-white/40"
              style={{ border: `1px solid ${HBS.border}` }}
              disabled={signingUp}
              autoComplete="email"
            />
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={f.password}
              className="h-8 border-0 bg-white/5 text-xs text-white placeholder:text-white/40"
              style={{ border: `1px solid ${HBS.border}` }}
              disabled={signingUp}
              autoComplete="new-password"
            />
            {formError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive">
                {formError}
              </div>
            )}
            {formSuccess && (
              <div
                className="rounded-md p-2 text-[11px]"
                style={{
                  background: "rgba(212,175,55,0.08)",
                  border: `1px solid ${HBS.border}`,
                  color: HBS.goldSoft,
                }}
              >
                {formSuccess}
              </div>
            )}
            <Button
              type="submit"
              size="sm"
              disabled={signingUp}
              className="h-8 w-full gap-1 border-0 text-xs text-white"
              style={{
                background: `linear-gradient(120deg, ${HBS.blue}, ${HBS.gold})`,
                boxShadow: `0 12px 30px -12px ${HBS.gold}`,
              }}
            >
              {signingUp ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" /> {f.submitting}
                </>
              ) : (
                <>
                  <UserPlus className="size-3.5" /> {f.submit}
                </>
              )}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
