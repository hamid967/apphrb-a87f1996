import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useDeferredValue, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExternalLink, Search, Shield, Globe, Lock, Zap } from "lucide-react";

/**
 * /admin/route-map — internal audit page that lists every route the TanStack
 * router knows about, classified by access scope. Complements
 * `tests/routes-link-integrity.test.ts` (which fails CI when a `to="..."`
 * literal points to nothing) by giving a human view of every URL the app
 * actually serves, so missing tiles like `/admin/seed` are trivial to spot.
 */
export const Route = createFileRoute("/_authenticated/admin/route-map")({
  component: RouteMapPage,
});

type Scope = "public" | "authenticated" | "admin" | "api";

type RouteRow = {
  path: string;
  scope: Scope;
  dynamic: boolean;
  segments: number;
  descriptionAr: string;
  descriptionEn: string;
  usageAr: string;
  usageEn: string;
  authAr: string;
  authEn: string;
};

function classify(path: string): Scope {
  if (path.startsWith("/api/")) return "api";
  return "public";
}

/** Top-level section descriptions used when a specific path isn't in PATH_META. */
const SECTION_META: Record<
  string,
  { ar: string; en: string; useAr: string; useEn: string }
> = {
  admin: {
    ar: "لوحة الإدارة العليا للنظام (سوبر أدمن).",
    en: "Super-admin control panel for the whole platform.",
    useAr: "لإدارة الشركات، الاشتراكات، المزودين والإعدادات العامة.",
    useEn: "Manage tenants, subscriptions, providers, and global settings.",
  },
  dashboard: {
    ar: "لوحة تحكم الشركة والمستأجرين والعمليات اليومية.",
    en: "Tenant workspace for daily operations.",
    useAr: "متابعة العقارات، العقود، المدفوعات، والمهام التشغيلية.",
    useEn: "Track properties, contracts, payments, and operations.",
  },
  accounting: {
    ar: "الوحدة المحاسبية للشركة (مصروفات، ضريبة، أرباح).",
    en: "Company accounting module (expenses, VAT, P&L).",
    useAr: "تسجيل ومراجعة الحركات المالية وإصدار التقارير.",
    useEn: "Record and review financials; export reports.",
  },
  assistant: {
    ar: "المساعد الذكي بالذكاء الاصطناعي.",
    en: "In-app AI assistant.",
    useAr: "طرح أسئلة على البيانات وتنفيذ سكربتات محدودة الصلاحية.",
    useEn: "Ask questions on your data and run scoped scripts.",
  },
  listings: {
    ar: "إعلانات العقارات العامة.",
    en: "Public property listings.",
    useAr: "تصفح الإعلانات وتقديم الطلبات من غير تسجيل.",
    useEn: "Browse listings and submit applications without login.",
  },
  auctions: {
    ar: "المزادات العقارية.",
    en: "Real-estate auctions.",
    useAr: "عرض المزادات النشطة وتفاصيلها.",
    useEn: "Public list of active auctions with details.",
  },
  contracts: { ar: "عرض عقد محدد.", en: "View a specific contract.", useAr: "فتح تفاصيل العقد عبر الرابط المباشر.", useEn: "Deep link to a contract detail page." },
  onboarding: { ar: "خطوات تهيئة الحساب والشركة.", en: "Account/company onboarding.", useAr: "استكمال بيانات المستخدم الجديد قبل الدخول للوحة.", useEn: "New-user setup before entering the dashboard." },
  security: { ar: "إعدادات الأمان والجلسات و2FA.", en: "Security, sessions & 2FA.", useAr: "تفعيل التحقق الثنائي ومراجعة الأجهزة النشطة.", useEn: "Enable 2FA and review active devices." },
  billing: { ar: "الفواتير والاشتراك للشركة.", en: "Company billing & subscription.", useAr: "مراجعة الفواتير ورفع إثبات التحويل البنكي.", useEn: "Review invoices and upload bank-transfer receipts." },
  reports: { ar: "التقارير التشغيلية والمالية.", en: "Operational & financial reports.", useAr: "توليد تقارير مطبوعة أو مصدَّرة.", useEn: "Generate printable or exportable reports." },
  crm: { ar: "إدارة علاقات العملاء (عملاء محتملين، صفقات).", en: "CRM (leads, deals, meetings).", useAr: "متابعة قمع المبيعات والاجتماعات.", useEn: "Track sales pipeline and meetings." },
  auth: { ar: "شاشة تسجيل الدخول والتسجيل.", en: "Sign in / sign up screen.", useAr: "بريد+كلمة سر، رمز OTP، أو Google.", useEn: "Password, OTP, or Google sign-in." },
  invite: { ar: "قبول دعوة إلى شركة عبر رابط توكن.", en: "Accept a company invite via token.", useAr: "يفتح تلقائياً من رسالة الدعوة.", useEn: "Opened from the invitation email." },
  blog: { ar: "مدوّنة المنصة.", en: "Platform blog.", useAr: "مقالات تسويقية وتحديثات.", useEn: "Marketing articles and updates." },
  docs: { ar: "توثيق واجهات النظام.", en: "System/API documentation.", useAr: "مرجع للمطوّرين والمكاملين.", useEn: "Reference for developers and integrators." },
  dev: { ar: "أدوات التطوير والاختبار الداخلي.", en: "Internal dev/test utilities.", useAr: "لأغراض تصحيح الأخطاء فقط.", useEn: "Debug-only utilities." },
  api: { ar: "نقطة نهاية خادم (JSON/Webhook).", en: "Server endpoint (JSON/Webhook).", useAr: "تُستدعى من خدمات خارجية أو مهام مجدولة.", useEn: "Called by external services or scheduled jobs." },
  solutions: { ar: "صفحات حلول قطاعية (وسطاء/ملاك/مؤسسات).", en: "Segment-specific solution pages.", useAr: "محتوى تسويقي لكل شريحة عملاء.", useEn: "Marketing content per audience." },
};

