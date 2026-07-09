import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Can } from "@/components/auth/Can";
import { listMyOrganizations } from "@/lib/organizations.functions";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle, BrandMark } from "@/components/theme-toggle";
import { ActivityFeed } from "@/components/activity-feed";
import { TrialBot } from "@/components/trial-bot";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Home,
  LogOut,
  Loader2,
  Users,
  Handshake,
  Settings,
  Calculator,
  Wrench,
  Bot,
  RefreshCw,
  Mail,
  LifeBuoy,
  Wifi,
  WifiOff,
  Clock,
  XCircle,
  CreditCard,
  CheckCircle2,
} from "lucide-react";
import { ADMIN_ROLES, type OrgRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { ErrorBoundary } from "@/components/error-boundary";
import { DashboardTopbar } from "@/components/dashboard/DashboardTopbar";
import { IdleLogout } from "@/components/security/IdleLogout";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "لوحة التحكم — Aqari by HRHBS" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AuthenticatedShellWithBoundary,
});

function AuthenticatedShellWithBoundary() {
  // Apply the Minimal Dark Tech theme (Slate & Steel + Space Grotesk/DM Sans)
  // to every authenticated route. Scoped via <html> class so all shadcn
  // tokens flip together; removed on unmount so /auth, /, and marketing
  // keep the violet HRHBS + luxe themes intact.
  useEffect(() => {
    const el = document.documentElement;
    el.classList.add("theme-tech", "dark");
    return () => {
      el.classList.remove("theme-tech", "dark");
    };
  }, []);
  return (
    <ErrorBoundary>
      <IdleLogout />
      <AuthenticatedShell />
    </ErrorBoundary>
  );
}

