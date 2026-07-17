import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { useTranslation } from "react-i18next";
import { t } from "@/lib/i18n";
import { toast } from "sonner";
import {
  Building2,
  Check,
  FileImage,
  Home,
  ListChecks,
  Loader2,
  Network,
  Sparkles,
  UserRound,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PhoneVerifyInput } from "@/components/PhoneVerifyInput";
import { OnboardingAiHelper } from "@/components/onboarding/OnboardingAiHelper";
import { registerCompany, getMyAccessContext } from "@/lib/company.functions";
import { describeCompanyCreateError } from "@/lib/company-errors";
import { createProperty } from "@/lib/properties.functions";
import { setOnboardingStep } from "@/lib/onboarding.functions";
import { createOnboardingBranch } from "@/lib/onboarding-branches.functions";
import { savePendingRedirect } from "@/lib/pending-redirect";

const STEP_KEYS = ["profile", "company", "branch", "property"] as const;
type StepQuery = (typeof STEP_KEYS)[number];

export const Route = createFileRoute("/onboarding/wizard")({
  ssr: false,
  validateSearch: (raw: Record<string, unknown>): { step?: StepQuery } => {
    const s = raw.step;
    return typeof s === "string" && (STEP_KEYS as readonly string[]).includes(s)
      ? { step: s as StepQuery }
      : {};
  },
  head: () => ({
    meta: [
      { title: t("onboardingWizard.meta.title") },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OnboardingWizardPage,
});

type StepKey = "profile" | "company" | "branch" | "property";
type AccountType = "individual" | "business";
type Phase1OrgRow = {
  account_type?: AccountType | null;
  tax_number?: string | null;
  commercial_registration?: string | null;
  national_address?: string | null;
  authorized_person_name?: string | null;
  authorized_person_phone?: string | null;
};
type Phase1OrganizationsClient = {
  from(table: "organizations"): {
    select(columns: string): {
      eq(
        column: "id",
        value: string,
      ): {
        maybeSingle(): Promise<{ data: Phase1OrgRow | null; error: unknown }>;
      };
    };
    update(values: { logo_path: string; logo_url: string }): {
      eq(column: "id", value: string): Promise<{ error: { message: string } | null }>;
    };
  };
};
const STEPS: {
  key: StepKey;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: "profile", icon: UserRound },
  { key: "company", icon: Building2 },
  { key: "branch", icon: Network },
  { key: "property", icon: Home },
];

const REASON_KEYS = [
  "manage_rentals",
  "maintenance",
  "sales",
  "reports",
  "trial",
  "other",
] as const;

const PROP_TYPES: {
  v: "apartment" | "villa" | "office" | "land" | "shop" | "building";
}[] = [
  { v: "apartment" },
  { v: "villa" },
  { v: "office" },
  { v: "shop" },
  { v: "building" },
  { v: "land" },
];

const TRUST_KEYS = ["free", "quick", "editable"] as const;

function OnboardingWizardPage() {
  const nav = useNavigate();
  const search = Route.useSearch();
  useTranslation(); // subscribe to language changes so t() re-renders
  const { user, ready } = useAuth();
  const register = useServerFn(registerCompany);
  const getCtx = useServerFn(getMyAccessContext);
  const createProp = useServerFn(createProperty);
  const createBranch = useServerFn(createOnboardingBranch);
  const markStep = useServerFn(setOnboardingStep);
  const queryClient = useQueryClient();

  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [checking, setChecking] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Step 0: profile
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [jobTitle, setJobTitle] = useState("");
  const [reason, setReason] = useState("");

  // Step 1: company
  const [accountType, setAccountType] = useState<AccountType>("business");
  const [wsName, setWsName] = useState("");
  const [wsPhone, setWsPhone] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [commercialRegistration, setCommercialRegistration] = useState("");
  const [nationalAddress, setNationalAddress] = useState("");
  const [authorizedPersonName, setAuthorizedPersonName] = useState("");
  const [authorizedPersonPhone, setAuthorizedPersonPhone] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);

  // Step 2: branch + departments (optional)
  const [brName, setBrName] = useState("");
  const [brPhone, setBrPhone] = useState("");
  const [brAddress, setBrAddress] = useState("");
  const [brDepartments, setBrDepartments] = useState<string>("");

  // Step 3: property (all optional)
  const [propTitle, setPropTitle] = useState("");
  const [propType, setPropType] = useState<(typeof PROP_TYPES)[number]["v"]>("apartment");
  const [propCity, setPropCity] = useState("");
  const [propPrice, setPropPrice] = useState("");

  // Bootstrap: hydrate saved profile, jump to correct step.
  useEffect(() => {
    if (!ready) return;
    if (!user) {
      const loc =
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}${window.location.hash}`
          : "/onboarding/wizard";
      savePendingRedirect(loc);
      nav({ to: "/auth", search: { redirect: loc }, replace: true });
      return;
    }
    (async () => {
      try {
        const [{ data: prof }, ctx] = await Promise.all([
          supabase
            .from("profiles")
            .select("full_name, phone, job_title, signup_reason")
            .eq("id", user.id)
            .maybeSingle(),
          getCtx(),
        ]);
        if (prof?.full_name) setFullName(prof.full_name);
        if (prof?.phone) {
          setPhone(prof.phone);
          setPhoneVerified(true);
        }
        if (prof?.job_title) setJobTitle(prof.job_title);
        if (prof?.signup_reason) {
          // Legacy DB rows may store the Arabic label; map back to the key.
          const legacyMap: Record<string, (typeof REASON_KEYS)[number]> = {
            "إدارة عقارات وإيجارات": "manage_rentals",
            "إدارة صيانة ومهام": "maintenance",
            "تنظيم المبيعات والعمولات": "sales",
            "تقارير مالية وتحليلات": "reports",
            "تجربة النظام قبل الاشتراك": "trial",
            "أخرى": "other",
          };
          const matched =
            (REASON_KEYS as readonly string[]).includes(prof.signup_reason)
              ? prof.signup_reason
              : legacyMap[prof.signup_reason];
          if (matched) setReason(matched);
        }
        if (ctx.company_id) {
          setOrgId(ctx.company_id);
          const { data: comp } = await supabase
            .from("companies")
            .select("name, phone")
            .eq("id", ctx.company_id)
            .maybeSingle();
          const phase1Client = supabase as unknown as Phase1OrganizationsClient;
          const { data: org } = await phase1Client
            .from("organizations")
            .select(
              "account_type, tax_number, commercial_registration, national_address, authorized_person_name, authorized_person_phone",
            )
            .eq("id", ctx.company_id)
            .maybeSingle();
          if (comp?.name) setWsName(comp.name);
          if (comp?.phone) setWsPhone(comp.phone);
          if (org?.account_type) setAccountType(org.account_type);
          if (org?.tax_number) setTaxNumber(org.tax_number);
          if (org?.commercial_registration) setCommercialRegistration(org.commercial_registration);
          if (org?.national_address) setNationalAddress(org.national_address);
          if (org?.authorized_person_name) setAuthorizedPersonName(org.authorized_person_name);
          if (org?.authorized_person_phone) setAuthorizedPersonPhone(org.authorized_person_phone);
          setStep(2);
        } else if (prof?.full_name && prof?.signup_reason) {
          setStep(1);
        }
        const requested = search.step;
        if (requested) {
          const idx = STEP_KEYS.indexOf(requested);
          if (idx >= 0) setStep(idx as 0 | 1 | 2 | 3);
        }
      } catch (err) {
        toast.error(t("onboardingWizard.toasts.loadFailed"), {
          description: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setChecking(false);
      }
    })();
  }, [ready, user, nav, getCtx, search.step]);

  const goDashboard = () => nav({ to: "/dashboard", replace: true });

  const submitProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (fullName.trim().length < 2) return toast.error(t("onboardingWizard.toasts.fullNameRequired"));
    if (!reason) return toast.error(t("onboardingWizard.toasts.reasonRequired"));
    if (phone && !phoneVerified) return toast.error(t("onboardingWizard.toasts.verifyPhone"));
    setBusy(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          job_title: jobTitle.trim() || null,
          signup_reason: reason,
        })
        .eq("id", user.id);
      if (error) throw error;
      await markStep({ data: { step: "profile", done: true } }).catch(() => {});
      if (!wsName) setWsName("");
      setStep(1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("onboardingWizard.toasts.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const submitCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    const isBusiness = accountType === "business";
    if (wsName.trim().length < 2) {
      return toast.error(
        isBusiness
          ? t("onboardingWizard.toasts.nameRequiredBusiness")
          : t("onboardingWizard.toasts.nameRequiredIndividual"),
      );
    }
    if (isBusiness && taxNumber.trim() && !/^\d{15}$/.test(taxNumber.trim())) {
      return toast.error(t("onboardingWizard.toasts.taxInvalid"));
    }
    setBusy(true);
    try {
      const res = await register({
        data: {
          accountType,
          name: wsName.trim(),
          phone: wsPhone.trim() || undefined,
          taxNumber: taxNumber.trim() || undefined,
          commercialRegistration: commercialRegistration.trim() || undefined,
          nationalAddress: nationalAddress.trim() || undefined,
          authorizedPersonName: authorizedPersonName.trim() || undefined,
          authorizedPersonPhone: authorizedPersonPhone.trim() || undefined,
        },
      });
      setOrgId(res.org_id);
      if (logoFile) {
        const extension = logoFile.name.split(".").pop() || "png";
        const logoPath = `${res.org_id}/logo.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("account-logos")
          .upload(logoPath, logoFile, { upsert: true });
        if (uploadError) throw uploadError;
        const phase1Client = supabase as unknown as Phase1OrganizationsClient;
        const { error: logoUpdateError } = await phase1Client
          .from("organizations")
          .update({ logo_path: logoPath, logo_url: logoPath })
          .eq("id", res.org_id);
        if (logoUpdateError) throw logoUpdateError;
      }
      await markStep({ data: { step: "company", done: true } }).catch(() => {});
      toast.success(t("onboardingWizard.toasts.accountCreated", { days: res.trial_days }));
      setStep(2);
    } catch (err) {
      const hint = describeCompanyCreateError(err);
      toast.error(hint.title, { description: hint.description });
    } finally {
      setBusy(false);
    }
  };

  const parseDepartments = (raw: string): string[] =>
    Array.from(
      new Set(
        raw
          .split(/[،,\n]/g)
          .map((s) => s.trim())
          .filter((s) => s.length > 0 && s.length <= 80),
      ),
    ).slice(0, 20);

  const SAUDI_PHONE_RE = /^(?:\+?966|0)?5\d{8}$/;
  const normalizePhone = (raw: string): string | null => {
    const d = raw.replace(/[\s-]/g, "");
    if (!d) return null;
    if (!SAUDI_PHONE_RE.test(d)) return "invalid";
    const digits = d.replace(/^\+?966/, "").replace(/^0/, "");
    return `+966${digits}`;
  };

  const submitBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return toast.error(t("onboardingWizard.toasts.orgNotReady"));

    const name = brName.trim();
    if (name.length < 2) return toast.error(t("onboardingWizard.toasts.branchNameShort"));
    if (name.length > 120) return toast.error(t("onboardingWizard.toasts.branchNameLong"));

    let phone: string | null = null;
    if (brPhone.trim()) {
      const p = normalizePhone(brPhone);
      if (p === "invalid") return toast.error(t("onboardingWizard.toasts.phoneInvalid"));
      phone = p;
    }

    const address = brAddress.trim();
    if (address.length > 240) return toast.error(t("onboardingWizard.toasts.addressLong"));

    const departments = parseDepartments(brDepartments);
    const rawCount = brDepartments
      .split(/[،,\n]/g)
      .map((s) => s.trim())
      .filter(Boolean).length;
    if (rawCount > 20) return toast.error(t("onboardingWizard.toasts.deptsMax"));
    const tooLong = brDepartments
      .split(/[،,\n]/g)
      .map((s) => s.trim())
      .find((s) => s.length > 80);
    if (tooLong)
      return toast.error(
        t("onboardingWizard.toasts.deptTooLong", { name: tooLong.slice(0, 20) }),
      );

    setBusy(true);
    try {
      const res = await createBranch({
        data: {
          org_id: orgId,
          name,
          phone,
          address: address || null,
          departments,
        },
      });
      await markStep({ data: { step: "branch", done: true } }).catch(() => {});
      toast.success(
        res.departments > 0
          ? t("onboardingWizard.toasts.branchSavedWithDepts", { count: res.departments })
          : t("onboardingWizard.toasts.branchSaved"),
      );
      setStep(3);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("onboardingWizard.toasts.branchSaveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const skipBranch = () => {
    setStep(3);
  };

  const submitProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) {
      toast.error(t("onboardingWizard.toasts.workspaceMissing"), {
        description: t("onboardingWizard.toasts.workspaceMissingDesc"),
      });
      setStep(1);
      return;
    }
    if (propTitle.trim().length < 2) {
      return toast.error(t("onboardingWizard.toasts.propertyNameRequired"));
    }
    const priceNum = Number(propPrice || "0");
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      return toast.error(t("onboardingWizard.toasts.priceInvalid"));
    }
    setBusy(true);
    try {
      await createProp({
        data: {
          org_id: orgId,
          title_ar: propTitle.trim(),
          title_en: propTitle.trim(),
          property_type: propType,
          listing_type: "rent",
          status: "available",
          price: priceNum,
          currency: "SAR",
          city: propCity.trim() || null,
        },
      });
      await markStep({ data: { step: "first_receipt", done: true } });
      await queryClient.invalidateQueries({ queryKey: ["dashboard-onboarding-state"] });
      await queryClient.invalidateQueries({ queryKey: ["my-access-context"] });
      toast.success(t("onboardingWizard.toasts.activated"));
      setBusy(false);
      setTimeout(() => goDashboard(), 50);
      return;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("onboardingWizard.toasts.propertyFailed"), {
        description: t("onboardingWizard.toasts.propertyFailedDesc"),
      });
    } finally {
      setBusy(false);
    }
  };

  const skipProperty = async () => {
    setBusy(true);
    try {
      await markStep({ data: { step: "first_receipt", done: true } });
      await queryClient.invalidateQueries({ queryKey: ["dashboard-onboarding-state"] });
      await queryClient.invalidateQueries({ queryKey: ["my-access-context"] });
      setBusy(false);
      setTimeout(() => goDashboard(), 50);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("onboardingWizard.toasts.completeFailed"), {
        description: t("onboardingWizard.toasts.completeFailedDesc"),
      });
      setBusy(false);
    }
  };

  return (
    <div className="studio-shell studio-grid relative min-h-[var(--app-height,100vh)] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-0">
        <div className="absolute -top-48 -start-40 size-[560px] rounded-full bg-[#C5A059]/20 blur-3xl" />
        <div className="absolute -bottom-48 -end-40 size-[560px] rounded-full bg-[#0d7a5f]/20 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto grid min-h-[var(--app-height,100vh)] w-full max-w-6xl items-center gap-6 px-4 py-8 lg:grid-cols-[0.85fr_1.15fr] lg:px-6">
        <aside className="hidden lg:block">
          <div className="studio-panel-dark studio-noise p-8">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#C5A059]/35 bg-[#C5A059]/10 px-4 py-2 text-sm font-bold text-[#E8D9A6]">
              <Sparkles className="size-4" />
              {t("onboardingWizard.brandActivation")}
            </div>
            <h1 className="text-4xl font-black leading-tight text-white">
              {t("onboardingWizard.heroTitle")}
            </h1>
            <p className="mt-4 text-sm leading-7 text-[#c9ddd4]">
              {t("onboardingWizard.heroDescription")}
            </p>
            <div className="mt-8 space-y-3">
              {TRUST_KEYS.map((k) => (
                <div
                  key={k}
                  className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.05] p-4 text-sm text-[#E8D9A6]"
                >
                  <Check className="mt-0.5 size-4 shrink-0 text-[#C5A059]" />
                  <span>{t(`onboardingWizard.trust.${k}`)}</span>
                </div>
              ))}
            </div>
            <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-bold text-[#E8D9A6]">
                <Sparkles className="size-4 text-[#C5A059]" />
                {t("onboardingWizard.hamidTitle")}
              </div>
              <p className="text-xs leading-6 text-[#c9ddd4]">
                {t("onboardingWizard.hamidDescription")}
              </p>
            </div>
          </div>
        </aside>

        <div className="studio-card-lg w-full p-5 backdrop-blur-xl sm:p-7">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="template-pill mb-3">
                <Sparkles className="size-3.5" />
                {t("onboardingWizard.header.pill")}
              </div>
              <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">
                {t("onboardingWizard.header.title")}
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                {t("onboardingWizard.header.subtitle")}
              </p>
            </div>
            <Button asChild variant="ghost" size="sm" className="h-8 gap-1 text-xs">
              <Link to="/onboarding/summary">
                <ListChecks className="size-3.5" />
                {t("onboardingWizard.header.summary")}
              </Link>
            </Button>
          </div>

          <div className="mb-6 grid gap-2 sm:grid-cols-4">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const active = i === step;
              const done = i < step;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => {
                    if (i <= step) setStep(i as 0 | 1 | 2 | 3);
                  }}
                  className={[
                    "rounded-2xl border p-3 text-start transition",
                    active
                      ? "border-primary bg-primary/10 text-foreground shadow-sm"
                      : done
                        ? "border-[#C5A059]/35 bg-[#C5A059]/10 text-foreground"
                        : "border-border bg-muted/30 text-muted-foreground",
                  ].join(" ")}
                  aria-current={active ? "step" : undefined}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="grid size-8 place-items-center rounded-xl bg-background/70">
                      {done ? (
                        <Check className="size-4 text-primary" />
                      ) : (
                        <Icon className="size-4" />
                      )}
                    </span>
                    <span className="text-[11px] font-bold tabular-nums">
                      {t("onboardingWizard.progress.counter", { step: i + 1, total: STEPS.length })}
                    </span>
                  </div>
                  <div className="text-sm font-bold">{t(`onboardingWizard.steps.${s.key}`)}</div>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-5 opacity-75">
                    {t(`onboardingWizard.hints.${s.key}`)}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Dynamic progress bar */}
          {(() => {
            const pct = Math.round(((step + 1) / STEPS.length) * 100);
            return (
              <div className="mb-3">
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={t("onboardingWizard.progress.aria")}
                >
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary to-teal-500 transition-[width] duration-500 ease-out"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {t("onboardingWizard.progress.stepOf", {
                      step: step + 1,
                      total: STEPS.length,
                    })}
                  </span>
                  <span className="tabular-nums">{pct}%</span>
                </div>
              </div>
            );
          })()}

          {checking ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> {t("onboardingWizard.progress.checking")}
            </div>
          ) : step === 0 ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black tracking-tight">
                    {t("onboardingWizard.profile.heading")}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("onboardingWizard.profile.subheading")}
                  </p>
                </div>
                <OnboardingAiHelper
                  step="profile"
                  onApply={(f) => {
                    if (f.full_name) setFullName(f.full_name);
                    if (f.phone) setPhone(f.phone);
                    if (f.job_title) setJobTitle(f.job_title);
                    if (f.reason) {
                      // AI may return a key or a localized label; accept either
                      const matched = REASON_KEYS.find(
                        (k) =>
                          k === f.reason ||
                          t(`onboardingWizard.reasons.${k}`) === f.reason,
                      );
                      if (matched) setReason(matched);
                    }
                  }}
                />
              </div>
              <form onSubmit={submitProfile} className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="fullName">{t("onboardingWizard.profile.fullName")}</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    minLength={2}
                    autoFocus
                    placeholder={t("onboardingWizard.profile.fullNamePlaceholder")}
                  />
                </div>
                <PhoneVerifyInput
                  value={phone}
                  onChange={setPhone}
                  onVerifiedChange={setPhoneVerified}
                />
                <div className="space-y-1.5">
                  <Label htmlFor="jobTitle">{t("onboardingWizard.profile.jobTitle")}</Label>
                  <Input
                    id="jobTitle"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder={t("onboardingWizard.profile.jobTitlePlaceholder")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("onboardingWizard.profile.reason")}</Label>
                  <Select value={reason} onValueChange={setReason}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("onboardingWizard.profile.reasonPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {REASON_KEYS.map((k) => (
                        <SelectItem key={k} value={k}>
                          {t(`onboardingWizard.reasons.${k}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="h-11 w-full studio-button" disabled={busy}>
                  {busy && <Loader2 className="me-2 size-4 animate-spin" />}{" "}
                  {t("onboardingWizard.profile.continue")}
                </Button>
              </form>
            </>
          ) : step === 1 ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black tracking-tight">
                    {t("onboardingWizard.company.heading")}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("onboardingWizard.company.subheading")}
                  </p>
                </div>
                <OnboardingAiHelper
                  step="company"
                  onApply={(f) => {
                    if (f.name) setWsName(f.name);
                    if (f.phone) setWsPhone(f.phone);
                  }}
                />
              </div>
              <form onSubmit={submitCompany} className="mt-6 space-y-4">
                <div
                  className="grid gap-3 sm:grid-cols-2"
                  role="radiogroup"
                  aria-label={t("onboardingWizard.company.accountTypeAria")}
                >
                  <button
                    type="button"
                    onClick={() => setAccountType("individual")}
                    className={[
                      "rounded-2xl border p-4 text-start transition",
                      accountType === "individual"
                        ? "border-primary bg-primary/10 shadow-sm"
                        : "border-border bg-muted/20",
                    ].join(" ")}
                  >
                    <UserRound className="mb-3 size-5 text-primary" />
                    <div className="font-black">{t("onboardingWizard.company.individual")}</div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {t("onboardingWizard.company.individualDesc")}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccountType("business")}
                    className={[
                      "rounded-2xl border p-4 text-start transition",
                      accountType === "business"
                        ? "border-primary bg-primary/10 shadow-sm"
                        : "border-border bg-muted/20",
                    ].join(" ")}
                  >
                    <Building2 className="mb-3 size-5 text-primary" />
                    <div className="font-black">{t("onboardingWizard.company.business")}</div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {t("onboardingWizard.company.businessDesc")}
                    </p>
                  </button>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ws-name">
                    {accountType === "business"
                      ? t("onboardingWizard.company.nameBusiness")
                      : t("onboardingWizard.company.nameIndividual")}
                  </Label>
                  <Input
                    id="ws-name"
                    value={wsName}
                    onChange={(e) => setWsName(e.target.value)}
                    required
                    minLength={2}
                    maxLength={120}
                    autoFocus
                    placeholder={
                      accountType === "business"
                        ? t("onboardingWizard.company.namePlaceholderBusiness")
                        : t("onboardingWizard.company.namePlaceholderIndividual")
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ws-phone">{t("onboardingWizard.company.phone")}</Label>
                  <Input
                    id="ws-phone"
                    type="tel"
                    dir="ltr"
                    value={wsPhone}
                    onChange={(e) => setWsPhone(e.target.value)}
                    placeholder="+9665XXXXXXXX"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tax-number">
                    {t("onboardingWizard.company.taxNumber")}{" "}
                    {accountType === "individual"
                      ? t("onboardingWizard.company.taxOptional")
                      : t("onboardingWizard.company.taxOptionalPhase1")}
                  </Label>
                  <Input
                    id="tax-number"
                    inputMode="numeric"
                    dir="ltr"
                    value={taxNumber}
                    onChange={(e) => setTaxNumber(e.target.value.replace(/\D/g, "").slice(0, 15))}
                    placeholder={t("onboardingWizard.company.taxPlaceholder")}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("onboardingWizard.company.taxHint")}
                  </p>
                </div>

                {accountType === "business" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="commercial-registration">
                        {t("onboardingWizard.company.commercialRegistration")}
                      </Label>
                      <Input
                        id="commercial-registration"
                        value={commercialRegistration}
                        onChange={(e) => setCommercialRegistration(e.target.value)}
                        placeholder={t("onboardingWizard.company.commercialRegistrationPlaceholder")}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="authorized-person-phone">
                        {t("onboardingWizard.company.authorizedPhone")}
                      </Label>
                      <Input
                        id="authorized-person-phone"
                        type="tel"
                        dir="ltr"
                        value={authorizedPersonPhone}
                        onChange={(e) => setAuthorizedPersonPhone(e.target.value)}
                        placeholder="+9665XXXXXXXX"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="authorized-person-name">
                        {t("onboardingWizard.company.authorizedName")}
                      </Label>
                      <Input
                        id="authorized-person-name"
                        value={authorizedPersonName}
                        onChange={(e) => setAuthorizedPersonName(e.target.value)}
                        placeholder={t("onboardingWizard.company.authorizedNamePlaceholder")}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="national-address">
                        {t("onboardingWizard.company.nationalAddress")}
                      </Label>
                      <Input
                        id="national-address"
                        value={nationalAddress}
                        onChange={(e) => setNationalAddress(e.target.value)}
                        placeholder={t("onboardingWizard.company.nationalAddressPlaceholder")}
                      />
                    </div>
                  </div>
                )}

                <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-4">
                  <Label htmlFor="account-logo" className="flex items-center gap-2">
                    <FileImage className="size-4 text-primary" />
                    {accountType === "business"
                      ? t("onboardingWizard.company.logoBusiness")
                      : t("onboardingWizard.company.logoIndividual")}
                  </Label>
                  <Input
                    id="account-logo"
                    className="mt-3"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                  />
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {t("onboardingWizard.company.logoHint")}
                  </p>
                </div>
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />
                    <span>{t("onboardingWizard.company.ownerNote")}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Button type="button" variant="ghost" onClick={() => setStep(0)} disabled={busy}>
                    {t("onboardingWizard.company.back")}
                  </Button>
                  <Button type="submit" className="h-11 flex-1 studio-button" disabled={busy}>
                    {busy && <Loader2 className="me-2 size-4 animate-spin" />}{" "}
                    {t("onboardingWizard.company.createAndContinue")}
                  </Button>
                </div>
              </form>
            </>
          ) : step === 2 ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black tracking-tight">
                    {t("onboardingWizard.branch.heading")}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("onboardingWizard.branch.subheading")}
                  </p>
                </div>
                <OnboardingAiHelper
                  step="branch"
                  onApply={(f) => {
                    if (f.name) setBrName(f.name);
                    if (f.phone) setBrPhone(f.phone);
                    if (f.address) setBrAddress(f.address);
                    if (Array.isArray(f.departments) && f.departments.length)
                      setBrDepartments(f.departments.join("، "));
                  }}
                />
              </div>
              <form onSubmit={submitBranch} className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="br-name">{t("onboardingWizard.branch.name")}</Label>
                  <Input
                    id="br-name"
                    value={brName}
                    onChange={(e) => setBrName(e.target.value)}
                    minLength={2}
                    maxLength={120}
                    autoFocus
                    placeholder={t("onboardingWizard.branch.namePlaceholder")}
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="br-phone">{t("onboardingWizard.branch.phone")}</Label>
                    <Input
                      id="br-phone"
                      type="tel"
                      dir="ltr"
                      value={brPhone}
                      onChange={(e) => setBrPhone(e.target.value)}
                      placeholder="+9665XXXXXXXX"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="br-address">{t("onboardingWizard.branch.address")}</Label>
                    <Input
                      id="br-address"
                      value={brAddress}
                      onChange={(e) => setBrAddress(e.target.value)}
                      maxLength={240}
                      placeholder={t("onboardingWizard.branch.addressPlaceholder")}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="br-depts">
                    {t("onboardingWizard.branch.departments")}{" "}
                    <span className="text-muted-foreground">
                      {t("onboardingWizard.branch.departmentsHint")}
                    </span>
                  </Label>
                  <Input
                    id="br-depts"
                    value={brDepartments}
                    onChange={(e) => setBrDepartments(e.target.value)}
                    placeholder={t("onboardingWizard.branch.departmentsPlaceholder")}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Button type="button" variant="ghost" onClick={() => setStep(1)} disabled={busy}>
                    {t("onboardingWizard.branch.back")}
                  </Button>
                  <div className="flex flex-1 items-center justify-end gap-2">
                    <Button type="button" variant="outline" onClick={skipBranch} disabled={busy}>
                      {t("onboardingWizard.branch.skip")}
                    </Button>
                    <Button type="submit" className="h-11 flex-1 studio-button" disabled={busy}>
                      {busy && <Loader2 className="me-2 size-4 animate-spin" />}{" "}
                      {t("onboardingWizard.branch.saveAndContinue")}
                    </Button>
                  </div>
                </div>
              </form>
            </>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black tracking-tight">
                    {t("onboardingWizard.property.heading")}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("onboardingWizard.property.subheading")}
                  </p>
                </div>
                <OnboardingAiHelper
                  step="property"
                  onApply={(f) => {
                    if (f.title) setPropTitle(f.title);
                    if (f.property_type) setPropType(f.property_type);
                    if (f.city) setPropCity(f.city);
                    if (typeof f.price === "number") setPropPrice(String(f.price));
                  }}
                />
              </div>
              <form onSubmit={submitProperty} className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="p-title">{t("onboardingWizard.property.title")}</Label>
                  <Input
                    id="p-title"
                    value={propTitle}
                    onChange={(e) => setPropTitle(e.target.value)}
                    minLength={2}
                    maxLength={140}
                    autoFocus
                    placeholder={t("onboardingWizard.property.titlePlaceholder")}
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>{t("onboardingWizard.property.type")}</Label>
                    <Select
                      value={propType}
                      onValueChange={(v) => setPropType(v as typeof propType)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PROP_TYPES.map((p) => (
                          <SelectItem key={p.v} value={p.v}>
                            {t(`onboardingWizard.propertyTypes.${p.v}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="p-city">{t("onboardingWizard.property.city")}</Label>
                    <Input
                      id="p-city"
                      value={propCity}
                      onChange={(e) => setPropCity(e.target.value)}
                      maxLength={80}
                      placeholder={t("onboardingWizard.property.cityPlaceholder")}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p-price">{t("onboardingWizard.property.price")}</Label>
                  <Input
                    id="p-price"
                    type="number"
                    min={0}
                    step="1"
                    value={propPrice}
                    onChange={(e) => setPropPrice(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Button type="button" variant="ghost" onClick={() => setStep(2)} disabled={busy}>
                    {t("onboardingWizard.property.back")}
                  </Button>
                  <div className="flex flex-1 items-center justify-end gap-2">
                    <Button type="button" variant="outline" onClick={skipProperty} disabled={busy}>
                      {t("onboardingWizard.property.skip")}
                    </Button>
                    <Button type="submit" className="h-11 flex-1 studio-button" disabled={busy}>
                      {busy && <Loader2 className="me-2 size-4 animate-spin" />}{" "}
                      {t("onboardingWizard.property.createAndStart")}
                    </Button>
                  </div>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
