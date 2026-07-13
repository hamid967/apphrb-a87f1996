import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAAL2SuperAdmin } from "@/lib/admin-auth-middleware";

const Input = z.object({
  query: z.string().trim().min(2).max(200),
});

export type SubscriptionDiagnostic = {
  ok: boolean;
  looked_up: { query: string };
  user: null | {
    id: string;
    email: string | null;
    created_at: string | null;
  };
  profile: null | {
    approval_status: string | null;
    approved_at: string | null;
    trial_ends_at: string | null;
    phone: string | null;
    full_name: string | null;
    trial_days_remaining: number | null;
    trial_expired: boolean | null;
  };
  memberships: Array<{
    org_id: string;
    org_name: string;
    role: string;
    org_created_at: string | null;
  }>;
  subscriptions: Array<{
    id: string;
    org_id: string;
    org_name: string | null;
    status: string;
    billing_cycle: string;
    package_code: string | null;
    package_name: string | null;
    start_date: string | null;
    end_date: string | null;
    days_remaining: number | null;
    is_active_now: boolean;
    created_at: string | null;
  }>;
  packages_available: number;
  timeline: Array<{ at: string; kind: string; label: string }>;
  diagnosis: Array<{ level: "ok" | "warn" | "error"; message: string; hint?: string }>;
};

