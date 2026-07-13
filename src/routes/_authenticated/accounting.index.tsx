import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { listMyOrganizations } from "@/lib/organizations.functions";
import {
  createInvoice,
  deleteInvoice,
  listInvoices,
  updateInvoice,
} from "@/lib/accounting.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { sectionHead } from "@/lib/section-og-head";

export const Route = createFileRoute("/_authenticated/accounting/")({
  component: InvoicesPage,
  head: () =>
    sectionHead({
      section: "accounting",
      entityAr: "الفواتير والمصروفات",
      entityEn: "Invoices & Expenses",
      descAr: "إصدار الفواتير ومتابعة المدفوعات والمصروفات وضريبة القيمة المضافة.",
      path: "/accounting",
    }),
});

const STATUS_VARIANT: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-info/15 text-info dark:text-info",
  paid: "bg-success/15 text-success dark:text-success",
  overdue: "bg-destructive/15 text-destructive dark:text-destructive",
  cancelled: "bg-muted text-muted-foreground line-through",
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function InvoicesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const orgsQ = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });
  const orgId = orgsQ.data?.[0]?.org?.id;

  const q = useQuery({
    queryKey: ["invoices", orgId],
    queryFn: () => listInvoices({ data: { orgId: orgId! } }),
    enabled: !!orgId,
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    number: "",
    issue_date: today(),
    due_date: "",
    description: "",
    subtotal: "",
    vat_rate: "15",
    currency: "USD",
    status: "draft" as const,
  });

  const create = useMutation({
    mutationFn: (payload: any) => createInvoice({ data: payload }),
    onSuccess: () => {
      toast.success(t("accountingPage.invoiceCreated"));
      qc.invalidateQueries({ queryKey: ["invoices", orgId] });
      setOpen(false);
      setForm({
        number: "",
        issue_date: today(),
        due_date: "",
        description: "",
        subtotal: "",
        vat_rate: "15",
        currency: "USD",
        status: "draft",
      });
    },
    onError: (e: any) => toast.error(e?.message ?? t("accountingPage.failed")),
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      updateInvoice({
        data: { id, patch: { status: status as any, paid_at: status === "paid" ? today() : null } },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoices", orgId] }),
    onError: (e: any) => toast.error(e?.message ?? t("accountingPage.failed")),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteInvoice({ data: { id } }),
    onSuccess: () => {
      toast.success(t("accountingPage.invoiceDeleted"));
      qc.invalidateQueries({ queryKey: ["invoices", orgId] });
    },
    onError: (e: any) => toast.error(e?.message ?? t("accountingPage.failed")),
  });

  const rows = q.data ?? [];
  const totals = useMemo(() => {
    const paid = rows
      .filter((r: any) => r.status === "paid")
      .reduce((s: number, r: any) => s + Number(r.total), 0);
    const outstanding = rows
      .filter((r: any) => r.status !== "paid" && r.status !== "cancelled")
      .reduce((s: number, r: any) => s + Number(r.total), 0);
    return { paid, outstanding, count: rows.length };
  }, [rows]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-3">
        <StatCard label={t("accountingPage.statInvoices")} value={String(totals.count)} />
        <StatCard
          label={t("accountingPage.statPaid")}
          value={`$${totals.paid.toLocaleString()}`}
          tone="pos"
        />
        <StatCard
          label={t("accountingPage.statOutstanding")}
          value={`$${totals.outstanding.toLocaleString()}`}
          tone="warn"
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>{t("accountingPage.statInvoices")}</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="size-4" /> {t("accountingPage.newInvoice")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("accountingPage.newInvoice")}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3 py-2">
                <Field label={t("accountingPage.fieldNumber")}>
                  <Input
                    value={form.number}
                    onChange={(e) => setForm({ ...form, number: e.target.value })}
                    placeholder="INV-0001"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t("accountingPage.fieldIssueDate")}>
                    <Input
                      type="date"
                      value={form.issue_date}
                      onChange={(e) => setForm({ ...form, issue_date: e.target.value })}
                    />
                  </Field>
                  <Field label={t("accountingPage.fieldDueDate")}>
                    <Input
                      type="date"
                      value={form.due_date}
                      onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                    />
                  </Field>
                </div>
                <Field label={t("accountingPage.fieldDescription")}>
                  <Textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={2}
                  />
                </Field>
                <div className="grid grid-cols-3 gap-3">
                  <Field label={t("accountingPage.fieldSubtotal")}>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.subtotal}
                      onChange={(e) => setForm({ ...form, subtotal: e.target.value })}
                    />
                  </Field>
                  <Field label={t("accountingPage.fieldVatRate")}>
                    <Input
                      type="number"
                      step="0.1"
                      value={form.vat_rate}
                      onChange={(e) => setForm({ ...form, vat_rate: e.target.value })}
                    />
                  </Field>
                  <Field label={t("accountingPage.fieldCurrency")}>
                    <Input
                      value={form.currency}
                      onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
                    />
                  </Field>
                </div>
              </div>
              <DialogFooter>
                <Button
                  disabled={create.isPending || !form.number || !form.subtotal}
                  onClick={() =>
                    create.mutate({
                      org_id: orgId!,
                      number: form.number,
                      issue_date: form.issue_date,
                      due_date: form.due_date || null,
                      description: form.description || null,
                      subtotal: Number(form.subtotal),
                      vat_rate: Number(form.vat_rate || 0),
                      currency: form.currency,
                      status: form.status,
                    })
                  }
                >
                  {create.isPending && <Loader2 className="me-2 size-4 animate-spin" />}{" "}
                  {t("accountingPage.create")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="p-0">
          {q.isLoading ? (
            <div className="grid place-items-center p-12">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              {t("accountingPage.noInvoices")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border/40 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">{t("accountingPage.colNumber")}</th>
                    <th className="px-4 py-2">{t("accountingPage.colIssued")}</th>
                    <th className="px-4 py-2">{t("accountingPage.colTotal")}</th>
                    <th className="px-4 py-2">{t("accountingPage.colVat")}</th>
                    <th className="px-4 py-2">{t("accountingPage.colStatus")}</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r: any) => (
                    <tr key={r.id} className="border-b border-border/30 last:border-0">
                      <td className="px-4 py-2 font-medium">{r.number}</td>
                      <td className="px-4 py-2 text-muted-foreground">{r.issue_date}</td>
                      <td className="px-4 py-2">
                        {r.currency} {Number(r.total).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {Number(r.vat_amount).toLocaleString()}
                      </td>
                      <td className="px-4 py-2">
                        <Select
                          value={r.status}
                          onValueChange={(v) => setStatus.mutate({ id: r.id, status: v })}
                        >
                          <SelectTrigger className="h-8 w-32 border-transparent bg-transparent px-2 py-0 text-xs shadow-none focus:ring-0">
                            <Badge className={STATUS_VARIANT[r.status]}>{r.status}</Badge>
                          </SelectTrigger>
                          <SelectContent>
                            {["draft", "sent", "paid", "overdue", "cancelled"].map((s) => (
                              <SelectItem key={s} value={s}>
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-2 text-end">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            if (confirm(t("accountingPage.invoiceDeleteConfirm"))) del.mutate(r.id);
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs uppercase text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "pos" | "warn" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase text-muted-foreground">{label}</div>
        <div
          className={
            tone === "pos"
              ? "mt-1 text-2xl font-semibold text-success dark:text-success"
              : tone === "warn"
                ? "mt-1 text-2xl font-semibold text-warning dark:text-warning"
                : "mt-1 text-2xl font-semibold"
          }
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}
