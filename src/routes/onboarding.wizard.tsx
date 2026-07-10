import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Building2, Check, Home, Loader2, Network, Sparkles, UserRound } from "lucide-react";
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
import { createProperty } from "@/lib/properties.functions";
import { setOnboardingStep } from "@/lib/onboarding.functions";
import { createOnboardingBranch } from "@/lib/onboarding-branches.functions";
import { savePendingRedirect } from "@/lib/pending-redirect";

export const Route = createFileRoute("/onboarding/wizard")({
  ssr: false,
  head: () => ({
    meta: [{ title: "تفعيل الحساب — Aqari" }, { name: "robots", content: "noindex" }],
  }),
  component: OnboardingWizardPage,
});

type StepKey = "profile" | "company" | "branch" | "property";
const STEPS: {
  key: StepKey;
  label_ar: string;
  label_en: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: "profile", label_ar: "بياناتك", label_en: "You", icon: UserRound },
  { key: "company", label_ar: "الشركة", label_en: "Company", icon: Building2 },
  { key: "branch", label_ar: "الفرع والأقسام", label_en: "Branch & Depts", icon: Network },
  { key: "property", label_ar: "أول عقار", label_en: "First property", icon: Home },
];

const REASONS = [
  "إدارة عقارات وإيجارات",
  "إدارة صيانة ومهام",
  "تنظيم المبيعات والعمولات",
  "تقارير مالية وتحليلات",
  "تجربة النظام قبل الاشتراك",
  "أخرى",
];

const PROP_TYPES: {
  v: "apartment" | "villa" | "office" | "land" | "shop" | "building";
  label: string;
}[] = [
  { v: "apartment", label: "شقة" },
  { v: "villa", label: "فيلا" },
  { v: "office", label: "مكتب" },
  { v: "shop", label: "محل" },
  { v: "building", label: "عمارة" },
  { v: "land", label: "أرض" },
];

