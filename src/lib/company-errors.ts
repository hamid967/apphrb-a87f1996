/**
 * Turn low-level backend errors from `register_company` (and the related
 * organizations / organization_members writes) into an actionable Arabic
 * message the onboarding wizard can toast. Covers the security-rule
 * failures we can actually recover from — permission denied on the RPC,
 * RLS block on the underlying tables, duplicate membership, and the
 * function's own thrown exceptions.
 *
 * Keep this pure (no toast/i18n side effects) so tests can assert the
 * mapping directly. See `tests/register-company-error.test.ts`.
 */
export type CompanyErrorHint = {
  /** Short line users see in the toast. */
  title: string;
  /** Longer sentence explaining what to do next. */
  description: string;
};

const raw = (e: unknown): string => {
  if (!e) return "";
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  if (typeof e === "object") {
    const anyErr = e as { message?: unknown; error?: unknown };
    if (typeof anyErr.message === "string") return anyErr.message;
    if (typeof anyErr.error === "string") return anyErr.error;
  }
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
};

export function describeCompanyCreateError(err: unknown): CompanyErrorHint {
  const msg = raw(err).toLowerCase();

  // Function-level throws from public.register_company
  if (msg.includes("not authenticated")) {
    return {
      title: "انتهت الجلسة",
      description: "يرجى تسجيل الدخول مجددًا ثم إعادة المحاولة.",
    };
  }
  if (msg.includes("already belong")) {
    return {
      title: "لديك شركة بالفعل",
      description:
        "هذا الحساب مرتبط بشركة قائمة. سجّل الخروج ثم ادخل بحساب جديد، أو اطلب من مسؤول الشركة دعوتك.",
    };
  }
  if (msg.includes("invalid company name")) {
    return {
      title: "اسم الشركة غير صالح",
      description: "أدخل اسمًا مكوّنًا من حرفين على الأقل.",
    };
  }

  // Data API / RLS failures
  if (msg.includes("permission denied for function register_company")) {
    return {
      title: "لا تملك صلاحية إنشاء شركة",
      description:
        "لم يتم منح حسابك صلاحية استدعاء إجراء إنشاء الشركة. تواصل مع الدعم لتفعيل الصلاحية.",
    };
  }
  if (msg.includes("permission denied for function")) {
    return {
      title: "صلاحية غير مفعّلة",
      description:
        "إجراء إنشاء الشركة لم يُمنح لهذا الحساب. راجع الدعم للحصول على الإذن اللازم.",
    };
  }
  if (msg.includes("permission denied for table") || msg.includes("permission denied for relation")) {
    return {
      title: "الصلاحيات على الجداول غير مكتملة",
      description:
        "لا يستطيع حسابك الكتابة على جدول الشركات. يحتاج المشرف إلى منح صلاحيات الوصول ثم إعادة المحاولة.",
    };
  }
  if (msg.includes("row-level security") || msg.includes("violates row-level security")) {
    return {
      title: "قواعد الحماية منعت الإنشاء",
      description:
        "تعذّر تنفيذ العملية بسبب سياسات الحماية (RLS). سجّل الخروج والدخول من جديد؛ إن استمرت المشكلة فتواصل مع الدعم.",
    };
  }
  if (msg.includes("duplicate key") || msg.includes("unique constraint")) {
    return {
      title: "الاسم مستخدم مسبقًا",
      description: "جرّب اسمًا مختلفًا لمساحة العمل.",
    };
  }
  if (msg.includes("jwt") || msg.includes("unauthorized") || msg.includes("401")) {
    return {
      title: "انتهت الجلسة",
      description: "يرجى تسجيل الدخول مجددًا ثم إعادة المحاولة.",
    };
  }
  if (msg.includes("failed to fetch") || msg.includes("networkerror")) {
    return {
      title: "تعذّر الاتصال بالخادم",
      description: "تحقّق من اتصال الإنترنت وأعد المحاولة.",
    };
  }

  // Generic fallback — surface the original text so the user has *something*
  // actionable to share with support.
  const original = raw(err).trim();
  return {
    title: "تعذّر إنشاء الشركة",
    description: original
      ? `${original} — أعد المحاولة أو تواصل مع الدعم إن استمرت المشكلة.`
      : "حدث خطأ غير متوقع. أعد المحاولة أو تواصل مع الدعم.",
  };
}
