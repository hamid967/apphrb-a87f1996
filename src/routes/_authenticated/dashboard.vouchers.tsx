import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { CompanyListPage } from "@/components/dashboard/CompanyListPage";
import { HijriDateBadge } from "@/components/ui/hijri-date-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listVouchers } from "@/lib/company-modules.functions";
import {
  createVoucher,
  updateVoucher,
  deleteVoucher,
} from "@/lib/company-modules-write.functions";
import { listMyOrganizations } from "@/lib/organizations.functions";

export const Route = createFileRoute("/_authenticated/dashboard/vouchers")({
  head: () => ({ meta: [{ title: "السندات — لوحة التحكم" }] }),
  component: VouchersPage,
});

type V = {
  id: string;
  reference: string | null;
  amount: number | null;
  currency_code: string | null;
  status: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
};

type FormState = {
  id?: string;
  reference: string;
  amount: string;
  currency_code: string;
  status: "draft" | "pending" | "paid" | "cancelled";
  paid_at: string;
  notes: string;
};

const EMPTY: FormState = {
  reference: "",
  amount: "",
  currency_code: "SAR",
  status: "pending",
  paid_at: "",
  notes: "",
};

function VouchersPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);

  const orgsQ = useQuery({
    queryKey: ["my-organizations"],
    queryFn: () => listMyOrganizations(),
    staleTime: 60_000,
  });
  const orgId = orgsQ.data?.[0]?.org?.id;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["vouchers"] });

  const createM = useMutation({
    mutationFn: (v: FormState) =>
      createVoucher({
        data: {
          org_id: orgId!,
          reference: v.reference || undefined,
          amount: Number(v.amount),
          currency_code: v.currency_code || "SAR",
          status: v.status,
          paid_at: v.paid_at ? new Date(v.paid_at).toISOString() : undefined,
          notes: v.notes || undefined,
        },
      }),
    onSuccess: () => {
      toast.success(isAr ? "تم حفظ السند" : "Voucher saved");
      setOpen(false);
      setForm(EMPTY);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateM = useMutation({
    mutationFn: (v: FormState) =>
      updateVoucher({
        data: {
          id: v.id!,
          reference: v.reference || undefined,
          amount: v.amount ? Number(v.amount) : undefined,
          currency_code: v.currency_code || undefined,
          status: v.status,
          paid_at: v.paid_at ? new Date(v.paid_at).toISOString() : undefined,
          notes: v.notes || undefined,
        },
      }),
    onSuccess: () => {
      toast.success(isAr ? "تم تحديث السند" : "Voucher updated");
      setOpen(false);
      setForm(EMPTY);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteVoucher({ data: { id } }),
    onSuccess: () => {
      toast.success(isAr ? "تم الحذف" : "Deleted");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = () => {
    setForm(EMPTY);
    setOpen(true);
  };
  const openEdit = (r: V) => {
    setForm({
      id: r.id,
      reference: r.reference ?? "",
      amount: r.amount != null ? String(r.amount) : "",
      currency_code: r.currency_code ?? "SAR",
      status: (r.status as FormState["status"]) ?? "pending",
      paid_at: r.paid_at ? r.paid_at.slice(0, 10) : "",
      notes: r.notes ?? "",
    });
    setOpen(true);
  };

  const submit = () => {
    if (!orgId) return toast.error(isAr ? "لا توجد شركة" : "No company");
    if (!form.amount || Number.isNaN(Number(form.amount)))
      return toast.error(isAr ? "المبلغ مطلوب" : "Amount required");
    if (form.id) updateM.mutate(form);
    else createM.mutate(form);
  };

  const exportCsv = async () => {
    if (!orgId) return;
    const rows = await listVouchers({ data: { org_id: orgId } });
    const header = ["reference", "amount", "currency_code", "status", "paid_at", "notes", "created_at"];
    const csv = [
      header.join(","),
      ...rows.map((r) =>
        header.map((k) => JSON.stringify((r as Record<string, unknown>)[k] ?? "")).join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vouchers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <CompanyListPage<V>
        titleAr="سندات القبض والصرف"
        titleEn="Receipt & Payment Vouchers"
        descAr="جميع السندات المسجّلة في النظام"
        descEn="All vouchers recorded in the system"
        queryKey="vouchers"
        listFn={listVouchers}
        onCreate={openCreate}
        searchFields={(r) => [r.reference ?? "", r.notes ?? ""]}
        columns={[
          {
            key: "ref",
            labelAr: "الرقم",
            labelEn: "Reference",
            render: (r) => <span className="font-mono text-xs">{r.reference ?? "—"}</span>,
          },
          {
            key: "amount",
            labelAr: "المبلغ",
            labelEn: "Amount",
            render: (r) => (
              <span className="font-medium tabular-nums">
                {r.amount != null
                  ? `${Number(r.amount).toLocaleString()} ${r.currency_code ?? "SAR"}`
                  : "—"}
              </span>
            ),
          },
          {
            key: "status",
            labelAr: "الحالة",
            labelEn: "Status",
            render: (r) =>
              r.status ? (
                <Badge variant={r.status === "paid" ? "default" : "outline"}>{r.status}</Badge>
              ) : (
                "—"
              ),
          },
          {
            key: "paid",
            labelAr: "تاريخ الدفع",
            labelEn: "Paid at",
            render: (r) => (r.paid_at ? <HijriDateBadge date={r.paid_at} showGregorian /> : "—"),
          },
          {
            key: "actions",
            labelAr: "إجراءات",
            labelEn: "Actions",
            render: (r) => (
              <div className="flex justify-end gap-1">
                <Button size="icon" variant="ghost" onClick={() => openEdit(r)} aria-label="edit">
                  <Pencil className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    if (confirm(isAr ? "حذف السند؟" : "Delete voucher?")) deleteM.mutate(r.id);
                  }}
                  aria-label="delete"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ),
          },
        ]}
      />

      <div className="px-4 md:px-6 -mt-4">
        <Button variant="outline" size="sm" onClick={exportCsv}>
          {isAr ? "تصدير CSV" : "Export CSV"}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {form.id
                ? isAr
                  ? "تعديل السند"
                  : "Edit Voucher"
                : isAr
                  ? "سند جديد"
                  : "New Voucher"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>{isAr ? "الرقم المرجعي" : "Reference"}</Label>
              <Input
                value={form.reference}
                onChange={(e) => setForm({ ...form, reference: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>{isAr ? "المبلغ *" : "Amount *"}</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>{isAr ? "العملة" : "Currency"}</Label>
                <Input
                  value={form.currency_code}
                  onChange={(e) => setForm({ ...form, currency_code: e.target.value.toUpperCase() })}
                  maxLength={3}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>{isAr ? "الحالة" : "Status"}</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm({ ...form, status: v as FormState["status"] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">{isAr ? "مسودّة" : "Draft"}</SelectItem>
                    <SelectItem value="pending">{isAr ? "قيد الاعتماد" : "Pending"}</SelectItem>
                    <SelectItem value="paid">{isAr ? "مدفوع" : "Paid"}</SelectItem>
                    <SelectItem value="cancelled">{isAr ? "ملغى" : "Cancelled"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>{isAr ? "تاريخ الدفع" : "Paid at"}</Label>
                <Input
                  type="date"
                  value={form.paid_at}
                  onChange={(e) => setForm({ ...form, paid_at: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>{isAr ? "ملاحظات" : "Notes"}</Label>
              <Textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button onClick={submit} disabled={createM.isPending || updateM.isPending}>
              <Plus className="me-2 h-4 w-4" />
              {isAr ? "حفظ" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