export const diagnoseSubscriptionActivation = createServerFn({ method: "POST" })
  .middleware([requireAAL2SuperAdmin])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<SubscriptionDiagnostic> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const query = data.query.trim();
    const looksLikeUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query);

    // 1. Resolve user (email → id, or direct id).
    let userId: string | null = null;
    let userEmail: string | null = null;
    let userCreatedAt: string | null = null;

    if (looksLikeUuid) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(query);
      if (u?.user) {
        userId = u.user.id;
        userEmail = u.user.email ?? null;
        userCreatedAt = u.user.created_at ?? null;
      }
    } else {
      // Search by email — paginate up to 3 pages.
      for (let page = 1; page <= 3 && !userId; page++) {
        const { data: list } = await supabaseAdmin.auth.admin.listUsers({
          page,
          perPage: 200,
        });
        const match = list?.users.find(
          (x) => (x.email ?? "").toLowerCase() === query.toLowerCase(),
        );
        if (match) {
          userId = match.id;
          userEmail = match.email ?? null;
          userCreatedAt = match.created_at ?? null;
        }
        if (!list || list.users.length < 200) break;
      }
    }

    const out: SubscriptionDiagnostic = {
      ok: true,
      looked_up: { query },
      user: userId ? { id: userId, email: userEmail, created_at: userCreatedAt } : null,
      profile: null,
      memberships: [],
      subscriptions: [],
      packages_available: 0,
      timeline: [],
      diagnosis: [],
    };

    // Packages presence check (root-cause for register_company skipping subscription insert).
    const { count: pkgCount } = await supabaseAdmin
      .from("packages")
      .select("id", { count: "exact", head: true })
      .eq("active", true);
    out.packages_available = pkgCount ?? 0;
    if ((pkgCount ?? 0) === 0) {
      out.diagnosis.push({
        level: "error",
        message: "لا توجد باقات نشطة (packages.active=true).",
        hint: "بدون باقة نشطة يتخطى register_company إنشاء الاشتراك — أضف الباقات ثم أعِد المزامنة.",
      });
    }

    if (!userId) {
      out.ok = false;
      out.diagnosis.push({
        level: "error",
        message: `لا يوجد مستخدم بالبريد/المعرف: ${query}`,
        hint: "تحقق من صحة الإدخال، أو أن المستخدم أنشأ حساباً فعلاً.",
      });
      return out;
    }

    if (userCreatedAt) {
      out.timeline.push({
        at: userCreatedAt,
        kind: "signup",
        label: "أنشأ المستخدم حسابه في نظام المصادقة",
      });
    }

    // 2. Profile.
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("approval_status, approved_at, trial_ends_at, phone, full_name")
      .eq("id", userId)
      .maybeSingle();

    if (profile) {
      const trialEnds = profile.trial_ends_at ? new Date(profile.trial_ends_at) : null;
      const now = new Date();
      const daysLeft = trialEnds
        ? Math.ceil((trialEnds.getTime() - now.getTime()) / 86_400_000)
        : null;
      out.profile = {
        approval_status: profile.approval_status ?? null,
        approved_at: profile.approved_at ?? null,
        trial_ends_at: profile.trial_ends_at ?? null,
        phone: profile.phone ?? null,
        full_name: profile.full_name ?? null,
        trial_days_remaining: daysLeft,
        trial_expired: trialEnds ? trialEnds.getTime() < now.getTime() : null,
      };
      if (profile.approved_at) {
        out.timeline.push({
          at: profile.approved_at,
          kind: "approved",
          label: `تمت الموافقة على الملف (${profile.approval_status ?? "?"})`,
        });
      }
      if (profile.trial_ends_at) {
        out.timeline.push({
          at: profile.trial_ends_at,
          kind: "trial_end",
          label: "نهاية نافذة التجربة على الملف الشخصي",
        });
      }
      if (profile.approval_status === "pending") {
        out.diagnosis.push({
          level: "warn",
          message: "الملف قيد الموافقة (approval_status=pending).",
          hint: "AccessGate سيرجع state=pending وتظهر الشاشة كغير مفعّلة.",
        });
      } else if (profile.approval_status === "rejected") {
        out.diagnosis.push({
          level: "error",
          message: "تم رفض الملف (approval_status=rejected).",
        });
      }
      if (trialEnds && trialEnds.getTime() < now.getTime()) {
        out.diagnosis.push({
          level: "warn",
          message: "نافذة التجربة على الملف منتهية.",
          hint: "يعتمد الوصول عندها على وجود اشتراك نشط.",
        });
      }
    } else {
      out.diagnosis.push({
        level: "error",
        message: "لا يوجد ملف في public.profiles لهذا المستخدم.",
        hint: "قد يفشل trigger إنشاء الملف — فعّل on_auth_user_created أو أنشئ الملف يدوياً.",
      });
    }

    // 3. Memberships.
    const { data: memberships } = await supabaseAdmin
      .from("organization_members")
      .select("org_id, role, organizations!inner(id, name, created_at)")
      .eq("user_id", userId);

    type MRow = {
      org_id: string;
      role: string;
      organizations: { id: string; name: string; created_at: string | null } | null;
    };
    const memRows = (memberships ?? []) as unknown as MRow[];
    out.memberships = memRows.map((m) => ({
      org_id: m.org_id,
      org_name: m.organizations?.name ?? "—",
      role: m.role,
      org_created_at: m.organizations?.created_at ?? null,
    }));
    for (const m of out.memberships) {
      if (m.org_created_at) {
        out.timeline.push({
          at: m.org_created_at,
          kind: "org_created",
          label: `تم إنشاء الشركة "${m.org_name}" (دور: ${m.role})`,
        });
      }
    }

    if (out.memberships.length === 0) {
      out.diagnosis.push({
        level: "error",
        message: "المستخدم غير مرتبط بأي شركة.",
        hint: "لم يكتمل onboarding — لم يتم استدعاء register_company أو فشلت.",
      });
    }

    // 4. Subscriptions for those orgs.
    const orgIds = out.memberships.map((m) => m.org_id);
    if (orgIds.length > 0) {
      const { data: subs } = await supabaseAdmin
        .from("subscriptions")
        .select(
          "id, org_id, status, billing_cycle, start_date, end_date, created_at, packages(code, name), organizations(name)",
        )
        .in("org_id", orgIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      type SRow = {
        id: string;
        org_id: string;
        status: string;
        billing_cycle: string;
        start_date: string | null;
        end_date: string | null;
        created_at: string | null;
        packages: { code: string; name: string } | null;
        organizations: { name: string } | null;
      };
      const subRows = (subs ?? []) as unknown as SRow[];
      const today = new Date();
      out.subscriptions = subRows.map((s) => {
        const end = s.end_date ? new Date(s.end_date) : null;
        const daysRem = end
          ? Math.ceil((end.getTime() - today.getTime()) / 86_400_000)
          : null;
        return {
          id: s.id,
          org_id: s.org_id,
          org_name: s.organizations?.name ?? null,
          status: s.status,
          billing_cycle: s.billing_cycle,
          package_code: s.packages?.code ?? null,
          package_name: s.packages?.name ?? null,
          start_date: s.start_date,
          end_date: s.end_date,
          days_remaining: daysRem,
          is_active_now:
            s.status === "active" && (!end || end.getTime() >= today.getTime()),
          created_at: s.created_at,
        };
      });
      for (const s of out.subscriptions) {
        if (s.created_at) {
          out.timeline.push({
            at: s.created_at,
            kind: "subscription_created",
            label: `تم إنشاء اشتراك (${s.package_code ?? "؟"}, ${s.status}) للشركة ${s.org_name ?? s.org_id.slice(0, 8)}`,
          });
        }
        if (s.end_date) {
          out.timeline.push({
            at: s.end_date + "T00:00:00Z",
            kind: "subscription_end",
            label: `نهاية اشتراك (${s.package_code ?? "؟"}) للشركة ${s.org_name ?? s.org_id.slice(0, 8)}`,
          });
        }
      }

      const orgsWithoutSub = orgIds.filter(
        (id) => !subRows.some((s) => s.org_id === id),
      );
      if (orgsWithoutSub.length > 0) {
        out.diagnosis.push({
          level: "error",
          message: `يوجد ${orgsWithoutSub.length} شركة بدون أي اشتراك.`,
          hint:
            (pkgCount ?? 0) === 0
              ? "السبب المرجّح: جدول packages فارغ عند تشغيل register_company."
              : "شغّل مزامنة التجربة لإدراج اشتراك تجريبي ٧ أيام.",
        });
      }
      const anyActive = out.subscriptions.some((s) => s.is_active_now);
      if (anyActive) {
        out.diagnosis.push({
          level: "ok",
          message: "يوجد اشتراك نشط سارٍ الآن — يجب أن يظهر الحساب كمُفعّل.",
        });
      } else if (out.subscriptions.length > 0) {
        out.diagnosis.push({
          level: "warn",
          message: "لا يوجد اشتراك نشط سارٍ اليوم (كل الاشتراكات منتهية أو غير نشطة).",
        });
      }
    }

    // Sort timeline ascending.
    out.timeline.sort((a, b) => (a.at < b.at ? -1 : 1));
    return out;
  });