type AccessStatus = {
  state: "anonymous" | "no_profile" | "pending" | "rejected" | "expired" | "active" | "grace";
  trial_ends_at?: string | null;
  reason?: string;
  warning?: string;
  subscription_end_date?: string | null;
  grace_period_days?: number;
  grace_ends_at?: string | null;
  grace_days_remaining?: number;
  days_remaining?: number;
  warning_days?: number;
};

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function formatCountdown(ms: number) {
  if (ms <= 0) return "00:00:00:00";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d)}:${pad(h)}:${pad(m)}:${pad(sec)}`;
}

function TrialCountdown({
  endsAt,
  state,
}: {
  endsAt?: string | null;
  state: AccessStatus["state"];
}) {
  const now = useNow(1000);
  if (!endsAt) return null;
  const end = new Date(endsAt).getTime();
  const remaining = end - now;
  const expired = remaining <= 0 || state === "expired";
  const label =
    state === "pending" ? "بانتظار الاعتماد" : expired ? "انتهت التجربة" : "تنتهي التجربة خلال";
  const tone =
    state === "pending"
      ? "bg-primary/10 text-primary border-primary/20"
      : expired
        ? "bg-destructive/10 text-destructive border-destructive/20"
        : remaining < 24 * 3600 * 1000
          ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/20"
          : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
  return (
    <div className={cn("rounded-xl border px-3 py-2 text-xs font-medium", tone)}>
      <div className="opacity-80">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-2">
        <span className="font-mono text-sm tabular-nums">{formatCountdown(remaining)}</span>
        <span className="opacity-60">(يوم:س:د:ث)</span>
      </div>
      <div className="mt-0.5 text-[10px] opacity-70">{new Date(endsAt).toLocaleString("ar")}</div>
    </div>
  );
}

function SubscriptionBanner({ access }: { access: AccessStatus }) {
  if (access.state === "grace") {
    return (
      <div className="sticky top-0 z-40 border-b border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-center text-sm text-yellow-700 dark:text-yellow-400">
        ⚠️ انتهى اشتراكك في {access.subscription_end_date} — أنت في فترة السماح (
        {access.grace_period_days} أيام). متبقٍ <strong>{access.grace_days_remaining}</strong> يوم
        قبل قفل الحساب.{" "}
        <Link to="/dashboard/renew" className="underline font-medium">
          جدّد الآن
        </Link>
      </div>
    );
  }
  if (access.warning === "subscription_ending_soon") {
    return (
      <div className="sticky top-0 z-40 border-b border-primary/30 bg-primary/10 px-4 py-2 text-center text-sm text-primary">
        اشتراكك سينتهي خلال <strong>{access.days_remaining}</strong> يوم (في{" "}
        {access.subscription_end_date}).{" "}
        <Link to="/dashboard/renew" className="underline font-medium">
          جدّد الآن
        </Link>
      </div>
    );
  }
  return null;
}

function AuthenticatedShell() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { user, ready } = useAuth();
  const qc = useQueryClient();

  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.searchStr });

  useEffect(() => {
    if (ready && !user) {
      // Preserve where the visitor was heading so /auth can bounce them
      // back after sign-in. Skip when we're already on /auth to avoid
      // ?redirect=/auth loops.
      const target = `${pathname}${search ?? ""}`;
      const isOnAuth = pathname === "/auth" || pathname.startsWith("/auth?");
      nav({
        to: "/auth",
        search: isOnAuth || pathname === "/" ? {} : { redirect: target },
        replace: true,
      });
    }
  }, [ready, user, nav, pathname, search]);

  const accessQuery = useQuery({
    queryKey: ["my-access-status", user?.id],
    enabled: !!user,
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<AccessStatus> => {
      const { data, error } = await supabase.rpc("my_access_status");
      if (error) throw error;
      return data as AccessStatus;
    },
  });

  // Super admins operate above the org/subscription model — they may have
  // zero organizations and no active profile subscription. Detect the role
  // via has_role() so we can short-circuit the onboarding redirect and the
  // AccessGate below and let them reach /admin/* pages.
  const superAdminQuery = useQuery({
    queryKey: ["is-super-admin", user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: user!.id,
        _role: "super_admin" as never,
      });
      if (error) throw error;
      return data === true;
    },
  });
  const isSuperAdmin = superAdminQuery.data === true;

  const pathnameForNav = pathname; // stable ref used below before onAdmin decl

  // Realtime: invalidate on profile changes so status updates instantly.
  const [rtStatus, setRtStatus] = useState<"connecting" | "live" | "offline">("connecting");
  useEffect(() => {
    if (!user) return;
    let disposed = false;
    setRtStatus("connecting");
    const channel = supabase
      .channel(`profile-access-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["my-access-status", user.id] });
        },
      )
      .subscribe((status) => {
        if (disposed) return;
        if (status === "SUBSCRIBED") setRtStatus("live");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED")
          setRtStatus("offline");
      });
    return () => {
      disposed = true;
      supabase.removeChannel(channel);
    };
  }, [user, qc]);

  // Notify + auto-redirect when state transitions.
  const prevStateRef = useRef<AccessStatus["state"] | null>(null);
  useEffect(() => {
    const next = accessQuery.data?.state;
    if (!next) return;
    const prev = prevStateRef.current;
    if (prev && prev !== next) {
      if (next === "active") toast.success("تم تفعيل حسابك — أهلاً بك!");
      else if (next === "rejected") toast.error("تم رفض حسابك من قبل الأدمن.");
      else if (next === "expired") toast.warning("انتهت فترة التجربة المجانية.");
      else if (next === "pending") toast.info("حسابك أصبح قيد المراجعة.");
      // Don't yank super_admins off /admin/* just because their tenant
      // access flipped to "active" — they don't use the org dashboard.
      const onAdminNow = pathnameForNav === "/admin" || pathnameForNav.startsWith("/admin/");
      if (next === "active" && !isSuperAdmin && !onAdminNow) {
        nav({ to: "/dashboard", replace: true });
      }
    }
    prevStateRef.current = next;
  }, [accessQuery.data?.state, isSuperAdmin, pathnameForNav, nav]);

  const orgsQuery = useQuery({
    queryKey: ["my-organizations", user?.id],
    queryFn: () => listMyOrganizations(),
    enabled: !!user,
  });

  const onOnboarding = pathname.startsWith("/onboarding");
  const onDevVerify = pathname.startsWith("/dev/verify");
  const onAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  const onDashboard = pathname === "/dashboard" || pathname.startsWith("/dashboard/");

  // Developer sandbox accounts get instant access — attaching a real email at
  // /dev/verify is optional (users can visit it manually to upgrade).

  // Redirect to onboarding if signed in but no org
  useEffect(() => {
    if (!user || !orgsQuery.isSuccess) return;
    // Super admins are allowed to browse /admin/* with zero orgs.
    if (isSuperAdmin) return;
    if ((orgsQuery.data?.length ?? 0) === 0 && !onOnboarding && !onDevVerify) {
      nav({ to: "/onboarding", replace: true });
    }
  }, [orgsQuery.isSuccess, orgsQuery.data, user, onOnboarding, onDevVerify, isSuperAdmin, nav]);

  // Redirect to onboarding wizard if signed in + has org but hasn't completed
  // the required steps (profile / company / first_receipt). Without this
  // guard a user with an org can bypass the wizard and land on /dashboard
  // with an unfinished profile.
  const onboardingStateQuery = useQuery({
    queryKey: ["my-onboarding-state", user?.id],
    enabled: !!user && !isSuperAdmin,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("onboarding_progress, onboarding_completed_at")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      const progress = (data?.onboarding_progress ?? {}) as Record<
        string,
        { done?: boolean } | undefined
      >;
      const REQUIRED_STEPS = ["profile", "company", "first_receipt"] as const;
      const allStepsDone = REQUIRED_STEPS.every((s) => progress[s]?.done === true);
      return {
        completed_at: data?.onboarding_completed_at ?? null,
        all_steps_done: allStepsDone,
      };
    },
  });
  useEffect(() => {
    if (!user || isSuperAdmin) return;
    if (!onboardingStateQuery.isSuccess) return;
    if ((orgsQuery.data?.length ?? 0) === 0) return; // handled by the guard above
    const s = onboardingStateQuery.data;
    // Gate strictly on the three required steps — completed_at alone is not
    // enough because a stale timestamp could exist without every step done.
    if (s?.all_steps_done && s?.completed_at) return;
    if (onOnboarding || onDevVerify) return;
    nav({ to: "/onboarding/wizard", replace: true });
  }, [
    user,
    isSuperAdmin,
    onboardingStateQuery.isSuccess,
    onboardingStateQuery.data,
    orgsQuery.data,
    onOnboarding,
    onDevVerify,
    nav,
  ]);

  const access = accessQuery.data;

  // Enriched details for the AccessGate: submission time, approver, reason.
  // NOTE: must be declared before any early return so hook order stays stable.
  const detailsQuery = useQuery({
    queryKey: ["my-access-details", user?.id],
    enabled: !!user && !!access && access.state !== "active" && access.state !== "no_profile",
    queryFn: async () => {
      const { data: prof } = await supabase
        .from("profiles")
        .select("approval_status, approved_at, approved_by, created_at, trial_ends_at, full_name")
        .eq("id", user!.id)
        .maybeSingle();
      let approverName: string | null = null;
      if (prof?.approved_by) {
        const { data: approver } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", prof.approved_by)
          .maybeSingle();
        approverName = approver?.full_name ?? null;
      }
      return { profile: prof, approverName };
    },
  });

  if (!ready || !user) {
    return (
      <div className="grid min-h-[var(--app-height,100vh)] place-items-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Super admins bypass the tenant AccessGate — their access is granted by
  // role, not by profile.approval_status / subscription state.
  if (
    !isSuperAdmin &&
    access &&
    access.state !== "active" &&
    access.state !== "no_profile" &&
    access.state !== "grace"
  ) {
    return (
      <AccessGate
        status={access}
        email={user.email ?? ""}
        realtime={rtStatus}
        refetching={accessQuery.isFetching}
        onRefresh={() => accessQuery.refetch()}
        submittedAt={detailsQuery.data?.profile?.created_at ?? null}
        reviewedAt={detailsQuery.data?.profile?.approved_at ?? null}
        approverName={detailsQuery.data?.approverName ?? null}
        approverId={detailsQuery.data?.profile?.approved_by ?? null}
      />
    );
  }

  const orgs = orgsQuery.data ?? [];
  const activeOrg = orgs[0]?.org;
  const isAdmin = orgs.some((o) => ADMIN_ROLES.includes(o.role as OrgRole));
  const botRole: "admin" | "finance" | "employee" | "owner_portal" | "tenant_portal" =
    pathname.startsWith("/owner/portal")
      ? "owner_portal"
      : pathname.startsWith("/tenant/portal")
        ? "tenant_portal"
        : isAdmin
          ? "admin"
          : pathname.startsWith("/accounting")
            ? "finance"
            : "employee";

  if (onDevVerify) {
    return (
      <div className="relative min-h-[var(--app-height,100vh)] overflow-hidden bg-background">
        <AmbientBackdrop />
        <Outlet />
      </div>
    );
  }

  if (!isSuperAdmin && (onOnboarding || orgs.length === 0)) {
    return (
      <div className="relative min-h-[var(--app-height,100vh)] overflow-hidden bg-background">
        <AmbientBackdrop />
        <div className="absolute top-4 end-4 z-10 flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
          <Button size="sm" variant="ghost" onClick={() => supabase.auth.signOut()}>
            <LogOut className="size-4" />
          </Button>
        </div>
        <Outlet />
      </div>
    );
  }

  // /admin/* renders its own AdminSidebar shell — skip the dashboard shell
  // to avoid two side-nav bars overlapping in the same viewport.
  if (onAdmin) {
    return (
      <div className="relative min-h-[var(--app-height,100vh)] bg-background">
        <Outlet />
      </div>
    );
  }

  // /dashboard/* renders its own DashboardSidebar shell (see
  // src/routes/_authenticated/dashboard.tsx) — skip this outer shell so we
  // don't paint two overlapping side-nav bars for the same page.
  if (onDashboard) {
    return (
      <div className="relative min-h-[var(--app-height,100vh)] bg-background">
        {access && <SubscriptionBanner access={access} />}
        <Outlet />
        <TrialBot role={botRole} />
      </div>
    );
  }

  // Block dashboard shell paint until onboarding state is resolved.
  // Without this, `dashboard-shell` flashes for a frame before the
  // redirect effect fires, letting users glimpse the dashboard while
  // their onboarding is still incomplete.
  if (!isSuperAdmin && orgs.length > 0 && !onAdmin) {
    if (!onboardingStateQuery.isSuccess) {
      return (
        <div className="grid min-h-[var(--app-height,100vh)] place-items-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      );
    }
    const s = onboardingStateQuery.data;
    const onboardingComplete = !!(s?.all_steps_done && s?.completed_at);
    if (!onboardingComplete) {
      // Redirect effect will fire; render a loader instead of the shell.
      return (
        <div className="grid min-h-[var(--app-height,100vh)] place-items-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      );
    }
  }

  return (
    <div className="relative grid min-h-[var(--app-height,100vh)] overflow-hidden bg-background md:grid-cols-[260px_1fr]">
      <AmbientBackdrop />
      <aside className="relative hidden border-e border-border/40 bg-card/40 backdrop-blur-xl md:flex md:flex-col">
        <Link
          to="/dashboard"
          className="flex items-center gap-2.5 px-5 py-5 font-semibold tracking-tight"
        >
          <BrandMark size={32} />
          <span className="bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            {t("brand")}
          </span>
        </Link>

        {activeOrg && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-3 mb-3 rounded-2xl border border-border/50 bg-gradient-to-br from-primary/10 via-card/60 to-accent/10 px-3.5 py-2.5 backdrop-blur"
          >
            <div className="truncate text-sm font-medium">{activeOrg.name}</div>
            <div className="truncate text-xs text-muted-foreground">/{activeOrg.slug}</div>
          </motion.div>
        )}

        <nav className="flex-1 space-y-0.5 px-3">
          <SideLink to="/dashboard" icon={<LayoutDashboard className="size-4" />}>
            {t("sidebar.dashboard")}
          </SideLink>
          <SideLink to="/assistant" icon={<Bot className="size-4" />}>
            {t("sidebar.assistant")}
          </SideLink>
          <SideLink to="/dashboard/properties" icon={<Home className="size-4" />}>
            {t("sidebar.properties")}
          </SideLink>
          <SideLink to="/contacts" icon={<Users className="size-4" />}>
            {t("sidebar.contacts")}
          </SideLink>
          <SideLink to="/deals" icon={<Handshake className="size-4" />}>
            {t("sidebar.deals")}
          </SideLink>
          <SideLink to="/accounting" icon={<Calculator className="size-4" />}>
            {t("sidebar.accounting")}
          </SideLink>
          <SideLink to="/dashboard/maintenance" icon={<Wrench className="size-4" />}>
            {t("sidebar.maintenance")}
          </SideLink>
          <SideLink to="/dashboard/settings/import" icon={<Settings className="size-4" />}>
            {t("sidebar.settings")}
          </SideLink>
        </nav>

        <div className="border-t border-border/40 p-3">
          <div className="mb-2 truncate px-2 text-xs text-muted-foreground">{user.email}</div>
          {access?.trial_ends_at && (
            <div className="mb-2">
              <TrialCountdown endsAt={access.trial_ends_at} state={access.state} />
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
            <div className="flex items-center gap-1">
              {activeOrg && <ActivityFeed orgId={activeOrg.id} />}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => supabase.auth.signOut()}
                className="gap-2"
              >
                <LogOut className="size-4" /> {t("sidebar.signOut")}
              </Button>
            </div>
          </div>
        </div>
      </aside>

      <div className="relative flex min-w-0 flex-col">
        {access && <SubscriptionBanner access={access} />}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border/40 bg-background/60 px-4 py-3 backdrop-blur-xl md:hidden">
          <Link to="/dashboard" className="flex items-center gap-2 font-semibold">
            <BrandMark size={28} />
            {t("brand")}
          </Link>
          <div className="flex items-center gap-1">
            <LanguageSwitcher />
            <ThemeToggle />
            {activeOrg && <ActivityFeed orgId={activeOrg.id} />}
            <Button size="sm" variant="ghost" onClick={() => supabase.auth.signOut()}>
              <LogOut className="size-4" />
            </Button>
          </div>
        </header>

        <DashboardTopbar user={user} orgs={orgs} activeOrg={activeOrg} />

        <main className="relative min-w-0 flex-1">
          <Outlet />
        </main>
        <TrialBot role={botRole} />

        <nav className="sticky bottom-0 z-30 grid grid-cols-5 border-t border-border/40 bg-background/70 backdrop-blur-xl md:hidden">
          <MobileLink to="/dashboard" icon={<LayoutDashboard className="size-4" />}>
            {t("sidebar.dashboard")}
          </MobileLink>
          <MobileLink to="/dashboard/properties" icon={<Home className="size-4" />}>
            {t("sidebar.properties")}
          </MobileLink>
          <MobileLink to="/contacts" icon={<Users className="size-4" />}>
            {t("sidebar.contacts")}
          </MobileLink>
          <MobileLink to="/deals" icon={<Handshake className="size-4" />}>
            {t("sidebar.deals")}
          </MobileLink>
          <MobileLink to="/accounting" icon={<Calculator className="size-4" />}>
            {t("sidebar.accounting")}
          </MobileLink>
        </nav>
      </div>
    </div>
  );
}

function AmbientBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute -top-40 start-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,theme(colors.primary/20),transparent_60%)] blur-3xl" />
      <div className="absolute bottom-[-160px] end-[-120px] h-[380px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,theme(colors.accent/18),transparent_60%)] blur-3xl" />
    </div>
  );
}