function OnboardingWizardPage() {
  const nav = useNavigate();
  const { i18n } = useTranslation();
  const isAr = (i18n.language || "ar").startsWith("ar");
  const { user, ready } = useAuth();
  const register = useServerFn(registerCompany);
  const getCtx = useServerFn(getMyAccessContext);
  const createProp = useServerFn(createProperty);
  const createBranch = useServerFn(createOnboardingBranch);
  const markStep = useServerFn(setOnboardingStep);

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
  const [wsName, setWsName] = useState("");
  const [wsPhone, setWsPhone] = useState("");

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
      // Preserve current location (path + query + hash) so /auth can bounce
      // the visitor back here after sign-in. WebViews sometimes strip the
      // ?redirect= query, so we also persist it in sessionStorage as a
      // backup that survives the OAuth / magic-link round-trip.
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
        if (prof?.signup_reason) setReason(prof.signup_reason);
        if (ctx.company_id) {
          setOrgId(ctx.company_id);
          setStep(2);
        } else if (prof?.full_name && prof?.signup_reason) {
          setStep(1);
        }
      } catch {
        /* ignore, start from step 0 */
      } finally {
        setChecking(false);
      }
    })();
  }, [ready, user, nav, getCtx]);

  const goDashboard = () => nav({ to: "/dashboard", replace: true });

  const submitProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (fullName.trim().length < 2) return toast.error("يرجى إدخال الاسم الكامل");
    if (!reason) return toast.error("يرجى اختيار سبب الاشتراك");
    if (phone && !phoneVerified) return toast.error("يرجى تأكيد رقم الجوال");
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
      if (!wsName) setWsName(""); // no-op prime
      setStep(1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر الحفظ");
    } finally {
      setBusy(false);
    }
  };

  const submitCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (wsName.trim().length < 2) return toast.error("يرجى إدخال اسم مساحة العمل");
    setBusy(true);
    try {
      const res = await register({
        data: { name: wsName.trim(), phone: wsPhone.trim() || undefined },
      });
      setOrgId(res.org_id);
      await markStep({ data: { step: "company", done: true } }).catch(() => {});
      toast.success(`تم إنشاء مساحة العمل — تجربة مجانية ${res.trial_days} يومًا`);
      setStep(2);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر الإنشاء");
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

  const submitBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return toast.error("مساحة العمل غير جاهزة");
    if (brName.trim().length < 2) return toast.error("يرجى إدخال اسم الفرع");
    setBusy(true);
    try {
      const departments = parseDepartments(brDepartments);
      const res = await createBranch({
        data: {
          org_id: orgId,
          name: brName.trim(),
          phone: brPhone.trim() || null,
          address: brAddress.trim() || null,
          departments,
        },
      });
      await markStep({ data: { step: "branch", done: true } }).catch(() => {});
      toast.success(
        res.departments > 0
          ? `تم إنشاء الفرع و${res.departments} قسمًا`
          : "تم إنشاء الفرع",
      );
      setStep(3);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر إنشاء الفرع");
    } finally {
      setBusy(false);
    }
  };

  const skipBranch = () => {
    setStep(3);
  };

  const submitProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return goDashboard();
    if (propTitle.trim().length < 2) return toast.error("يرجى إدخال اسم العقار");
    const priceNum = Number(propPrice || "0");
    if (!Number.isFinite(priceNum) || priceNum < 0) return toast.error("السعر غير صحيح");
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
      await markStep({ data: { step: "first_receipt", done: true } }).catch(() => {});
      toast.success("تم تفعيل حسابك بنجاح!");
      goDashboard();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر إنشاء العقار");
    } finally {
      setBusy(false);
    }
  };

  const skipProperty = async () => {
    setBusy(true);
    try {
      await markStep({ data: { step: "first_receipt", done: true } }).catch(() => {});
      goDashboard();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-[var(--app-height,100vh)] overflow-hidden bg-gradient-to-br from-background via-background to-primary/5">
      <div className="pointer-events-none absolute inset-0 -z-0">
        <div className="absolute -top-40 -start-40 size-[520px] rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -bottom-40 -end-40 size-[520px] rounded-full bg-teal-400/20 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto grid min-h-[var(--app-height,100vh)] w-full max-w-2xl place-items-center px-4 py-10">
        <div className="w-full rounded-3xl border border-border/60 bg-card/70 p-6 shadow-2xl shadow-primary/10 backdrop-blur-xl sm:p-8">
          {/* Stepper */}
          <ol
            className="mb-6 flex items-center justify-between gap-2"
            aria-label={isAr ? "خطوات التفعيل" : "Activation steps"}
          >
            {STEPS.map((s, i) => {
              const done = i < step;
              const active = i === step;
              const Icon = s.icon;
              return (
                <li key={s.key} className="flex flex-1 items-center gap-2">
                  <div
                    className={[
                      "grid size-9 shrink-0 place-items-center rounded-full border transition",
                      done
                        ? "border-primary bg-primary text-primary-foreground"
                        : active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-muted text-muted-foreground",
                    ].join(" ")}
                    aria-current={active ? "step" : undefined}
                  >
                    {done ? <Check className="size-4" /> : <Icon className="size-4" />}
                  </div>
                  <span
                    className={[
                      "text-xs sm:text-sm font-medium truncate",
                      active ? "text-foreground" : "text-muted-foreground",
                    ].join(" ")}
                  >
                    {isAr ? s.label_ar : s.label_en}
                  </span>
                  {i < STEPS.length - 1 && (
                    <div
                      className={["mx-1 h-px flex-1", done ? "bg-primary" : "bg-border"].join(" ")}
                    />
                  )}
                </li>
              );
            })}
          </ol>

          <div className="mb-2 text-xs text-muted-foreground">
            {isAr ? `الخطوة ${step + 1} من ${STEPS.length}` : `Step ${step + 1} of ${STEPS.length}`}
          </div>

          {checking ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> جارٍ التحقّق…
            </div>
          ) : step === 0 ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight">أكمل بياناتك</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    لن تستغرق دقيقة — لتخصيص تجربتك.
                  </p>
                </div>
                <OnboardingAiHelper
                  step="profile"
                  onApply={(f) => {
                    if (f.full_name) setFullName(f.full_name);
                    if (f.phone) setPhone(f.phone);
                    if (f.job_title) setJobTitle(f.job_title);
                    if (f.reason && REASONS.includes(f.reason)) setReason(f.reason);
                  }}
                />
              </div>
              <form onSubmit={submitProfile} className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="fullName">الاسم الكامل *</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    minLength={2}
                    autoFocus
                    placeholder="مثال: حامد الشهري"
                  />
                </div>
                <PhoneVerifyInput
                  value={phone}
                  onChange={setPhone}
                  onVerifiedChange={setPhoneVerified}
                />
                <div className="space-y-1.5">
                  <Label htmlFor="jobTitle">المسمى الوظيفي</Label>
                  <Input
                    id="jobTitle"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder="مثال: مدير عقاري"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>سبب الاشتراك *</Label>
                  <Select value={reason} onValueChange={setReason}>
                    <SelectTrigger>
                      <SelectValue placeholder="اختر سبب استخدامك للنظام" />
                    </SelectTrigger>
                    <SelectContent>
                      {REASONS.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="submit"
                  className="h-11 w-full rounded-xl bg-gradient-to-r from-primary to-teal-500 text-primary-foreground"
                  disabled={busy}
                >
                  {busy && <Loader2 className="me-2 size-4 animate-spin" />} متابعة
                </Button>
              </form>
            </>
          ) : step === 1 ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight">بيانات الشركة</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    سنُنشئ المنظمة تلقائيًا — تجربة 14 يومًا مجانًا.
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
                <div className="space-y-1.5">
                  <Label htmlFor="ws-name">اسم الشركة *</Label>
                  <Input
                    id="ws-name"
                    value={wsName}
                    onChange={(e) => setWsName(e.target.value)}
                    required
                    minLength={2}
                    maxLength={120}
                    autoFocus
                    placeholder="مثال: شركة النور العقارية"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ws-phone">رقم الاتصال (اختياري)</Label>
                  <Input
                    id="ws-phone"
                    type="tel"
                    dir="ltr"
                    value={wsPhone}
                    onChange={(e) => setWsPhone(e.target.value)}
                    placeholder="+9665XXXXXXXX"
                  />
                </div>
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />
                    <span>سيتم ربطك بدور «المالك» وتفعيل الوحدات الأساسية.</span>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Button type="button" variant="ghost" onClick={() => setStep(0)} disabled={busy}>
                    رجوع
                  </Button>
                  <Button
                    type="submit"
                    className="h-11 flex-1 rounded-xl bg-gradient-to-r from-primary to-teal-500 text-primary-foreground"
                    disabled={busy}
                  >
                    {busy && <Loader2 className="me-2 size-4 animate-spin" />} إنشاء ومتابعة
                  </Button>
                </div>
              </form>
            </>
          ) : step === 2 ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight">
                    الفرع والأقسام (اختياري)
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    أضف فرعك الرئيسي وأقسامه الأساسية — يمكنك إضافة المزيد لاحقًا من الإعدادات.
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
                  <Label htmlFor="br-name">اسم الفرع *</Label>
                  <Input
                    id="br-name"
                    value={brName}
                    onChange={(e) => setBrName(e.target.value)}
                    minLength={2}
                    maxLength={120}
                    autoFocus
                    placeholder="مثال: الفرع الرئيسي — الرياض"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="br-phone">هاتف الفرع</Label>
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
                    <Label htmlFor="br-address">العنوان</Label>
                    <Input
                      id="br-address"
                      value={brAddress}
                      onChange={(e) => setBrAddress(e.target.value)}
                      maxLength={240}
                      placeholder="حي، شارع، مدينة"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="br-depts">
                    الأقسام <span className="text-muted-foreground">(افصل بينها بفاصلة)</span>
                  </Label>
                  <Input
                    id="br-depts"
                    value={brDepartments}
                    onChange={(e) => setBrDepartments(e.target.value)}
                    placeholder="المبيعات، الإيجارات، الصيانة، المحاسبة"
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Button type="button" variant="ghost" onClick={skipBranch} disabled={busy}>
                    تخطّي
                  </Button>
                  <Button
                    type="submit"
                    className="h-11 flex-1 rounded-xl bg-gradient-to-r from-primary to-teal-500 text-primary-foreground"
                    disabled={busy}
                  >
                    {busy && <Loader2 className="me-2 size-4 animate-spin" />} حفظ ومتابعة
                  </Button>
                </div>
              </form>
            </>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight">
                    أضف أول عقار (اختياري)
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    ابدأ فورًا بأحد عقاراتك، أو تخطَّ هذه الخطوة وأضفه لاحقًا.
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
                  <Label htmlFor="p-title">اسم العقار *</Label>
                  <Input
                    id="p-title"
                    value={propTitle}
                    onChange={(e) => setPropTitle(e.target.value)}
                    minLength={2}
                    maxLength={140}
                    autoFocus
                    placeholder="مثال: شقة رقم 12 — حي النرجس"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>النوع</Label>
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
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="p-city">المدينة</Label>
                    <Input
                      id="p-city"
                      value={propCity}
                      onChange={(e) => setPropCity(e.target.value)}
                      maxLength={80}
                      placeholder="الرياض"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p-price">السعر الشهري / السنوي (ر.س)</Label>
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
                <div className="flex items-center justify-between gap-3">
                  <Button type="button" variant="ghost" onClick={skipProperty} disabled={busy}>
                    تخطّي والذهاب للوحة التحكم
                  </Button>
                  <Button
                    type="submit"
                    className="h-11 flex-1 rounded-xl bg-gradient-to-r from-primary to-teal-500 text-primary-foreground"
                    disabled={busy}
                  >
                    {busy && <Loader2 className="me-2 size-4 animate-spin" />} إنشاء وبدء العمل
                  </Button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
