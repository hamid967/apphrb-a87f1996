import { t } from "@/lib/i18n";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { detailHead } from "@/lib/detail-og-head";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import { listMyOrganizations } from "@/lib/organizations.functions";
import {
  createCommission,
  deleteCommission,
  deleteDeal,
  getDeal,
  listCommissions,
  updateCommission,
  updateDeal,
} from "@/lib/deals.functions";
import { listActivitiesForLead } from "@/lib/lead-activities.functions";
import { can, type OrgRole } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/dashboard/crm/deals/$id")({
  head: ({ params }) => detailHead({ entityAr: 'صفقة', entityEn: 'Deal', id: String(params.id), path: `/dashboard/crm/deals/${params.id}`, kind: 'article' }),
  component: DealDetailPage,
});

type DealStatus = "offer" | "counter" | "accepted" | "contract" | "closed" | "cancelled";
const STATUSES: DealStatus[] = ["offer", "counter", "accepted", "contract", "closed", "cancelled"];
type CommissionStatus = "pending" | "invoiced" | "paid";
const COMMISSION_STATUSES: CommissionStatus[] = ["pending", "invoiced", "paid"];

const statusTone: Record<DealStatus, string> = {
  offer: "bg-muted text-foreground",
  counter: "bg-warning/20 text-warning",
  accepted: "bg-primary/15 text-primary",
  contract: "bg-primary/25 text-primary",
  closed: "bg-success/20 text-success",
  cancelled: "bg-destructive/15 text-destructive",
};

