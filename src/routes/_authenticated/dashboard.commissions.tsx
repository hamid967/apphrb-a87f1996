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
import { listCommissions } from "@/lib/company-modules.functions";
import {
  createCommission,
  updateCommission,
  deleteCommission,
} from "@/lib/company-modules-write.functions";
import { listMyOrganizations } from "@/lib/organizations.functions";
import { listDeals } from "@/lib/company-modules.functions";

export const Route = createFileRoute("/_authenticated/dashboard/commissions")({
  head: () => ({ meta: [{ title: "العمولات — لوحة التحكم" }] }),
  component: CommissionsPage,
});

type C = {
  id: string;
  percent: number | null;
  amount: number | null;
  currency: string | null;
  status: string | null;
  paid_at: string | null;
  notes: string | null;
  deal_id: string | null;
  agent_id: string | null;
  created_at: string;
};

type FormState = {
  id?: string;
  deal_id: string;
  percent: string;
  amount: string;
  currency: string;
  status: "pending" | "invoiced" | "paid";
  paid_at: string;
  notes: string;
};

const EMPTY: FormState = {
  deal_id: "",
  percent: "",
  amount: "",
  currency: "SAR",
  status: "pending",
  paid_at: "",
  notes: "",
};

function CommissionsPage() {
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

  const dealsQ = useQuery({
    queryKey: ["deals-picklist", orgId],
    queryFn: () => listDeals({ data: { org_id: orgId! } }),
    enabled: !!orgId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["commissions"] });

  const createM = useMutation({
    mutationFn: (v: FormState) =>
      createCommission({
        data: {
          org_id: orgId!,
          deal_id: v.deal_id,
          percent: v.percent ? Number(v.percent) : undefined,
          amount: v.amount ? Number(v.amount) : undefined,
          currency: v.currency || "SAR",
          status: v.status,
          paid_at: v.paid_at || undefined,
          notes: v.notes || undefined,
        },
      }),
    onSuccess: () => {
      toast.success(isAr ? "تم حفظ العمولة" : "Commission saved");
      setOpen(false);
      setForm(EMPTY);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateM = useMutation({
    mutationFn: (v: FormState) =>
      updateCommission({
        data: {
          id: v.id!,
          percent: v.percent ? Number(v.percent) : undefined,
          amount: v.amount ? Number(v.amount) : undefined,
          currency: v.currency || undefined,
          status: v.status,
          paid_at: v.paid_at || undefined,
          notes: v.notes || undefined,
        },
      }),
    onSuccess: () => {
      toast.success(isAr ? "تم التحديث" : "Updated");
      setOpen(false);
      setForm(EMPTY);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteCommission({ data: { id } }),
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
  const openEdit = (r: C) => {
    setForm({
      id: r.id,
      deal_id: r.deal_id ?? "",
      percent: r.percent != null ? String(r.percent) : "",
      amount: r.amount != null ? String(r.amount) : "",
      currency: r.currency ?? "SAR",
      status: (r.status as FormState["status"]) ?? "pending",
      paid_at: r.paid_at ? r.paid_at.slice(0, 10) : "",
      notes: r.notes ?? "",
    });
    setOpen(true);
  };

  const submit = () => {
    if (!orgId) return toast.error(isAr ? "لا توجد شركة" : "No company");
    if (!form.id && !form.deal_id)
      return toast.error(isAr ? "يجب اختيار صفقة" : "Deal is required");
    if (!form.percent && !form.amount)
      return toast.error(isAr ? "أدخل نسبة أو مبلغاً" : "Enter percent or amount");
    if (form.id) updateM.mutate(form);
    else createM.mutate(form);
  };

  return (
    <>
      <CompanyListPage<C>
        titleAr="العمولات"
        titleEn="Commissions"
        descAr="عمولات الوسطاء وحالة صرفها"
        descEn="Broker commissions and disbursement status"
        queryKey="commissions"
        listFn={listCommissions}
        onCreate={openCreate}
        columns={[
          {
            key: "percent",
            labelAr: "النسبة",
            labelEn: "Percent",
            render: (r) => (r.percent != null ? `${r.percent}%` : "—"),
          },
          {
            key: "amount",
            labelAr: "المبلغ",
            labelEn: "Amount",
            render: (r) => (
              <span className="font-medium tabular-nums">
                {r.amount != null
                  ? `${Number(r.amount).toLocaleString()} ${r.currency ?? "SAR"}`
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
            labelAr: "تاريخ الصرف",
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
                    if (confirm(isAr ? "حذف العمولة؟" : "Delete commission?"))
                      deleteM.mutate(r.id);
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {form.id
                ? isAr
                  ? "تعديل العمولة"
                  : "Edit Commission"
                : isAr
                  ? "عمولة جديدة"
                  : "New Commission"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            {!form.id && (
              <div className="grid gap-1.5">
                <Label>{isAr ? "الصفقة *" : "Deal *"}</Label>
                <Select
                  value={form.deal_id}
                  onValueChange={(v) => setForm({ ...form, deal_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={isAr ? "اختر صفقة" : "Choose a deal"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(dealsQ.data ?? []).map((d: any) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.id.slice(0, 8)} —{" "}
                        {d.agreed_amount ?? d.offer_amount ?? 0} {d.currency ?? "SAR"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>{isAr ? "النسبة %" : "Percent %"}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.percent}
                  onChange={(e) => setForm({ ...form, percent: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>{isAr ? "المبلغ" : "Amount"}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label>{isAr ? "العملة" : "Currency"}</Label>
                <Input
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
                  maxLength={3}
                />
              </div>
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
                    <SelectItem value="pending">{isAr ? "معلّق" : "Pending"}</SelectItem>
                    <SelectItem value="invoiced">{isAr ? "مفوتر" : "Invoiced"}</SelectItem>
                    <SelectItem value="paid">{isAr ? "مدفوع" : "Paid"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>{isAr ? "تاريخ الصرف" : "Paid at"}</Label>
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
