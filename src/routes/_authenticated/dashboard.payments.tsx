import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Printer, ReceiptText, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { listMyOrganizations } from "@/lib/organizations.functions";
import { listLeasePayments, recordLeasePayment } from "@/lib/finance.functions";
import { EnterpriseDataTable, type DTColumn } from "@/components/dashboard/EnterpriseDataTable";
import type { AccountPdfProfile } from "@/lib/pdf/document-types";
import { renderSimplifiedTaxInvoicePdf, renderVoucherPdf } from "@/lib/pdf/financial-documents";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/dashboard/payments")({
  head: () =>
    sectionHead({
      section: "dashboard",
      entityAr: "المدفوعات",
      entityEn: "Payments",
      path: "/dashboard/payments",
    }),
  component: PaymentsPage,
});

type Tab = "due" | "overdue" | "partial" | "paid";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ChargeRow = any;
type PaymentReceiptResult = { receipt_number?: string | null } | null;

const todayISO = () => new Date().toISOString().slice(0, 10);

const bucket = (c: ChargeRow): Tab => {
  if (c.status === "paid") return "paid";
  if (c.status === "partial") return "partial";
  if (c.status === "overdue") return "overdue";
  const today = todayISO();
  if (c.due_date < today) return "overdue";
  return "due";
};

function PaymentsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const qc = useQueryClient();
  const orgsQ = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });
  const org = orgsQ.data?.[0]?.org;
  const orgProfile = org as
    | (typeof org & {
        account_type?: string | null;
        tax_number?: string | null;
        commercial_registration?: string | null;
        national_address?: string | null;
      })
    | undefined;
  const pdfAccount: AccountPdfProfile | null = org
    ? {
        orgId: String(org.id),
        accountType: orgProfile?.account_type ?? null,
        name: (org.name as string) ?? "—",
        logoUrl: (org.logo_url as string | null) ?? null,
        taxNumber: orgProfile?.tax_number ?? null,
        commercialRegistration: orgProfile?.commercial_registration ?? null,
        nationalAddress: orgProfile?.national_address ?? null,
      }
    : null;
  const chargesQ = useQuery({
    queryKey: ["lease-payments", org?.id],
    queryFn: () => listLeasePayments({ data: { org_id: org!.id } }),
    enabled: !!org,
  });

  const [tab, setTab] = useState<Tab>("due");
  const [selected, setSelected] = useState<ChargeRow | null>(null);

  const grouped = useMemo(() => {
    const g: Record<Tab, ChargeRow[]> = { due: [], overdue: [], partial: [], paid: [] };
    for (const c of chargesQ.data ?? []) g[bucket(c)].push(c);
    return g;
  }, [chargesQ.data]);

  const totals = useMemo(() => {
    const rows = chargesQ.data ?? [];
    const collected = rows.reduce((s: number, r: ChargeRow) => s + Number(r.paid_amount ?? 0), 0);
    const overdue = rows
      .filter((r: ChargeRow) => bucket(r) === "overdue")
      .reduce(
        (s: number, r: ChargeRow) =>
          s + Math.max(Number(r.amount ?? 0) - Number(r.paid_amount ?? 0), 0),
        0,
      );
    const expected = rows
      .filter((r: ChargeRow) => bucket(r) !== "paid")
      .reduce(
        (s: number, r: ChargeRow) =>
          s + Math.max(Number(r.amount ?? 0) - Number(r.paid_amount ?? 0), 0),
        0,
      );
    return { collected, overdue, expected };
  }, [chargesQ.data]);

  const label = (ar: string, en: string) => (isAr ? ar : en);
  const fmt = (n: number) => n.toLocaleString(isAr ? "ar" : "en", { maximumFractionDigits: 2 });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {label("التحصيل", "Collections")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {label(
            "تسجيل السداد الكامل والجزئي مع سندات قبض متسلسلة.",
            "Record full and partial rent payments with sequential receipts.",
          )}
        </p>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <SummaryCard label={label("المحصّل", "Collected")} value={fmt(totals.collected)} />
        <SummaryCard
          label={label("المتأخرات", "Overdue")}
          value={fmt(totals.overdue)}
          tone="danger"
        />
        <SummaryCard
          label={label("المتوقع", "Expected")}
          value={fmt(totals.expected)}
          tone="info"
        />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="mt-6">
        <TabsList>
          <TabsTrigger value="due">
            {label("مستحقة", "Due")} ({grouped.due.length})
          </TabsTrigger>
          <TabsTrigger value="overdue">
            {label("متأخرة", "Overdue")} ({grouped.overdue.length})
          </TabsTrigger>
          <TabsTrigger value="partial">
            {label("جزئية", "Partial")} ({grouped.partial.length})
          </TabsTrigger>
          <TabsTrigger value="paid">
            {label("مدفوعة", "Paid")} ({grouped.paid.length})
          </TabsTrigger>
        </TabsList>
        {(["due", "overdue", "partial", "paid"] as Tab[]).map((t) => (
          <TabsContent key={t} value={t} className="mt-4">
            <ChargesTable
              rows={grouped[t]}
              tab={t}
              isAr={isAr}
              onRecord={setSelected}
              loading={chargesQ.isLoading}
            />
          </TabsContent>
        ))}
      </Tabs>

      <RecordPaymentDialog
        charge={selected}
        onClose={() => setSelected(null)}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["lease-payments", org?.id] });
        }}
        account={pdfAccount}
        isAr={isAr}
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "danger" | "info";
}) {
  const toneClass =
    tone === "danger"
      ? "border-destructive/20 bg-destructive/5"
      : tone === "info"
        ? "border-info/20 bg-info/5"
        : "border-success/20 bg-success/5";
  return (
    <div className={`rounded-lg border p-4 ${toneClass}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value} SAR</div>
    </div>
  );
}

function ChargesTable({
  rows,
  tab,
  isAr,
  onRecord,
  loading,
}: {
  rows: ChargeRow[];
  tab: Tab;
  isAr: boolean;
  onRecord: (c: ChargeRow) => void;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const columns: DTColumn<ChargeRow>[] = [
    {
      id: "tenant",
      header: t("payments.colTenant"),
      accessor: (c) => c.tenant?.full_name ?? "—",
      width: 200,
    },
    {
      id: "unit",
      header: t("payments.colUnit"),
      accessor: (c) => `${c.unit?.code ?? ""} ${c.contract?.contract_number ?? ""}`.trim(),
      width: 200,
      cell: (c) => (
        <div>
          <div>{c.unit?.code ?? "—"}</div>
          <div className="text-xs text-muted-foreground">{c.contract?.contract_number ?? ""}</div>
        </div>
      ),
    },
    {
      id: "property",
      header: isAr ? "العقار" : "Property",
      accessor: (c) => c.property?.title_ar ?? c.property?.title_en ?? "—",
      width: 200,
    },
    { id: "due", header: isAr ? "الاستحقاق" : "Due", accessor: (c) => c.due_date, width: 140 },
    {
      id: "amount",
      header: isAr ? "المبلغ" : "Amount",
      accessor: (c) => Number(c.amount),
      align: "end",
      width: 140,
      cell: (c) => (
        <span className="tabular-nums">
          {Number(c.amount).toLocaleString(isAr ? "ar" : "en")} SAR
        </span>
      ),
    },
    {
      id: "paid",
      header: isAr ? "المسدّد" : "Paid",
      accessor: (c) => Number(c.paid_amount ?? 0),
      align: "end",
      width: 140,
      cell: (c) => (
        <span className="tabular-nums">
          {Number(c.paid_amount ?? 0).toLocaleString(isAr ? "ar" : "en")} SAR
        </span>
      ),
    },
    {
      id: "status",
      header: isAr ? "الحالة" : "Status",
      accessor: () => tab,
      width: 120,
      cell: () => <StatusBadge tab={tab} />,
    },
    {
      id: "actions",
      header: "",
      accessor: () => "",
      width: 140,
      align: "end",
      sortable: false,
      filterable: false,
      cell: (c) =>
        tab !== "paid" ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation();
              onRecord(c);
            }}
          >
            <ReceiptText className="me-1.5 size-4" /> {isAr ? "تسجيل سداد" : "Record"}
          </Button>
        ) : null,
    },
  ];
  return (
    <EnterpriseDataTable<ChargeRow>
      data={rows}
      columns={columns}
      rowKey={(c) => c.id}
      isAr={isAr}
      loading={loading}
      exportFileName={`payments-${tab}`}
      emptyLabel={isAr ? "لا توجد دفعات" : "No payments"}
      searchPlaceholder={isAr ? "بحث في التحصيل" : "Search collections"}
      bulkActions={
        tab === "paid"
          ? []
          : [
              {
                id: "mark",
                label: isAr ? "تسجيل أول دفعة" : "Record first payment",
                icon: CheckCircle2,
                onRun: (rs) => {
                  if (rs[0]) onRecord(rs[0]);
                },
              },
            ]
      }
    />
  );
}

function StatusBadge({ tab }: { tab: Tab }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const map: Record<Tab, { key: string; className: string }> = {
    due: { key: isAr ? "مستحقة" : "Due", className: "bg-muted text-foreground border-border" },
    overdue: {
      key: isAr ? "متأخرة" : "Overdue",
      className: "bg-destructive/15 text-destructive border-destructive/30",
    },
    partial: {
      key: isAr ? "جزئية" : "Partial",
      className: "bg-warning/15 text-warning border-warning/30",
    },
    paid: {
      key: isAr ? "مدفوعة" : "Paid",
      className: "bg-success/15 text-success border-success/30",
    },
  };
  const v = map[tab];
  return (
    <Badge variant="outline" className={v.className}>
      {v.key}
    </Badge>
  );
}

function RecordPaymentDialog({
  charge,
  onClose,
  onDone,
  account,
  isAr,
}: {
  charge: ChargeRow | null;
  onClose: () => void;
  onDone: () => void;
  account: AccountPdfProfile | null;
  isAr: boolean;
}) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState<string>("");
  const [paidAt, setPaidAt] = useState<string>(todayISO());
  const [method, setMethod] = useState<"cash" | "bank_transfer" | "cheque" | "mada" | "other">(
    "bank_transfer",
  );
  const [notes, setNotes] = useState("");
  const [showReceipt, setShowReceipt] = useState<null | {
    amount: number;
    paid_at: string;
    receipt_number: string;
    payment_method: string;
    notes: string;
  }>(null);

  const mut = useMutation({
    mutationFn: recordLeasePayment,
    onSuccess: (receipt: PaymentReceiptResult) => {
      toast.success(t("payments.savedOk"));
      onDone();
      setShowReceipt({
        amount: Number(amount),
        paid_at: paidAt,
        receipt_number: receipt?.receipt_number ?? "—",
        payment_method: method,
        notes,
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const open = !!charge;
  const close = () => {
    setAmount("");
    setPaidAt(todayISO());
    setMethod("bank_transfer");
    setNotes("");
    setShowReceipt(null);
    onClose();
  };

  if (!charge) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-lg">
        {!showReceipt ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("payments.dlgTitle")}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <div>
                  <span className="text-muted-foreground">{t("payments.dlgTenant")}:</span>{" "}
                  {charge.tenant?.full_name ?? "—"}
                </div>
                <div>
                  <span className="text-muted-foreground">{t("payments.dlgUnit")}:</span>{" "}
                  {charge.unit?.code ?? "—"}
                </div>
                <div>
                  <span className="text-muted-foreground">{t("payments.dlgDue")}:</span>{" "}
                  {Number(charge.amount).toLocaleString(isAr ? "ar" : "en")} SAR
                </div>
                <div>
                  <span className="text-muted-foreground">{isAr ? "المتبقي" : "Remaining"}:</span>{" "}
                  {Math.max(
                    Number(charge.amount ?? 0) - Number(charge.paid_amount ?? 0),
                    0,
                  ).toLocaleString(isAr ? "ar" : "en")}{" "}
                  SAR
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="amt">{t("payments.amtPaid")}</Label>
                <Input
                  id="amt"
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={String(charge.amount)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="date">{t("payments.payDate")}</Label>
                <Input
                  id="date"
                  type="date"
                  value={paidAt}
                  onChange={(e) => setPaidAt(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>{isAr ? "طريقة الدفع" : "Payment method"}</Label>
                <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">{isAr ? "نقد" : "Cash"}</SelectItem>
                    <SelectItem value="bank_transfer">
                      {isAr ? "تحويل" : "Bank transfer"}
                    </SelectItem>
                    <SelectItem value="cheque">{isAr ? "شيك" : "Cheque"}</SelectItem>
                    <SelectItem value="mada">{isAr ? "مدى" : "Mada"}</SelectItem>
                    <SelectItem value="other">{isAr ? "أخرى" : "Other"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="notes">{t("payments.dlgNotes")}</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={close}>
                {t("payments.cancel")}
              </Button>
              <Button
                disabled={mut.isPending || !amount || Number(amount) <= 0}
                onClick={() =>
                  mut.mutate({
                    data: {
                      lease_payment_id: charge.id,
                      amount: Number(amount),
                      paid_at: paidAt,
                      payment_method: method,
                      notes: notes || null,
                    },
                  })
                }
              >
                {mut.isPending ? t("payments.saving") : t("payments.save")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <Receipt
            account={account}
            charge={charge}
            payment={showReceipt}
            isAr={isAr}
            onClose={close}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Receipt({
  account,
  charge,
  payment,
  isAr,
  onClose,
}: {
  account: AccountPdfProfile | null;
  charge: ChargeRow;
  payment: {
    amount: number;
    paid_at: string;
    receipt_number: string;
    payment_method: string;
    notes: string;
  };
  isAr: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const amount = payment.amount.toLocaleString(isAr ? "ar" : "en");
  const amountEn = payment.amount.toLocaleString("en");
  const currency = "SAR";
  const tenant = charge.tenant?.full_name ?? "—";
  const unit = charge.unit?.code ?? "—";
  const receiptNo = payment.receipt_number;
  const orgName = account?.name ?? "—";
  const orgLogo = account?.logoUrl ?? null;

  const exportVoucher = async () => {
    if (!account) {
      toast.error(isAr ? "بيانات الحساب غير متاحة" : "Account profile is unavailable");
      return;
    }
    try {
      const result = await renderVoucherPdf({
        account,
        templateKey: "official",
        voucherType: "receipt",
        voucherNumber: receiptNo,
        amount: payment.amount,
        partyName: tenant,
        statement: `${isAr ? "سداد دفعة إيجار" : "Rent payment"} - ${charge.due_date}`,
        paymentMethod: payment.payment_method,
      });
      result.open();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر توليد سند PDF");
    }
  };

  const exportInvoice = async () => {
    if (!account) {
      toast.error(isAr ? "بيانات الحساب غير متاحة" : "Account profile is unavailable");
      return;
    }
    try {
      const taxable = Boolean(account.taxNumber);
      const result = await renderSimplifiedTaxInvoicePdf({
        account,
        templateKey: "official",
        invoiceNumber: receiptNo,
        buyerName: tenant,
        description: `${isAr ? "دفعة إيجار" : "Rent payment"} - ${charge.property?.title_ar ?? charge.property?.title_en ?? unit}`,
        subtotal: taxable ? payment.amount / 1.15 : payment.amount,
        vatAmount: taxable ? payment.amount - payment.amount / 1.15 : 0,
        totalWithVat: payment.amount,
      });
      result.open();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر توليد الفاتورة");
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("payments.recTitle")}</DialogTitle>
      </DialogHeader>
      <div id="receipt-print" className="rounded-lg border bg-card p-6 text-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {orgLogo ? (
              <img
                src={orgLogo}
                alt={orgName}
                className="h-14 w-14 rounded-md border object-contain bg-white"
                crossOrigin="anonymous"
              />
            ) : (
              <div className="grid h-14 w-14 place-items-center rounded-md border bg-muted text-lg font-semibold text-muted-foreground">
                {orgName?.slice(0, 1) ?? "—"}
              </div>
            )}
            <div>
              <div className="text-lg font-semibold">{orgName}</div>
              <div className="text-xs text-muted-foreground">{t("payments.recSub")}</div>
            </div>
          </div>
          <div className="text-end">
            <div className="text-xs text-muted-foreground">{t("payments.recNo")}</div>
            <div className="font-mono text-sm">{receiptNo}</div>
          </div>
        </div>

        <div className="my-4 h-px bg-border" />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-muted-foreground">{t("payments.recTenant")}</div>
            <div className="font-medium">{tenant}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{t("payments.recUnit")}</div>
            <div className="font-medium">{unit}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{t("payments.recPeriod")}</div>
            <div className="font-medium">{charge.due_date}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{t("payments.recPaidOn")}</div>
            <div className="font-medium">{payment.paid_at}</div>
          </div>
          <div className="col-span-2">
            <div className="text-xs text-muted-foreground">{t("payments.recRef")}</div>
            <div className="font-medium">{payment.payment_method || "—"}</div>
          </div>
        </div>

        <div className="my-4 h-px bg-border" />

        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">{t("payments.recAmount")}</div>
          <div className="text-end">
            <div className="text-2xl font-semibold tabular-nums">
              {amount} <span className="text-sm text-muted-foreground">{currency}</span>
            </div>
            {isAr && (
              <div className="text-xs text-muted-foreground tabular-nums" dir="ltr">
                {amountEn} {currency}
              </div>
            )}
          </div>
        </div>

        {payment.notes && (
          <div className="mt-4">
            <div className="text-xs text-muted-foreground">{t("payments.recNotes")}</div>
            <div className="mt-1 text-sm whitespace-pre-wrap">{payment.notes}</div>
          </div>
        )}

        <div className="mt-6 grid grid-cols-2 gap-6 text-xs text-muted-foreground">
          <div>
            <div>{t("payments.recReceivedBy")}</div>
            <div className="mt-6 h-px bg-border" />
          </div>
          <div>
            <div>{t("payments.recPayerSig")}</div>
            <div className="mt-6 h-px bg-border" />
          </div>
        </div>

        <div className="mt-4 text-center text-[10px] text-muted-foreground">
          {t("payments.recFooter", { name: orgName })}
        </div>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          {t("payments.close")}
        </Button>
        <Button variant="secondary" onClick={exportVoucher}>
          <ReceiptText className="me-2 size-4" /> {isAr ? "سند PDF" : "Voucher PDF"}
        </Button>
        <Button variant="secondary" onClick={exportInvoice}>
          <FileText className="me-2 size-4" /> {isAr ? "فاتورة PDF" : "Invoice PDF"}
        </Button>
        <Button onClick={() => window.print()}>
          <Printer className="me-2 size-4" /> {t("payments.print")}
        </Button>
      </DialogFooter>

      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #receipt-print, #receipt-print * { visibility: visible !important; }
          #receipt-print { position: absolute; inset: 0; margin: 0; border: 0; }
        }
      `}</style>
    </>
  );
}

// Suppress unused import warnings for parts that might be reserved for expansion
void DialogTrigger;
