import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Handshake } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { listProperties } from "@/lib/properties.functions";
import { listContacts, listLeads } from "@/lib/crm.functions";
import { createDeal, listDeals } from "@/lib/deals.functions";
import { can, type OrgRole } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/deals/")({
  component: DealsPage,
});

type DealStatus = "offer" | "counter" | "accepted" | "contract" | "closed" | "cancelled";
const STATUSES: DealStatus[] = ["offer", "counter", "accepted", "contract", "closed", "cancelled"];

type Deal = {
  id: string;
  org_id: string;
  property_id: string;
  primary_contact_id: string;
  lead_id: string | null;
  status: DealStatus;
  offer_amount: number | null;
  agreed_amount: number | null;
  currency: string;
  offer_date: string;
  close_date: string | null;
  property?: {
    id: string;
    title_ar: string;
    title_en: string;
    cover_image_url: string | null;
  } | null;
  contact?: { id: string; full_name: string } | null;
};

const statusTone: Record<DealStatus, string> = {
  offer: "bg-muted text-foreground",
  counter: "bg-warning/20 text-warning",
  accepted: "bg-primary/15 text-primary",
  contract: "bg-primary/25 text-primary",
  closed: "bg-success/20 text-success",
  cancelled: "bg-destructive/15 text-destructive",
};

function DealsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const qc = useQueryClient();
  const orgsQ = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });
  const membership = orgsQ.data?.[0];
  const org = membership?.org;
  const role = membership?.role as OrgRole | undefined;
  const canEdit = can.editDeal(role);

  const dealsQ = useQuery({
    queryKey: ["deals", org?.id],
    queryFn: () => listDeals({ data: { org_id: org!.id } }),
    enabled: !!org,
  });
  const propsQ = useQuery({
    queryKey: ["properties", org?.id],
    queryFn: () => listProperties({ data: { org_id: org!.id } }),
    enabled: !!org,
  });
  const contactsQ = useQuery({
    queryKey: ["contacts", org?.id],
    queryFn: () => listContacts({ data: { org_id: org!.id } }),
    enabled: !!org,
  });
  const leadsQ = useQuery({
    queryKey: ["leads", org?.id],
    queryFn: () => listLeads({ data: { org_id: org!.id } }),
    enabled: !!org,
  });

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<DealStatus | "all">("all");
  const [open, setOpen] = useState(false);

  const deals = (dealsQ.data ?? []) as Deal[];
  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return deals.filter((d) => {
      if (filter !== "all" && d.status !== filter) return false;
      if (!query) return true;
      const t1 = isAr ? d.property?.title_ar : d.property?.title_en;
      return (
        (t1 ?? "").toLowerCase().includes(query) ||
        (d.contact?.full_name ?? "").toLowerCase().includes(query)
      );
    });
  }, [deals, q, filter, isAr]);

  const totals = useMemo(() => {
    let pipeline = 0;
    let closed = 0;
    for (const d of deals) {
      const amt = Number(d.agreed_amount ?? d.offer_amount ?? 0);
      if (d.status === "closed") closed += amt;
      else if (d.status !== "cancelled") pipeline += amt;
    }
    return { pipeline, closed };
  }, [deals]);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("crm.deals.title")}
          </h1>
          <div className="mt-1 text-sm text-muted-foreground">
            {t("crm.deals.totalPipeline")}:{" "}
            <b className="tabular-nums">{totals.pipeline.toLocaleString()}</b>
            {" · "}
            {t("crm.deals.totalClosed")}:{" "}
            <b className="tabular-nums">{totals.closed.toLocaleString()}</b>
          </div>
        </div>
        {canEdit && (
          <Button onClick={() => setOpen(true)}>
            <Plus className="me-2 size-4" /> {t("crm.deals.add")}
          </Button>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("crm.deals.search")}
            className="ps-9"
          />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("crm.deals.filterAll")}</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`crm.deals.statuses.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-6 grid gap-3">
        {dealsQ.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl border bg-muted/30" />
          ))
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            <Handshake className="mx-auto mb-2 size-6 opacity-60" />
            {t("crm.deals.empty")}
          </div>
        ) : (
          filtered.map((d) => (
            <Link
              key={d.id}
              to="/deals/$id"
              params={{ id: d.id }}
              className="group flex items-center gap-4 surface-card p-4 transition hover:border-primary/40 hover:shadow-sm"
            >
              <div className="size-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                {d.property?.cover_image_url && (
                  <img src={d.property.cover_image_url} alt="" className="size-full object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">
                  {isAr ? d.property?.title_ar : d.property?.title_en}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {d.contact?.full_name ?? "—"}
                </div>
              </div>
              <div className="text-end">
                <div className="tabular-nums text-sm font-semibold">
                  {Number(d.agreed_amount ?? d.offer_amount ?? 0).toLocaleString()} {d.currency}
                </div>
                <Badge className={`mt-1 border-0 ${statusTone[d.status]}`}>
                  {t(`crm.deals.statuses.${d.status}`)}
                </Badge>
              </div>
            </Link>
          ))
        )}
      </div>

      {org && (
        <DealDialog
          open={open}
          onOpenChange={setOpen}
          orgId={org.id}
          properties={(propsQ.data ?? []) as any[]}
          contacts={(contactsQ.data ?? []) as any[]}
          leads={(leadsQ.data ?? []) as any[]}
          onSaved={() => qc.invalidateQueries({ queryKey: ["deals", org.id] })}
        />
      )}
    </div>
  );
}

function DealDialog({
  open,
  onOpenChange,
  orgId,
  properties,
  contacts,
  leads,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgId: string;
  properties: { id: string; title_ar: string; title_en: string }[];
  contacts: { id: string; full_name: string }[];
  leads: {
    id: string;
    contact_id: string;
    property_id: string | null;
    contact?: { full_name: string } | null;
  }[];
  onSaved: () => void;
}) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const [form, setForm] = useState({
    property_id: "",
    primary_contact_id: "",
    lead_id: "",
    status: "offer" as DealStatus,
    offer_amount: "",
    agreed_amount: "",
    currency: "SAR",
    offer_date: new Date().toISOString().slice(0, 10),
    close_date: "",
    contract_url: "",
    notes: "",
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.property_id || !form.primary_contact_id)
        throw new Error("Property & contact required");
      return createDeal({
        data: {
          org_id: orgId,
          property_id: form.property_id,
          primary_contact_id: form.primary_contact_id,
          lead_id: form.lead_id || null,
          status: form.status,
          offer_amount: form.offer_amount ? Number(form.offer_amount) : null,
          agreed_amount: form.agreed_amount ? Number(form.agreed_amount) : null,
          currency: form.currency,
          offer_date: form.offer_date || null,
          close_date: form.close_date || null,
          contract_url: form.contract_url || null,
          notes: form.notes || null,
        },
      });
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("crm.deals.create")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>{t("crm.deals.property")}</Label>
              <Select
                value={form.property_id}
                onValueChange={(v) => setForm({ ...form, property_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("crm.deals.pickProperty")} />
                </SelectTrigger>
                <SelectContent>
                  {properties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {isAr ? p.title_ar : p.title_en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("crm.deals.contact")}</Label>
              <Select
                value={form.primary_contact_id}
                onValueChange={(v) => setForm({ ...form, primary_contact_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("crm.deals.pickContact")} />
                </SelectTrigger>
                <SelectContent>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>{t("crm.deals.lead")}</Label>
              <Select
                value={form.lead_id || "__none__"}
                onValueChange={(v) => setForm({ ...form, lead_id: v === "__none__" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t("crm.deals.pickLead")}</SelectItem>
                  {leads.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.contact?.full_name ?? l.id.slice(0, 6)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
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
              placeholder="https://…"
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
            {t("crm.deals.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
