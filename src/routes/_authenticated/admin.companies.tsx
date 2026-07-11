import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  listCompaniesWithEstablishmentNo,
  regenerateEstablishmentNo,
} from "@/lib/admin-companies.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { SERVICE_CATALOG, categoryLabel, serviceIsEnabled, type ServiceKey } from "@/lib/service-catalog";
import { listOrgServiceSettings, updateOrgServiceSettings } from "@/lib/service-entitlements.functions";
import { toast } from "sonner";
import { Building2, CheckCircle2, Copy, LockKeyhole, RefreshCcw, Search, Sparkles } from "lucide-react";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/admin/companies")({
  head: () => sectionHead({ section: "admin", entityAr: "الشركات", entityEn: "Companies", path: "/admin/companies" }),
  component: AdminCompaniesPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-6">
        <p className="text-destructive mb-2">{error.message}</p>
        <Button
          onClick={() => {
            reset();
            router.invalidate();
          }}
        >
          Retry
        </Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-6">Not found</div>,
});

function AdminCompaniesPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const listFn = useServerFn(listCompaniesWithEstablishmentNo);
  const regenFn = useServerFn(regenerateEstablishmentNo);
  const listServicesFn = useServerFn(listOrgServiceSettings);
  const updateServicesFn = useServerFn(updateOrgServiceSettings);
  const qc = useQueryClient();
  const [q, setQ] = useState("");

  const companiesQ = useQuery({
    queryKey: ["admin-companies-est-no"],
    queryFn: () => listFn(),
  });
  const servicesQ = useQuery({
    queryKey: ["admin-org-services"],
    queryFn: () => listServicesFn(),
    staleTime: 30_000,
  });

  const serviceM = useMutation({
    mutationFn: (v: { orgId: string; enabled: ServiceKey[] }) => updateServicesFn({ data: v }),
    onSuccess: () => {
      toast.success(isAr ? "تم تحديث خدمات العميل" : "Customer services updated");
      qc.invalidateQueries({ queryKey: ["admin-org-services"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const regenM = useMutation({
    mutationFn: (companyId: string) => regenFn({ data: { companyId } }),
    onSuccess: (res) => {
      toast.success(
        isAr
          ? `تم توليد رقم جديد: ${res.establishment_no}`
          : `New number generated: ${res.establishment_no}`,
      );
      qc.invalidateQueries({ queryKey: ["admin-companies-est-no"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const rows = useMemo(() => {
    const list = companiesQ.data ?? [];
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter(
      (c: any) =>
        (c.name || "").toLowerCase().includes(s) ||
        (c.legal_name || "").toLowerCase().includes(s) ||
        (c.establishment_no || "").toLowerCase().includes(s) ||
        (c.org_name || "").toLowerCase().includes(s),
    );
  }, [companiesQ.data, q]);

  function copy(text: string) {
    navigator.clipboard?.writeText(text).then(
      () => toast.success(isAr ? "تم النسخ" : "Copied"),
      () => toast.error(isAr ? "تعذّر النسخ" : "Copy failed"),
    );
  }

  const servicesByOrg = useMemo(() => {
    return new Map((servicesQ.data ?? []).map((row: any) => [row.id, row]));
  }, [servicesQ.data]);

  function toggleService(orgId: string, service: ServiceKey, checked: boolean) {
    const current = servicesByOrg.get(orgId);
    const enabled = new Set<ServiceKey>((current?.enabled ?? []) as ServiceKey[]);
    if (checked) enabled.add(service);
    else enabled.delete(service);
    serviceM.mutate({ orgId, enabled: Array.from(enabled) });
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6" dir={isAr ? "rtl" : "ltr"}>
      <div className="studio-panel-dark studio-noise p-6">
        <div className="studio-eyebrow mb-3 border-white/15 bg-white/10 text-[#E8D9A6]">
          <Sparkles className="size-3.5" />
          {isAr ? "تحكم خدمات العملاء" : "Customer Service Control"}
        </div>
        <h1 className="text-3xl font-black text-white">
          {isAr ? "الشركات والخدمات المفعّلة" : "Companies & Enabled Services"}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-[#c9ddd4]">
          {isAr
            ? "من هنا يحدد الأدمن الخدمات التي تظهر وتفتح لكل عميل داخل لوحة المستخدم."
            : "Admins control which services appear and open for every customer dashboard."}
        </p>
      </div>

      <Card className="studio-card-lg border-[#C5A059]/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            {isAr ? "الشركات" : "Companies"}
          </CardTitle>
          <CardDescription>
            {isAr
              ? "يتم استخدام رقم المنشأة في تسجيل دخول العميل مع البريد وكلمة المرور."
              : "The establishment number is used at login together with email and password."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute top-2.5 start-2 w-4 h-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={isAr ? "بحث بالاسم أو الرقم…" : "Search by name or number…"}
              className="ps-8"
            />
          </div>

          {companiesQ.isLoading ? (
            <p className="text-sm text-muted-foreground">{isAr ? "جارٍ التحميل…" : "Loading…"}</p>
          ) : companiesQ.error ? (
            <p className="text-sm text-destructive">
              {(companiesQ.error as any)?.message ?? "Failed to load"}
            </p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              {isAr ? "لا توجد نتائج." : "No results."}
            </p>
          ) : (
            <div className="divide-y">
              {rows.map((c: any) => (
                <div key={c.id} className="py-3 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[220px]">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.legal_name || "—"} · {c.org_name || "—"}
                    </div>
                  </div>
                  <Badge variant="secondary" className="font-mono text-sm">
                    {c.establishment_no || "—"}
                  </Badge>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copy(c.establishment_no || "")}
                      disabled={!c.establishment_no}
                    >
                      <Copy className="w-4 h-4 me-1" />
                      {isAr ? "نسخ" : "Copy"}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        if (
                          window.confirm(
                            isAr
                              ? `سيتم توليد رقم منشأة جديد للشركة "${c.name}". هل أنت متأكد؟`
                              : `A new establishment number will be generated for "${c.name}". Continue?`,
                          )
                        ) {
                          regenM.mutate(c.id);
                        }
                      }}
                      disabled={regenM.isPending}
                    >
                      <RefreshCcw className="w-4 h-4 me-1" />
                      {isAr ? "إعادة توليد" : "Regenerate"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="studio-card-lg border-[#C5A059]/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-[#C5A059]" />
            {isAr ? "مصفوفة الخدمات حسب العميل" : "Service Matrix by Customer"}
          </CardTitle>
          <CardDescription>
            {isAr
              ? "فعّل أو أوقف الخدمات فورًا. ستظهر الخدمات المقفلة للمستخدم كخدمات تحتاج تفعيل."
              : "Enable or disable services instantly. Locked services appear to users as requiring admin activation."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {servicesQ.isLoading ? (
            <p className="text-sm text-muted-foreground">{isAr ? "جارٍ تحميل الخدمات..." : "Loading services..."}</p>
          ) : (
            <div className="space-y-4">
              {rows.map((company: any) => {
                const serviceRow = servicesByOrg.get(company.id);
                const enabled = (serviceRow?.enabled ?? []) as ServiceKey[];
                return (
                  <div key={company.id} className="rounded-2xl border border-[#C5A059]/20 bg-white/70 p-4">
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-black text-[#043927]">{company.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {company.establishment_no || "—"} · {serviceRow?.services_count ?? enabled.length}/{SERVICE_CATALOG.length}
                        </div>
                      </div>
                      <Badge className="bg-[#043927] text-[#E8D9A6]">
                        {isAr ? "تحكم مباشر" : "Live control"}
                      </Badge>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {SERVICE_CATALOG.map((service) => {
                        const Icon = service.icon;
                        const checked = serviceIsEnabled(enabled, service.key);
                        return (
                          <label
                            key={service.key}
                            className="flex items-center gap-3 rounded-2xl border border-border bg-background/70 p-3"
                          >
                            <span className={checked ? "grid size-10 place-items-center rounded-xl bg-[#043927] text-[#C5A059]" : "grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground"}>
                              {checked ? <CheckCircle2 className="size-4" /> : <LockKeyhole className="size-4" />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-bold">
                                {isAr ? service.titleAr : service.titleEn}
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                {categoryLabel(service.category, !!isAr)}
                              </span>
                            </span>
                            <Switch
                              checked={checked}
                              disabled={serviceM.isPending}
                              onCheckedChange={(value) => toggleService(company.id, service.key, value)}
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
