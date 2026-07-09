import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Pencil, ArrowRight, ArrowLeft, Handshake, Upload } from "lucide-react";
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
import {
  createLead,
  deleteLead,
  importLeads,
  listContacts,
  listLeads,
  updateLead,
} from "@/lib/crm.functions";
import { convertLeadToDeal } from "@/lib/deals.functions";
import { can, type OrgRole } from "@/lib/permissions";
import { CsvImportDialog } from "@/components/csv-import-dialog";

export const Route = createFileRoute("/_authenticated/leads/")({
  component: LeadsPage,
});

type Stage = "new" | "contacted" | "qualified" | "viewing" | "negotiation" | "won" | "lost";
const STAGES: Stage[] = ["new", "contacted", "qualified", "viewing", "negotiation", "won", "lost"];

type Lead = {
  id: string;
  org_id: string;
  contact_id: string;
  property_id: string | null;
  stage: Stage;
  source: string | null;
  budget_min: number | null;
  budget_max: number | null;
  currency: string;
  notes: string | null;
  contact?: { id: string; full_name: string; email: string | null; phone: string | null } | null;
  property?: { id: string; title_ar: string; title_en: string } | null;
};

function LeadsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const orgsQ = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });
  const membership = orgsQ.data?.[0];
  const org = membership?.org;
  const role = membership?.role as OrgRole | undefined;
  const canEdit = can.editCRM(role);
  const canDelete = can.deleteCRM(role);

  const leadsQ = useQuery({
    queryKey: ["leads", org?.id],
    queryFn: () => listLeads({ data: { org_id: org!.id } }),
    enabled: !!org,
  });
  const contactsQ = useQuery({
    queryKey: ["contacts", org?.id],
    queryFn: () => listContacts({ data: { org_id: org!.id } }),
    enabled: !!org,
  });
  const propsQ = useQuery({
    queryKey: ["properties", org?.id],
    queryFn: () => listProperties({ data: { org_id: org!.id } }),
    enabled: !!org,
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const grouped = useMemo(() => {
    const map: Record<Stage, Lead[]> = {
      new: [],
      contacted: [],
      qualified: [],
      viewing: [],
      negotiation: [],
      won: [],
      lost: [],
    };
    for (const l of (leadsQ.data ?? []) as Lead[]) map[l.stage]?.push(l);
    return map;
  }, [leadsQ.data]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["leads", org?.id] });

  const move = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: Stage }) =>
      updateLead({ data: { id, stage } }),
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteLead({ data: { id } }),
    onSuccess: () => {
      invalidate();
      toast.success("Deleted");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const convert = useMutation({
    mutationFn: (lead: Lead) => {
      if (!lead.property_id) throw new Error(t("crm.leads.needsProperty"));
      return convertLeadToDeal({
        data: {
          lead_id: lead.id,
          offer_amount: lead.budget_max ?? lead.budget_min ?? null,
          currency: lead.currency,
        },
      });
    },
    onSuccess: (res) => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["deals", org?.id] });
      toast.success(t("crm.leads.convert"));
      navigate({ to: "/deals/$id", params: { id: res.id } });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("crm.leads.title")}
        </h1>
        {canEdit && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="me-2 size-4" /> {t("csv.importLeads")}
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <Plus className="me-2 size-4" /> {t("crm.leads.add")}
            </Button>
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-3 xl:grid-cols-7">
        {STAGES.map((stage) => (
          <div key={stage} className="surface-card">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <div className="text-sm font-medium">{t(`crm.leads.stages.${stage}`)}</div>
              <Badge variant="secondary" className="tabular-nums">
                {grouped[stage].length}
              </Badge>
            </div>
            <div className="max-h-[70vh] space-y-2 overflow-y-auto p-2">
              {grouped[stage].length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                  {t("crm.leads.empty")}
                </div>
              ) : (
                grouped[stage].map((lead) => {
                  const idx = STAGES.indexOf(stage);
                  const prev = idx > 0 ? STAGES[idx - 1] : null;
                  const next = idx < STAGES.length - 1 ? STAGES[idx + 1] : null;
                  return (
                    <div
                      key={lead.id}
                      className="rounded-lg border bg-background p-3 text-sm shadow-sm"
                    >
                      <Link
                        to="/leads/$id"
                        params={{ id: lead.id }}
                        className="block truncate font-medium hover:underline"
                      >
                        {lead.contact?.full_name ?? "—"}
                      </Link>
                      {lead.property && (
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">
                          {isAr ? lead.property.title_ar : lead.property.title_en}
                        </div>
                      )}
                      {(lead.budget_min != null || lead.budget_max != null) && (
                        <div className="mt-1 text-xs tabular-nums text-muted-foreground">
                          {lead.budget_min?.toLocaleString() ?? "0"} –{" "}
                          {lead.budget_max?.toLocaleString() ?? "∞"} {lead.currency}
                        </div>
                      )}
                      {lead.source && (
                        <div className="mt-1 text-xs text-muted-foreground">· {lead.source}</div>
                      )}
                      {canEdit && (
                        <div className="mt-2 flex items-center justify-between gap-1">
                          <div className="flex gap-1">
                            {prev && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2"
                                onClick={() => move.mutate({ id: lead.id, stage: prev })}
                              >
                                {isAr ? (
                                  <ArrowRight className="size-3.5" />
                                ) : (
                                  <ArrowLeft className="size-3.5" />
                                )}
                              </Button>
                            )}
                            {next && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2"
                                onClick={() => move.mutate({ id: lead.id, stage: next })}
                              >
                                {isAr ? (
                                  <ArrowLeft className="size-3.5" />
                                ) : (
                                  <ArrowRight className="size-3.5" />
                                )}
                              </Button>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2"
                              onClick={() => {
                                setEditing(lead);
                                setOpen(true);
                              }}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            {canEdit && lead.property_id && stage !== "won" && stage !== "lost" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2"
                                title={t("crm.leads.convert")}
                                disabled={convert.isPending}
                                onClick={() => {
                                  if (window.confirm(t("crm.leads.convertHint")))
                                    convert.mutate(lead);
                                }}
                              >
                                <Handshake className="size-3.5" />
                              </Button>
                            )}
                            {canDelete && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2"
                                onClick={() => {
                                  if (window.confirm(t("crm.leads.confirmDelete")))
                                    del.mutate(lead.id);
                                }}
                              >
                                <Trash2 className="size-3.5 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>

      {org && (
        <LeadDialog
          open={open}
          onOpenChange={setOpen}
          orgId={org.id}
          initial={editing}
          contacts={(contactsQ.data ?? []) as { id: string; full_name: string }[]}
          properties={(propsQ.data ?? []) as { id: string; title_ar: string; title_en: string }[]}
          onSaved={invalidate}
        />
      )}
      {org && (
        <CsvImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          title={t("csv.importLeads")}
          templateHeaders={[
            "contact_email",
            "contact_phone",
            "contact_name",
            "stage",
            "source",
            "budget_min",
            "budget_max",
            "currency",
            "notes",
          ]}
          sampleRow={{
            contact_email: "sara@example.com",
            contact_phone: "",
            contact_name: "",
            stage: "new",
            source: "website",
            budget_min: "500000",
            budget_max: "900000",
            currency: "SAR",
            notes: "",
          }}
          onImport={(rows) => importLeads({ data: { org_id: org.id, rows } })}
          onDone={invalidate}
        />
      )}
    </div>
  );
}

function LeadDialog({
  open,
  onOpenChange,
  orgId,
  initial,
  contacts,
  properties,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgId: string;
  initial: Lead | null;
  contacts: { id: string; full_name: string }[];
  properties: { id: string; title_ar: string; title_en: string }[];
  onSaved: () => void;
}) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const [form, setForm] = useState({
    contact_id: initial?.contact_id ?? "",
    property_id: initial?.property_id ?? "",
    stage: (initial?.stage ?? "new") as Stage,
    source: initial?.source ?? "",
    budget_min: initial?.budget_min?.toString() ?? "",
    budget_max: initial?.budget_max?.toString() ?? "",
    currency: initial?.currency ?? "SAR",
    notes: initial?.notes ?? "",
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        stage: form.stage,
        source: form.source || null,
        budget_min: form.budget_min ? Number(form.budget_min) : null,
        budget_max: form.budget_max ? Number(form.budget_max) : null,
        currency: form.currency,
        notes: form.notes || null,
        property_id: form.property_id || null,
      };
      if (initial) {
        return updateLead({ data: { id: initial.id, ...payload } });
      }
      if (!form.contact_id) throw new Error("Contact required");
      return createLead({ data: { org_id: orgId, contact_id: form.contact_id, ...payload } });
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
          <DialogTitle>{initial ? t("crm.leads.edit") : t("crm.leads.create")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          {!initial && (
            <div>
              <Label>{t("crm.leads.contact")}</Label>
              <Select
                value={form.contact_id}
                onValueChange={(v) => setForm({ ...form, contact_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("crm.leads.pickContact")} />
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
          )}
          <div>
            <Label>{t("crm.leads.property")}</Label>
            <Select
              value={form.property_id || "__none__"}
              onValueChange={(v) => setForm({ ...form, property_id: v === "__none__" ? "" : v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t("crm.leads.pickProperty")}</SelectItem>
                {properties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {isAr ? p.title_ar : p.title_en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>{t("crm.leads.stage")}</Label>
              <Select
                value={form.stage}
                onValueChange={(v) => setForm({ ...form, stage: v as Stage })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`crm.leads.stages.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("crm.leads.source")}</Label>
              <Input
                value={form.source ?? ""}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>{t("crm.leads.budgetMin")}</Label>
              <Input
                type="number"
                min={0}
                value={form.budget_min}
                onChange={(e) => setForm({ ...form, budget_min: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("crm.leads.budgetMax")}</Label>
              <Input
                type="number"
                min={0}
                value={form.budget_max}
                onChange={(e) => setForm({ ...form, budget_max: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("crm.leads.currency")}</Label>
              <Input
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
                maxLength={6}
              />
            </div>
          </div>
          <div>
            <Label>{t("crm.leads.notes")}</Label>
            <Textarea
              rows={3}
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || (!initial && !form.contact_id)}
          >
            {initial ? t("crm.contacts.save") : t("crm.leads.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
