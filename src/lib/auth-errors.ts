/**
 * Map Supabase auth errors (OTP send, OTP verify, magic link) into
 * clear bilingual (AR/EN) messages for the signup / login flow.
 * Pure — no side effects — so tests can assert the mapping.
 */
export type AuthErrorHint = {
  title: string;
  description?: string;
};

const raw = (e: unknown): string => {
  if (!e) return "";
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  if (typeof e === "object") {
    const anyErr = e as { message?: unknown; error_description?: unknown; msg?: unknown };
    if (typeof anyErr.message === "string") return anyErr.message;
    if (typeof anyErr.error_description === "string") return anyErr.error_description;
    if (typeof anyErr.msg === "string") return anyErr.msg;
  }
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
};

const statusOf = (e: unknown): number | null => {
  if (e && typeof e === "object") {
    const s = (e as { status?: unknown }).status;
    if (typeof s === "number") return s;
  }
  return null;
};

export function describeAuthError(err: unknown, lang: string = "ar"): AuthErrorHint {
  const ar = lang?.toLowerCase().startsWith("ar");
  const msg = raw(err).toLowerCase();
  const status = statusOf(err);

  // Duplicate email / already registered
  if (
    msg.includes("already registered") ||
    msg.includes("already exists") ||
    msg.includes("user already") ||
    msg.includes("email address already") ||
    msg.includes("duplicate")
  ) {
    return ar
      ? {
          title: "هذا البريد مسجّل مسبقًا",
          description:
            "يبدو أن لديك حسابًا بهذا البريد. جرّب تسجيل الدخول أو استخدم «نسيت كلمة المرور» أو اطلب رمز الدخول لبريدك.",
        }
      : {
          title: "Email already registered",
          description:
            "An account already uses this email. Try signing in, request a new sign-in code, or reset your password.",
        };
  }

  // Invalid email format
  if (msg.includes("invalid email") || msg.includes("email address is invalid")) {
    return ar
      ? { title: "صيغة البريد غير صحيحة", description: "تأكّد من كتابة البريد بشكل كامل مثل: name@example.com" }
      : { title: "Invalid email format", description: "Enter a full email like name@example.com" };
  }

  // OTP verification failures
  if (msg.includes("token has expired") || msg.includes("otp_expired") || msg.includes("expired")) {
    return ar
      ? { title: "انتهت صلاحية الرمز", description: "اطلب رمزًا جديدًا وأدخله خلال الدقائق القليلة القادمة." }
      : { title: "Code expired", description: "Request a new code and enter it within a few minutes." };
  }
  if (
    msg.includes("invalid token") ||
    msg.includes("token is invalid") ||
    msg.includes("otp_invalid") ||
    msg.includes("invalid otp") ||
    msg.includes("invalid or has expired")
  ) {
    return ar
      ? {
          title: "الرمز غير صحيح",
          description: "تأكّد من الأرقام الستة كما وردت في رسالة البريد، أو اطلب رمزًا جديدًا.",
        }
      : {
          title: "Incorrect code",
          description: "Check the 6 digits from the email, or request a fresh code.",
        };
  }

  // Rate limit
  if (
    msg.includes("rate limit") ||
    msg.includes("over_email_send_rate_limit") ||
    msg.includes("too many") ||
    status === 429
  ) {
    return ar
      ? {
          title: "محاولات كثيرة خلال وقت قصير",
          description: "انتظر دقيقة ثم أعد المحاولة. لحمايتك قيّدنا عدد الرسائل المرسلة.",
        }
      : {
          title: "Too many attempts",
          description: "Wait a minute before trying again. We rate-limit emails to protect your account.",
        };
  }

  // Signups disabled
  if (msg.includes("signups not allowed") || msg.includes("signup is disabled")) {
    return ar
      ? { title: "التسجيل مغلق حاليًا", description: "تواصل مع الدعم إن كنت بحاجة إلى حساب جديد." }
      : { title: "Signups are disabled", description: "Contact support if you need a new account." };
  }

  // Auth session / unauthorized
  if (msg.includes("jwt") || msg.includes("unauthorized") || status === 401) {
    return ar
      ? { title: "انتهت الجلسة", description: "سجّل الدخول مجددًا ثم أعد المحاولة." }
      : { title: "Session expired", description: "Please sign in again and retry." };
  }

  // Network
  if (msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("network")) {
    return ar
      ? { title: "تعذّر الاتصال بالخادم", description: "تحقّق من الإنترنت وأعد المحاولة." }
      : { title: "Network error", description: "Check your connection and try again." };
  }

  // Generic fallback — keep the original text visible
  const original = raw(err).trim();
  return ar
    ? {
        title: "تعذّر إتمام العملية",
        description: original || "حدث خطأ غير متوقع. أعد المحاولة أو تواصل مع الدعم.",
      }
    : {
        title: "Something went wrong",
        description: original || "Unexpected error. Please retry or contact support.",
      };
}