/** Curated overrides for specific paths (highest priority). */
const PATH_META: Record<
  string,
  { ar: string; en: string; useAr: string; useEn: string }
> = {
  "/": { ar: "الصفحة الرئيسية للمنصة.", en: "Marketing landing page.", useAr: "نقطة الدخول للزوار الجدد.", useEn: "Entry point for new visitors." },
  "/pricing": { ar: "الخطط والأسعار.", en: "Plans & pricing.", useAr: "اختيار الخطة قبل التسجيل.", useEn: "Choose a plan before signup." },
  "/contact": { ar: "نموذج التواصل.", en: "Contact form.", useAr: "طلب عرض أو دعم.", useEn: "Request a demo or support." },
  "/about": { ar: "عن الشركة.", en: "About us.", useAr: "معلومات تعريفية عن HRHBS.", useEn: "About HRHBS." },
  "/services": { ar: "الخدمات المقدَّمة.", en: "Services offered.", useAr: "قائمة خدمات المنصة.", useEn: "Platform services overview." },
  "/faq": { ar: "الأسئلة الشائعة.", en: "FAQ.", useAr: "إجابات سريعة قبل التواصل مع الدعم.", useEn: "Quick answers before contacting support." },
  "/compare": { ar: "مقارنة الخطط.", en: "Plan comparison.", useAr: "مقارنة تفصيلية بين الخطط.", useEn: "Detailed plan comparison." },
  "/forgot-password": { ar: "استعادة كلمة المرور.", en: "Forgot password.", useAr: "إرسال رابط الاستعادة للبريد.", useEn: "Send reset link by email." },
  "/reset-password": { ar: "تعيين كلمة مرور جديدة.", en: "Reset password.", useAr: "يفتح من رابط الاستعادة.", useEn: "Opened from the reset email." },
  "/access-denied": { ar: "لا تملك صلاحية.", en: "Access denied.", useAr: "تظهر عند محاولة فتح صفحة محمية.", useEn: "Shown when access is blocked." },
  "/unsubscribe": { ar: "إلغاء الاشتراك بالبريد.", en: "Email unsubscribe.", useAr: "من رابط ذيل الرسائل.", useEn: "From email footer link." },
  "/dashboard": { ar: "لوحة التحكم الرئيسية للشركة.", en: "Company main dashboard.", useAr: "الشاشة الأولى بعد الدخول.", useEn: "First screen after sign-in." },
  "/admin": { ar: "الصفحة الرئيسية للسوبر أدمن.", en: "Super-admin home.", useAr: "لوحة KPIs عامة للمنصة.", useEn: "Platform-wide KPIs." },
  "/admin/route-map": { ar: "هذه الصفحة — خريطة كل المسارات.", en: "This page — full route map.", useAr: "لمراجعة الروابط ومستوى الوصول.", useEn: "Audit links & access scopes." },
  "/admin/companies": { ar: "إدارة الشركات المشتركة.", en: "Manage tenant companies.", useAr: "تفعيل/إيقاف/عرض تفاصيل الشركات.", useEn: "Enable/disable/view tenants." },
  "/admin/plans": { ar: "إدارة خطط الاشتراك.", en: "Manage subscription plans.", useAr: "إضافة/تعديل الخطط والأسعار.", useEn: "Add/edit plans and pricing." },
  "/admin/subscription-payments": { ar: "مراجعة إثباتات التحويل البنكي.", en: "Bank-transfer receipts review.", useAr: "قبول/رفض دفعات الاشتراك.", useEn: "Approve/reject subscription payments." },
  "/admin/audit-log": { ar: "سجل التدقيق الشامل.", en: "Global audit log.", useAr: "تتبع كل التغييرات الحساسة.", useEn: "Track sensitive changes." },
  "/admin/users": { ar: "المستخدمون على مستوى المنصة.", en: "Platform-wide users.", useAr: "بحث وإدارة الحسابات.", useEn: "Search & manage accounts." },
  "/admin/roles": { ar: "أدوار وصلاحيات النظام.", en: "System roles & permissions.", useAr: "منح/سحب صلاحيات السوبر أدمن.", useEn: "Grant/revoke super-admin." },
  "/auth": { ar: "شاشة تسجيل الدخول.", en: "Sign-in screen.", useAr: "بريد+كلمة سر، OTP، أو Google.", useEn: "Password, OTP, or Google." },
};

