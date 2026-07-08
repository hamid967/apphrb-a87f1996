import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Printer, ReceiptText, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { listMyOrganizations } from "@/lib/organizations.functions";
import { listRentCharges, recordRentPayment } from "@/lib/rent-payments.functions";
import { EnterpriseDataTable, type DTColumn } from "@/components/dashboard/EnterpriseDataTable";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/dashboard/payments")({
  head: () => sectionHead({ section: "dashboard", entityAr: "المدفوعات", entityEn: "Payments", path: "/dashboard/payments" }),
  component: PaymentsPage,
});

type Tab = "due" | "overdue" | "upcoming" | "paid";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ChargeRow = any;

const todayISO = () => new Date().toISOString().slice(0, 10);

const bucket = (c: ChargeRow): Tab => {
  if (c.status === "paid") return "paid";
  const today = todayISO();
  if (c.due_date < today) return "overdue";
  if (c.due_date === today) return "due";
  return "upcoming";
};

function PaymentsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const qc = useQueryClient();
  const orgsQ = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });
  const org = orgsQ.data?.[0]?.org;
  const chargesQ = useQuery({
    queryKey: ["rent-charges", org?.id],
    queryFn: () => listRentCharges({ data: { org_id: org!.id } }),
    enabled: !!org,
  });

  const [tab, setTab] = useState<Tab>("due");
  const [selected, setSelected] = useState<ChargeRow | null>(null);

  const grouped = useMemo(() => {
    const g: Record<Tab, ChargeRow[]> = { due: [], overdue: [], upcoming: [], paid: [] };
    for (const c of chargesQ.data ?? []) g[bucket(c)].push(c);
    return g;
  }, [chargesQ.data]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("payments.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("payments.sub")}</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="mt-6">
        <TabsList>
          <TabsTrigger value="due">
            {t("payments.tabDue")} ({grouped.due.length})
          </TabsTrigger>
          <TabsTrigger value="overdue">
            {t("payments.tabOverdue")} ({grouped.overdue.length})
          </TabsTrigger>
          <TabsTrigger value="upcoming">
            {t("payments.tabUpcoming")} ({grouped.upcoming.length})
          </TabsTrigger>
          <TabsTrigger value="paid">
            {t("payments.tabPaid")} ({grouped.paid.length})
          </TabsTrigger>
        </TabsList>
        {(["due", "overdue", "upcoming", "paid"] as Tab[]).map((t) => (
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
          qc.invalidateQueries({ queryKey: ["rent-charges", org?.id] });
        }}
        orgName={(org?.name as string) ?? "—"}
        orgLogo={(org?.logo_url as string | null) ?? null}
        isAr={isAr}
      />
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
      accessor: (c) => c.tenants?.full_name ?? "—",
      width: 200,
    },
    {
      id: "unit",
      header: t("payments.colUnit"),
      accessor: (c) =>
        `${c.contracts?.units?.code ?? ""} ${c.contracts?.contract_number ?? ""}`.trim(),
      width: 200,
      cell: (c) => (
        <div>
          <div>{c.contracts?.units?.code ?? "—"}</div>
          <div className="text-xs text-muted-foreground">{c.contracts?.contract_number ?? ""}</div>
        </div>
      ),
    },
    {
      id: "period",
      header: t("payments.colPeriod"),
      accessor: (c) => `${c.period_start} → ${c.period_end}`,
      width: 200,
    },
    { id: "due", header: t("payments.colDue"), accessor: (c) => c.due_date, width: 140 },
    {
      id: "amount",
      header: t("payments.colAmount"),
      accessor: (c) => Number(c.amount),
      align: "end",
      width: 140,
      cell: (c) => (
        <span className="tabular-nums">
          {Number(c.amount).toLocaleString(isAr ? "ar" : "en")} {c.currency ?? "SAR"}
        </span>
      ),
    },
    {
      id: "status",
      header: t("payments.colStatus"),
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
            <ReceiptText className="me-1.5 size-4" /> {t("payments.record")}
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
      emptyLabel={t("payments.empty")}
      searchPlaceholder={t("payments.search")}
      bulkActions={
        tab === "paid"
          ? []
          : [
              {
                id: "mark",
                label: t("payments.bulkMark"),
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
  const { t } = useTranslation();
  const map: Record<Tab, { key: string; className: string }> = {
    due: { key: "payments.stDue", className: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
    overdue: {
      key: "payments.stOverdue",
      className: "bg-rose-500/15 text-rose-700 border-rose-500/30",
    },
    upcoming: {
      key: "payments.stUpcoming",
      className: "bg-blue-500/15 text-blue-700 border-blue-500/30",
    },
    paid: {
      key: "payments.stPaid",
      className: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
    },
  };
  const v = map[tab];
  return (
    <Badge variant="outline" className={v.className}>
      {t(v.key)}
    </Badge>
  );
}

function RecordPaymentDialog({
  charge,
  onClose,
  onDone,
  orgName,
  orgLogo,
  isAr,
}: {
  charge: ChargeRow | null;
  onClose: () => void;
  onDone: () => void;
  orgName: string;
  orgLogo: string | null;
  isAr: boolean;
}) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState<string>("");
  const [paidAt, setPaidAt] = useState<string>(todayISO());
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [showReceipt, setShowReceipt] = useState<null | {
    amount: number;
    paid_at: string;
    reference: string;
    notes: string;
  }>(null);

  const mut = useMutation({
    mutationFn: recordRentPayment,
    onSuccess: () => {
      toast.success(t("payments.savedOk"));
      onDone();
      setShowReceipt({ amount: Number(amount), paid_at: paidAt, reference, notes });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const open = !!charge;
  const close = () => {
    setAmount("");
    setPaidAt(todayISO());
    setReference("");
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
                  {charge.tenants?.full_name ?? "—"}
                </div>
                <div>
                  <span className="text-muted-foreground">{t("payments.dlgUnit")}:</span>{" "}
                  {charge.contracts?.units?.code ?? "—"}
                </div>
                <div>
                  <span className="text-muted-foreground">{t("payments.dlgDue")}:</span>{" "}
                  {Number(charge.amount).toLocaleString(isAr ? "ar" : "en")}{" "}
                  {charge.currency ?? "SAR"}
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
                <Label htmlFor="ref">{t("payments.refMethod")}</Label>
                <Input
                  id="ref"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder={t("payments.refPh")}
                />
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
                      charge_id: charge.id,
                      amount: Number(amount),
                      paid_at: paidAt,
                      reference: reference || null,
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
            orgName={orgName}
            orgLogo={orgLogo}
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
  orgName,
  orgLogo,
  charge,
  payment,
  isAr,
  onClose,
}: {
  orgName: string;
  orgLogo: string | null;
  charge: ChargeRow;
  payment: { amount: number; paid_at: string; reference: string; notes: string };
  isAr: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const amount = payment.amount.toLocaleString(isAr ? "ar" : "en");
  const amountEn = payment.amount.toLocaleString("en");
  const currency = charge.currency ?? "SAR";
  const tenant = charge.tenants?.full_name ?? "—";
  const unit = charge.contracts?.units?.code ?? "—";
  const receiptNo = `R-${(charge.id ?? "").toString().slice(0, 8).toUpperCase()}-${payment.paid_at.replace(/-/g, "")}`;

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
            <div className="font-medium">
              {charge.period_start} → {charge.period_end}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{t("payments.recPaidOn")}</div>
            <div className="font-medium">{payment.paid_at}</div>
          </div>
          <div className="col-span-2">
            <div className="text-xs text-muted-foreground">{t("payments.recRef")}</div>
            <div className="font-medium">{payment.reference || "—"}</div>
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
