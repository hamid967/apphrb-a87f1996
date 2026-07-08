import { createFileRoute } from "@tanstack/react-router";
import { portalHead } from "@/lib/portal-og-head";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Receipt, Download } from "lucide-react";
import { PortalPageHeader } from "@/components/portal/PortalPageHeader";
import { listPortalInvoices } from "@/lib/portal.functions";

export const Route = createFileRoute("/_authenticated/portal/invoices")({
  head: () => portalHead({ titleAr: 'الفواتير', titleEn: 'Invoices', descAr: 'عرض وسداد فواتيرك المستحقة.', path: '/portal/invoices' }),
  component: InvoicesPage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">{error.message}</div>,
});

const TABS = [
  { key: "all", ar: "الكل", en: "All" },
  { key: "sent", ar: "مستحقة", en: "Outstanding" },
  { key: "paid", ar: "مدفوعة", en: "Paid" },
  { key: "overdue", ar: "متأخرة", en: "Overdue" },
];

function InvoicesPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const [status, setStatus] = useState("all");
  const nf = new Intl.NumberFormat(isAr ? "ar-SA" : "en-US", { minimumFractionDigits: 2 });
  const { data, isLoading } = useQuery({
    queryKey: ["portal", "invoices", status],
    queryFn: () => listPortalInvoices({ data: { status } }),
  });
  return (
    <div className="mx-auto max-w-[1400px] p-4 sm:p-6 lg:p-8">
      <PortalPageHeader
        icon={<Receipt className="size-5" />}
        title={isAr ? "الفواتير" : "Invoices"}
        subtitle={isAr ? "الفواتير الضريبية والمدفوعات" : "VAT invoices & payments"}
      />
      {data?.totals && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <div className="surface-card p-4">
            <div className="text-xs text-muted-foreground">
              {isAr ? "إجمالي المستحق" : "Outstanding"}
            </div>
            <div className="mt-1 text-2xl font-semibold text-warning">
              {nf.format(data.totals.outstanding)} {isAr ? "ر.س" : "SAR"}
            </div>
          </div>
          <div className="surface-card p-4">
            <div className="text-xs text-muted-foreground">{isAr ? "إجمالي المدفوع" : "Paid"}</div>
            <div className="mt-1 text-2xl font-semibold text-success">
              {nf.format(data.totals.paid)} {isAr ? "ر.س" : "SAR"}
            </div>
          </div>
        </div>
      )}
      <div className="surface-card p-4">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setStatus(t.key)}
              className={
                "rounded-full px-3 py-1.5 text-xs font-semibold transition " +
                (status === t.key
                  ? "bg-primary text-primary-foreground"
                  : "border border-border/60 bg-muted/40 text-muted-foreground hover:text-foreground")
              }
            >
              {isAr ? t.ar : t.en}
            </button>
          ))}
        </div>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/40" />
            ))}
          </div>
        ) : !data || data.items.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            {isAr ? "لا فواتير" : "No invoices"}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-start font-medium">#</th>
                  <th className="px-4 py-3 text-start font-medium">
                    {isAr ? "الإصدار" : "Issued"}
                  </th>
                  <th className="px-4 py-3 text-start font-medium">{isAr ? "الاستحقاق" : "Due"}</th>
                  <th className="px-4 py-3 text-start font-medium">
                    {isAr ? "الإجمالي" : "Total"}
                  </th>
                  <th className="px-4 py-3 text-start font-medium">{isAr ? "الحالة" : "Status"}</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((inv: any) => (
                  <tr
                    key={inv.id}
                    className="border-t border-border/60 transition hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 font-mono text-xs">
                      {inv.number ?? inv.id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{inv.issue_date ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{inv.due_date ?? "—"}</td>
                    <td className="px-4 py-3 font-semibold tabular-nums">
                      {nf.format(Number(inv.total ?? 0))} {inv.currency ?? "SAR"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold " +
                          (inv.status === "paid"
                            ? "bg-success/10 text-success"
                            : inv.status === "overdue"
                              ? "bg-destructive/10 text-destructive"
                              : "bg-warning/15 text-warning")
                        }
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-end">
                      <button
                        aria-label={isAr ? "تنزيل PDF" : "Download PDF"}
                        className="inline-grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Download className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