function metaFor(path: string): {
  descriptionAr: string;
  descriptionEn: string;
  usageAr: string;
  usageEn: string;
} {
  if (PATH_META[path]) {
    const m = PATH_META[path];
    return { descriptionAr: m.ar, descriptionEn: m.en, usageAr: m.useAr, usageEn: m.useEn };
  }
  const seg = path.split("/").filter(Boolean)[0] ?? "";
  const section = SECTION_META[seg];
  if (section) {
    return {
      descriptionAr: section.ar,
      descriptionEn: section.en,
      usageAr: section.useAr,
      usageEn: section.useEn,
    };
  }
  return {
    descriptionAr: "صفحة داخل التطبيق.",
    descriptionEn: "In-app page.",
    usageAr: "—",
    usageEn: "—",
  };
}

const AUTH_META: Record<Scope, { ar: string; en: string }> = {
  public: {
    ar: "لا يتطلب تسجيل الدخول — متاح للزوّار.",
    en: "No login required — open to visitors.",
  },
  authenticated: {
    ar: "يتطلب تسجيل الدخول بأي دور (موظف/مدير شركة).",
    en: "Requires any signed-in user (staff or company admin).",
  },
  admin: {
    ar: "يتطلب دور super_admin مع تفعيل 2FA إجبارياً.",
    en: "Requires super_admin role with 2FA enforced.",
  },
  api: {
    ar: "نقطة خادم — لا تُفتح من المتصفح مباشرة؛ تتحقق من التوقيع/المصادقة داخلياً.",
    en: "Server endpoint — not opened in the browser; verifies its own auth/signature.",
  },
};

const SCOPE_META: Record<
  Scope,
  { labelAr: string; labelEn: string; tone: string; icon: typeof Globe }
> = {
  public: {
    labelAr: "عام",
    labelEn: "Public",
    tone: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    icon: Globe,
  },
  authenticated: {
    labelAr: "يتطلب تسجيل الدخول",
    labelEn: "Authenticated",
    tone: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    icon: Lock,
  },
  admin: {
    labelAr: "إدارة النظام",
    labelEn: "Admin only",
    tone: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    icon: Shield,
  },
  api: {
    labelAr: "خادم / API",
    labelEn: "Server / API",
    tone: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    icon: Zap,
  },
};

function useAllRoutes(): RouteRow[] {
  const router = useRouter();
  return useMemo(() => {
    const byId = (router.routesById ?? {}) as Record<
      string,
      { id: string; fullPath?: string; path?: string }
    >;
    const seen = new Map<string, RouteRow>();
    for (const id of Object.keys(byId)) {
      if (id === "__root__") continue;
      const route = byId[id];
      // Prefer the router's own `fullPath` (what users type in the URL bar).
      let fullPath = route.fullPath ?? "";
      if (!fullPath) continue;
      if (fullPath.length > 1 && fullPath.endsWith("/")) {
        fullPath = fullPath.slice(0, -1);
      }
      // Skip pathless layout ids (`/_authenticated`, `/_authenticated/admin`).
      if (fullPath.startsWith("/_")) continue;

      let scope: Scope = classify(fullPath);
      if (scope === "public") {
        if (id.includes("/_authenticated/admin")) scope = "admin";
        else if (id.includes("/_authenticated")) scope = "authenticated";
      }
      const m = metaFor(fullPath);
      const auth = AUTH_META[scope];
      const row: RouteRow = {
        path: fullPath,
        scope,
        dynamic: fullPath.includes("$"),
        segments: fullPath.split("/").filter(Boolean).length,
        descriptionAr: m.descriptionAr,
        descriptionEn: m.descriptionEn,
        usageAr: m.usageAr,
        usageEn: m.usageEn,
        authAr: auth.ar,
        authEn: auth.en,
      };
      // Deduplicate: FileRoutesByFullPath/ByTo produce two ids for the same URL.
      if (!seen.has(row.path)) seen.set(row.path, row);
    }
    return [...seen.values()].sort((a, b) => a.path.localeCompare(b.path));
  }, [router]);
}

function RouteMapPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const rows = useAllRoutes();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope | "all">("all");

  const deferredQuery = useDeferredValue(query);
  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return rows.filter((r) => {
      if (scope !== "all" && r.scope !== scope) return false;
      if (!q) return true;
      const hay = `${r.path} ${r.descriptionAr} ${r.descriptionEn} ${r.usageAr} ${r.usageEn}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, deferredQuery, scope]);

  const counts = useMemo(() => {
    const c: Record<Scope, number> = { public: 0, authenticated: 0, admin: 0, api: 0 };
    for (const r of rows) c[r.scope]++;
    return c;
  }, [rows]);

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6 space-y-4">
      <AdminPageHeader
        ar="خريطة المسارات"
        en="Route map"
        descriptionAr="قائمة كل المسارات التي يعرفها الموجّه، مع نطاق الوصول لكل مسار. تُستخدم لمراجعة الروابط المفقودة."
        descriptionEn="Every URL the router serves, classified by access scope. Use it to audit dead links or missing pages."
      />


      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(Object.keys(SCOPE_META) as Scope[]).map((s) => {
          const meta = SCOPE_META[s];
          const Icon = meta.icon;
          return (
            <Card key={s} className="border-border/50">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`rounded-lg p-2 border ${meta.tone}`}>
                  <Icon className="size-4" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">
                    {isAr ? meta.labelAr : meta.labelEn}
                  </div>
                  <div className="text-xl font-semibold tabular-nums">
                    {counts[s]}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col md:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={isAr ? "ابحث في المسار أو الوصف..." : "Filter path or description..."}
                className="ps-9"
              />
            </div>
            <Select value={scope} onValueChange={(v) => setScope(v as Scope | "all")}>
              <SelectTrigger className="md:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {isAr ? "كل النطاقات" : "All scopes"} ({rows.length})
                </SelectItem>
                {(Object.keys(SCOPE_META) as Scope[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {isAr ? SCOPE_META[s].labelAr : SCOPE_META[s].labelEn} (
                    {counts[s]})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="text-xs text-muted-foreground">
            {isAr
              ? `يعرض ${filtered.length} من ${rows.length} مسار`
              : `Showing ${filtered.length} of ${rows.length} routes`}
          </div>

          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[26%]">
                    {isAr ? "المسار / الوصف" : "Path / Description"}
                  </TableHead>
                  <TableHead className="w-[28%]">
                    {isAr ? "الاستخدام" : "Usage"}
                  </TableHead>
                  <TableHead className="w-[26%]">
                    {isAr ? "حالة الدخول" : "Access"}
                  </TableHead>
                  <TableHead className="text-center">
                    {isAr ? "ديناميكي" : "Dynamic"}
                  </TableHead>
                  <TableHead className="text-end">
                    {isAr ? "فتح" : "Open"}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const meta = SCOPE_META[r.scope];
                  return (
                    <TableRow key={r.path} className="align-top">
                      <TableCell>
                        <div className="font-mono text-xs md:text-sm break-all">
                          {r.path}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
                          {isAr ? r.descriptionAr : r.descriptionEn}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground leading-relaxed">
                        {isAr ? r.usageAr : r.usageEn}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`${meta.tone} whitespace-nowrap`}>
                          {isAr ? meta.labelAr : meta.labelEn}
                        </Badge>
                        <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
                          {isAr ? r.authAr : r.authEn}
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-xs text-muted-foreground">
                        {r.dynamic ? (isAr ? "نعم" : "Yes") : "—"}
                      </TableCell>
                      <TableCell className="text-end">
                        {r.dynamic || r.scope === "api" ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <Link
                            to={r.path as never}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            target="_blank"
                          >
                            {isAr ? "فتح" : "Open"}
                            <ExternalLink className="size-3" />
                          </Link>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                      {isAr ? "لا توجد نتائج" : "No routes match your filters"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
