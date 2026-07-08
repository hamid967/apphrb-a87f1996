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
import { toast } from "sonner";
import { Building2, RefreshCcw, Search, Copy } from "lucide-react";

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
  const qc = useQueryClient();
  const [q, setQ] = useState("");

  const companiesQ = useQuery({
    queryKey: ["admin-companies-est-no"],
    queryFn: () => listFn(),
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

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6" dir={isAr ? "rtl" : "ltr"}>
      <div>
        <h1 className="text-2xl font-semibold">
          {isAr ? "أرقام المنشآت" : "Establishment Numbers"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "عرض وإعادة توليد رقم المنشأة (HBS-XXXXXX) لكل شركة."
            : "View and regenerate the establishment number (HBS-XXXXXX) for each company."}
        </p>
      </div>

      <Card>
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
    </div>
  );
}