function DealDetailPage() {
  const { id } = Route.useParams();
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const nav = useNavigate();
  const qc = useQueryClient();

  const orgsQ = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });
  const role = orgsQ.data?.[0]?.role as OrgRole | undefined;
  const canEdit = can.editDeal(role);
  const canDelete = can.deleteDeal(role);

  const dealQ = useQuery({ queryKey: ["deal", id], queryFn: () => getDeal({ data: { id } }) });
  const commQ = useQuery({
    queryKey: ["commissions", id],
    queryFn: () => listCommissions({ data: { deal_id: id } }),
  });
  const leadId = (dealQ.data as any)?.lead_id as string | null | undefined;
  const leadActivitiesQ = useQuery({
    queryKey: ["lead-activities", leadId],
    queryFn: () => listActivitiesForLead({ data: { lead_id: leadId! } }),
    enabled: !!leadId,
  });

  const [editOpen, setEditOpen] = useState(false);
  const [addCommOpen, setAddCommOpen] = useState(false);

  const del = useMutation({
    mutationFn: () => deleteDeal({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      nav({ to: "/dashboard/crm/deals" });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  if (dealQ.isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">{t("common.loading")}</div>;
  }
  if (dealQ.error || !dealQ.data) {
    return <div className="p-8 text-sm text-destructive">Failed to load deal.</div>;
  }
  const deal = dealQ.data as any;
  const commissions = (commQ.data ?? []) as any[];
  const totalCommission = commissions.reduce((s, c) => s + Number(c.amount ?? 0), 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link
        to="/dashboard/crm/deals"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        {isAr ? <ArrowRight className="size-4" /> : <ArrowLeft className="size-4" />}
        {t("crm.deals.backToList")}
      </Link>

      <div className="overflow-hidden rounded-3xl border bg-card">
        {deal.property?.cover_image_url && (
          <div className="aspect-[16/6] w-full overflow-hidden bg-muted">
            <img src={deal.property.cover_image_url} alt="" className="size-full object-cover" />
          </div>
        )}
        <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-start">
          <div className="min-w-0">
            <Badge className={`border-0 ${statusTone[deal.status as DealStatus]}`}>
              {t(`crm.deals.statuses.${deal.status}`)}
            </Badge>
            <h1 className="mt-2 truncate text-2xl font-semibold tracking-tight sm:text-3xl">
              {isAr ? deal.property?.title_ar : deal.property?.title_en}
            </h1>
            <div className="mt-1 text-sm text-muted-foreground">
              {deal.contact?.full_name} · {deal.property?.city}
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Stat
                label={t("crm.deals.offerAmount")}
                value={fmt(deal.offer_amount, deal.currency)}
              />
              <Stat
                label={t("crm.deals.agreedAmount")}
                value={fmt(deal.agreed_amount, deal.currency)}
              />
              <Stat label={t("crm.deals.offerDate")} value={deal.offer_date ?? "—"} />
              <Stat label={t("crm.deals.closeDate")} value={deal.close_date ?? "—"} />
            </div>

            {deal.notes && (
              <p className="mt-6 whitespace-pre-wrap text-sm text-foreground/80">{deal.notes}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {deal.contract_url && (
              <a href={deal.contract_url} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm">
                  <ExternalLink className="me-2 size-4" />
                  {t("crm.deals.openContract")}
                </Button>
              </a>
            )}
            {canEdit && (
              <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil className="me-2 size-4" />
                {t("common.edit")}
              </Button>
            )}
            {canDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="destructive">
                    <Trash2 className="me-2 size-4" />
                    {t("common.delete")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("crm.deals.confirmDelete")}</AlertDialogTitle>
                    <AlertDialogDescription>&nbsp;</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => del.mutate()}>
                      {t("common.delete")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </div>

      {/* Commissions */}
      <div className="mt-8">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              {t("crm.deals.commissions.title")}
            </h2>
            <div className="text-sm text-muted-foreground">
              {t("crm.deals.commissions.totals")}:{" "}
              <b className="tabular-nums">
                {totalCommission.toLocaleString()} {deal.currency}
              </b>
            </div>
          </div>
          {canEdit && (
            <Button size="sm" onClick={() => setAddCommOpen(true)}>
              <Plus className="me-2 size-4" />
              {t("crm.deals.commissions.add")}
            </Button>
          )}
        </div>

        <div className="mt-4 divide-y surface-card">
          {commQ.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">{t("common.loading")}</div>
          ) : commissions.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {t("crm.deals.commissions.empty")}
            </div>
          ) : (
            commissions.map((c) => (
              <CommissionRow
                key={c.id}
                row={c}
                canEdit={canEdit}
                canDelete={canDelete}
                dealId={id}
                onChange={() => qc.invalidateQueries({ queryKey: ["commissions", id] })}
              />
            ))
          )}
        </div>
      </div>

      {leadId && (
        <div className="mt-8">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">
                {String(t("crm.deals.leadHistory", "Linked lead history"))}
              </h2>
              <div className="text-sm text-muted-foreground">
                <Link to="/dashboard/crm/leads/$id" params={{ id: leadId }} className="hover:underline">
                  {String(t("crm.leads.viewDetail", "View lead"))} →
                </Link>
              </div>
            </div>
          </div>
          <div className="surface-card mt-4">
            {leadActivitiesQ.isLoading ? (
              <div className="p-6 text-sm text-muted-foreground">{t("common.loading")}</div>
            ) : (leadActivitiesQ.data ?? []).length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">
                {String(t("crm.deals.noLeadHistory", "No activity recorded on this lead."))}
              </div>
            ) : (
              <ul className="divide-y">
                {(leadActivitiesQ.data ?? []).map((a: any) => (
                  <li key={a.id} className="flex gap-3 p-3 text-sm">
                    <div className="w-24 shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
                      {a.activity_type}
                    </div>
                    <div className="min-w-0 flex-1">
                      {a.from_stage || a.to_stage ? (
                        <div className="text-xs text-muted-foreground">
                          {a.from_stage ?? "—"} → {a.to_stage ?? "—"}
                        </div>
                      ) : null}
                      {a.body && (
                        <div className="whitespace-pre-wrap text-foreground/80">{a.body}</div>
                      )}
                    </div>
                    <div className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {new Date(a.created_at).toLocaleString()}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}


      <EditDealDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        deal={deal}
        onSaved={() => qc.invalidateQueries({ queryKey: ["deal", id] })}
      />
      <CommissionDialog
        open={addCommOpen}
        onOpenChange={setAddCommOpen}
        dealId={id}
        defaultCurrency={deal.currency}
        onSaved={() => qc.invalidateQueries({ queryKey: ["commissions", id] })}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-background p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium tabular-nums">{value}</div>
    </div>
  );
}

function fmt(v: number | null | undefined, ccy: string) {
  if (v == null) return "—";
  return `${Number(v).toLocaleString()} ${ccy}`;
}

function EditDealDialog({
  open,
  onOpenChange,
  deal,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  deal: any;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    status: deal.status as DealStatus,
    offer_amount: deal.offer_amount?.toString() ?? "",
    agreed_amount: deal.agreed_amount?.toString() ?? "",
    currency: deal.currency ?? "SAR",
    offer_date: deal.offer_date ?? "",
    close_date: deal.close_date ?? "",
    contract_url: deal.contract_url ?? "",
    notes: deal.notes ?? "",
  });
  const save = useMutation({
    mutationFn: () =>
      updateDeal({
        data: {
          id: deal.id,
          status: form.status,
          offer_amount: form.offer_amount ? Number(form.offer_amount) : null,
          agreed_amount: form.agreed_amount ? Number(form.agreed_amount) : null,
          currency: form.currency,
          offer_date: form.offer_date || null,
          close_date: form.close_date || null,
          contract_url: form.contract_url || null,
          notes: form.notes || null,
        },
      }),
    onSuccess: () => {
      toast.success("Saved");
      onSaved();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("crm.deals.edit")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>{t("crm.deals.status")}</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as DealStatus })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`crm.deals.statuses.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("crm.deals.currency")}</Label>
              <Input
                value={form.currency}
                maxLength={6}
                onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>{t("crm.deals.offerAmount")}</Label>
              <Input
                type="number"
                min={0}
                value={form.offer_amount}
                onChange={(e) => setForm({ ...form, offer_amount: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("crm.deals.agreedAmount")}</Label>
              <Input
                type="number"
                min={0}
                value={form.agreed_amount}
                onChange={(e) => setForm({ ...form, agreed_amount: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>{t("crm.deals.offerDate")}</Label>
              <Input
                type="date"
                value={form.offer_date}
                onChange={(e) => setForm({ ...form, offer_date: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("crm.deals.closeDate")}</Label>
              <Input
                type="date"
                value={form.close_date}
                onChange={(e) => setForm({ ...form, close_date: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>{t("crm.deals.contractUrl")}</Label>
            <Input
              type="url"
              value={form.contract_url}
              onChange={(e) => setForm({ ...form, contract_url: e.target.value })}
            />
          </div>
          <div>
            <Label>{t("crm.deals.notes")}</Label>
            <Textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {t("crm.deals.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CommissionRow({
  row,
  canEdit,
  canDelete,
  dealId,
  onChange,
}: {
  row: any;
  canEdit: boolean;
  canDelete: boolean;
  dealId: string;
  onChange: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const del = useMutation({
    mutationFn: () => deleteCommission({ data: { id: row.id } }),
    onSuccess: () => {
      toast.success("Deleted");
      onChange();
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });
  return (
    <div className="flex flex-wrap items-center gap-3 p-4 text-sm">
      <div className="min-w-0 flex-1">
        <div className="font-medium tabular-nums">
          {Number(row.amount ?? 0).toLocaleString()} {row.currency}
          {row.percent != null && (
            <span className="ms-2 text-xs text-muted-foreground">({row.percent}%)</span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {row.agent_id ? `${t("crm.deals.commissions.agent")}: ${row.agent_id.slice(0, 8)}` : "—"}
          {row.paid_at ? ` · ${t("crm.deals.commissions.paidAt")} ${row.paid_at}` : ""}
        </div>
      </div>
      <Badge variant="secondary">{t(`crm.deals.commissions.statuses.${row.status}`)}</Badge>
      <div className="flex gap-1">
        {canEdit && (
          <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
            <Pencil className="size-3.5" />
          </Button>
        )}
        {canDelete && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (window.confirm(t("crm.deals.commissions.confirmDelete"))) del.mutate();
            }}
          >
            <Trash2 className="size-3.5 text-destructive" />
          </Button>
        )}
      </div>
      <CommissionDialog
        open={open}
        onOpenChange={setOpen}
        dealId={dealId}
        initial={row}
        defaultCurrency={row.currency}
        onSaved={onChange}
      />
    </div>
  );
}

function CommissionDialog({
  open,
  onOpenChange,
  dealId,
  initial,
  defaultCurrency,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dealId: string;
  initial?: any;
  defaultCurrency: string;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    agent_id: initial?.agent_id ?? "",
    percent: initial?.percent?.toString() ?? "",
    amount: initial?.amount?.toString() ?? "",
    currency: initial?.currency ?? defaultCurrency,
    status: (initial?.status ?? "pending") as CommissionStatus,
    paid_at: initial?.paid_at ?? "",
    notes: initial?.notes ?? "",
  });
  const save = useMutation<any, Error, void>({
    mutationFn: async () => {
      const payload = {
        agent_id: form.agent_id || null,
        percent: form.percent ? Number(form.percent) : null,
        amount: form.amount ? Number(form.amount) : null,
        currency: form.currency,
        status: form.status,
        paid_at: form.paid_at || null,
        notes: form.notes || null,
      };
      return initial
        ? updateCommission({ data: { id: initial.id, ...payload } })
        : createCommission({ data: { deal_id: dealId, ...payload } });
    },
    onSuccess: () => {
      toast.success("Saved");
      onSaved();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {initial ? t("crm.deals.commissions.edit") : t("crm.deals.commissions.create")}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>{t("crm.deals.commissions.agent")}</Label>
            <Input
              value={form.agent_id}
              placeholder="uuid"
              onChange={(e) => setForm({ ...form, agent_id: e.target.value })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>{t("crm.deals.commissions.percent")}</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={form.percent}
                onChange={(e) => setForm({ ...form, percent: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("crm.deals.commissions.amount")}</Label>
              <Input
                type="number"
                min={0}
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("crm.deals.commissions.currency")}</Label>
              <Input
                value={form.currency}
                maxLength={6}
                onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>{t("crm.deals.commissions.status")}</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as CommissionStatus })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMMISSION_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`crm.deals.commissions.statuses.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("crm.deals.commissions.paidAt")}</Label>
              <Input
                type="date"
                value={form.paid_at}
                onChange={(e) => setForm({ ...form, paid_at: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>{t("crm.deals.commissions.notes")}</Label>
            <Textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {t("crm.deals.commissions.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