function AccessGate({
  status,
  email,
  realtime,
  refetching,
  onRefresh,
  submittedAt,
  reviewedAt,
  approverName,
  approverId,
}: {
  status: AccessStatus;
  email: string;
  realtime: "connecting" | "live" | "offline";
  refetching: boolean;
  onRefresh: () => void;
  submittedAt: string | null;
  reviewedAt: string | null;
  approverName: string | null;
  approverId: string | null;
}) {
  const supportEmail = "support@hbspro.dev";
  const map = {
    pending: {
      title: "حسابك قيد المراجعة",
      body: "تم إنشاء حسابك بنجاح ونحن نراجعه الآن. عادةً ما يستغرق الاعتماد أقل من ساعة عمل، وستنطلق تجربتك المجانية (7 أيام) فور الموافقة.",
      steps: [
        "سيصلك إشعار فوري عند الاعتماد",
        "تحديث الحالة تلقائيًا كل دقيقة وعبر الاتصال المباشر",
        "يمكنك التواصل مع الدعم لتسريع المراجعة",
      ],
      tone: "info" as const,
      icon: Clock,
    },
    rejected: {
      title: "تم رفض الحساب",
      body: "للأسف لم تتم الموافقة على حسابك. قد يعود ذلك إلى بيانات غير مكتملة أو مخالفة سياسات الاستخدام.",
      steps: [
        "راجع البريد الإلكتروني الذي أرسلناه لك",
        "تواصل مع فريق الدعم لمعرفة السبب",
        "يمكنك تحديث بياناتك وإعادة التقديم",
      ],
      tone: "error" as const,
      icon: XCircle,
    },
    expired: {
      title: "انتهت فترة التجربة",
      body: `انتهت تجربتك المجانية${status.trial_ends_at ? " في " + new Date(status.trial_ends_at).toLocaleString("ar") : ""}. اشترك الآن لاستعادة الوصول الكامل لبياناتك وفرقك.`,
      steps: [
        "بياناتك محفوظة بأمان بانتظار تفعيل الاشتراك",
        "خطط مرنة تبدأ من الفريق الصغير حتى المؤسسات",
        "الدعم متاح لمساعدتك في اختيار الخطة المناسبة",
      ],
      tone: "warning" as const,
      icon: CreditCard,
    },
    anonymous: {
      title: "غير مسجل الدخول",
      body: "",
      steps: [],
      tone: "info" as const,
      icon: Loader2,
    },
    no_profile: { title: "", body: "", steps: [], tone: "info" as const, icon: Loader2 },
    active: { title: "", body: "", steps: [], tone: "info" as const, icon: CheckCircle2 },
    grace: { title: "", body: "", steps: [], tone: "info" as const, icon: Clock },
  }[status.state];

  const Icon = map.icon;
  const rtLabel =
    realtime === "live"
      ? "متصل — التحديثات فورية"
      : realtime === "connecting"
        ? "جاري الاتصال بالخادم…"
        : "الاتصال المباشر منقطع — نستمر في التحديث كل دقيقة";

  const badgeText =
    status.state === "pending"
      ? "قيد المراجعة"
      : status.state === "rejected"
        ? "مرفوض"
        : status.state === "expired"
          ? "انتهت التجربة"
          : status.state === "anonymous"
            ? "غير مسجل"
            : "—";
  const badgeTone =
    map.tone === "info"
      ? "bg-primary/10 text-primary border-primary/20"
      : map.tone === "warning"
        ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/20"
        : "bg-destructive/10 text-destructive border-destructive/20";
  const fmt = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" }) : "—";
  const reviewerLabel = approverName
    ? approverName
    : approverId
      ? `مسؤول #${approverId.slice(0, 8)}`
      : status.state === "pending"
        ? "لم يُسنَد بعد"
        : "—";

  return (
    <div className="relative grid min-h-[var(--app-height,100vh)] place-items-center overflow-hidden bg-background p-6">
      <AmbientBackdrop />
      <div className="absolute top-4 end-4 z-10 flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => supabase.auth.signOut()}>
          <LogOut className="size-4" /> تسجيل الخروج
        </Button>
      </div>
      <div className="relative w-full max-w-lg rounded-3xl border border-border/50 bg-card/80 p-8 shadow-2xl backdrop-blur-xl">
        <div className="flex items-start gap-4">
          <div
            className={cn(
              "grid size-14 shrink-0 place-items-center rounded-2xl",
              map.tone === "info" && "bg-primary/10 text-primary",
              map.tone === "warning" && "bg-yellow-500/10 text-yellow-600",
              map.tone === "error" && "bg-destructive/10 text-destructive",
            )}
          >
            <Icon className={cn("size-6", status.state === "pending" && "animate-pulse")} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold">{map.title}</h1>
              <span
                className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", badgeTone)}
              >
                {badgeText}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">{map.body}</p>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 rounded-2xl border border-border/40 bg-muted/20 p-4 text-xs">
          <div>
            <dt className="text-muted-foreground">تاريخ التقديم</dt>
            <dd className="mt-0.5 font-medium">{fmt(submittedAt)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">
              {status.state === "rejected"
                ? "تاريخ الرفض"
                : status.state === "expired"
                  ? "انتهت في"
                  : "تاريخ المراجعة"}
            </dt>
            <dd className="mt-0.5 font-medium">
              {fmt(status.state === "expired" ? status.trial_ends_at : reviewedAt)}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-muted-foreground">
              {status.state === "rejected" ? "تمت المراجعة بواسطة" : "المسؤول عن المراجعة"}
            </dt>
            <dd className="mt-0.5 font-medium">{reviewerLabel}</dd>
          </div>
        </dl>

        {map.steps.length > 0 && (
          <div className="mt-4 rounded-2xl border border-border/40 bg-muted/30 p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              الخطوات التالية
            </div>
            <ol className="space-y-2 text-sm">
              {map.steps.map((s, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
                    {i + 1}
                  </span>
                  <span className="text-foreground/80">{s}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        <div className="mt-4">
          <TrialCountdown endsAt={status.trial_ends_at} state={status.state} />
        </div>

        <div
          className={cn(
            "mt-4 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs",
            realtime === "live" && "border-emerald-500/20 bg-emerald-500/5 text-emerald-600",
            realtime === "connecting" && "border-border/50 bg-muted/40 text-muted-foreground",
            realtime === "offline" && "border-yellow-500/20 bg-yellow-500/5 text-yellow-600",
          )}
        >
          {realtime === "live" ? (
            <Wifi className="size-3.5" />
          ) : realtime === "connecting" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <WifiOff className="size-3.5" />
          )}
          <span className="flex-1">{rtLabel}</span>
          <button
            onClick={onRefresh}
            disabled={refetching}
            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 hover:bg-background/60 disabled:opacity-50"
          >
            <RefreshCw className={cn("size-3", refetching && "animate-spin")} />
            تحديث
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {status.state === "expired" && (
            <Button asChild size="sm" className="gap-2">
              <a href="/#pricing">
                <CreditCard className="size-4" /> عرض خطط الاشتراك
              </a>
            </Button>
          )}
          <Button asChild size="sm" variant="outline" className="gap-2">
            <a
              href={`mailto:${supportEmail}?subject=${encodeURIComponent("مساعدة بخصوص حساب: " + email)}`}
            >
              <Mail className="size-4" /> مراسلة الدعم
            </a>
          </Button>
          <Button asChild size="sm" variant="ghost" className="gap-2">
            <a href="/#faq">
              <LifeBuoy className="size-4" /> الأسئلة الشائعة
            </a>
          </Button>
        </div>

        <div className="mt-5 flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <span className="truncate">{email}</span>
          <span className="shrink-0 opacity-70">
            آخر تحديث: {new Date().toLocaleTimeString("ar")}
          </span>
        </div>
      </div>
    </div>
  );
}

function SideLink({
  to,
  icon,
  children,
}: {
  to: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = pathname === to || pathname.startsWith(to + "/");
  return (
    <Link
      to={to}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all",
        active
          ? "bg-gradient-to-r from-primary/15 via-primary/10 to-accent/10 text-foreground shadow-[0_0_0_1px_theme(colors.primary/20)]"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      {active && (
        <motion.span
          layoutId="side-active-indicator"
          className="absolute inset-y-1.5 start-0 w-1 rounded-full bg-gradient-to-b from-primary to-accent"
          transition={{ type: "spring", stiffness: 500, damping: 35 }}
        />
      )}
      <span className={cn("transition-transform group-hover:scale-110", active && "text-primary")}>
        {icon}
      </span>
      {children}
    </Link>
  );
}

function MobileLink({
  to,
  icon,
  children,
}: {
  to: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = pathname === to || pathname.startsWith(to + "/");
  return (
    <Link
      to={to}
      className={cn(
        "relative flex flex-col items-center justify-center gap-1 py-2.5 text-xs transition-colors",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      {active && (
        <motion.span
          layoutId="mobile-active-indicator"
          className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-gradient-to-r from-primary to-accent"
          transition={{ type: "spring", stiffness: 500, damping: 35 }}
        />
      )}
      {icon}
      {children}
    </Link>
  );
}
