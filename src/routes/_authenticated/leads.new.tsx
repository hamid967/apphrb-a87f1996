import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
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
import { listMyOrganizations } from "@/lib/organizations.functions";
import { createLead, listContacts } from "@/lib/crm.functions";

export const Route = createFileRoute("/_authenticated/leads/new")({
  component: NewLeadPage,
});

const STAGES = ["new", "contacted", "qualified", "viewing", "negotiation", "won", "lost"] as const;
type Stage = (typeof STAGES)[number];

function NewLeadPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const orgsQ = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });
  const org = orgsQ.data?.[0]?.org;
  const contactsQ = useQuery({
    queryKey: ["contacts", org?.id],
    queryFn: () => listContacts({ data: { org_id: org!.id } }),
    enabled: !!org,
  });

  const [form, setForm] = useState({
    contact_id: "",
    stage: "new" as Stage,
    source: "",
    budget_min: "",
    budget_max: "",
    currency: "SAR",
    notes: "",
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!org) throw new Error("No org");
      if (!form.contact_id) throw new Error(String(t("crm.leads.pickContact", "Select contact")));
      return createLead({
        data: {
          org_id: org.id,
          contact_id: form.contact_id,
          stage: form.stage,
          source: form.source || null,
          budget_min: form.budget_min ? Number(form.budget_min) : null,
          budget_max: form.budget_max ? Number(form.budget_max) : null,
          currency: form.currency,
          notes: form.notes || null,
        },
      });
    },
    onSuccess: (row) => {
      toast.success(String(t("common.saved", "Saved")));
      navigate({ to: "/leads/$id/edit", params: { id: row.id } });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{String(t("crm.leads.create", "New lead"))}</h1>
        <Button variant="ghost" asChild>
          <Link to="/leads">
            <ArrowLeft className="me-2 size-4" />
            {String(t("common.back", "Back"))}
          </Link>
        </Button>
      </div>

      <form
        className="surface-card grid gap-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div>
          <Label>{String(t("crm.leads.contact", "Contact"))}</Label>
          <Select
            value={form.contact_id}
            onValueChange={(v) => setForm({ ...form, contact_id: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder={String(t("crm.leads.pickContact", "Select contact"))} />
            </SelectTrigger>
            <SelectContent>
              {(contactsQ.data ?? []).map((c: any) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>{String(t("crm.leads.stage", "Stage"))}</Label>
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
                    {String(t(`crm.leads.stages.${s}`, s))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{String(t("crm.leads.source", "Source"))}</Label>
            <Input
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
              placeholder="website / whatsapp / referral"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label>{String(t("crm.leads.budgetMin", "Min budget"))}</Label>
            <Input
              type="number"
              min="0"
              value={form.budget_min}
              onChange={(e) => setForm({ ...form, budget_min: e.target.value })}
            />
          </div>
          <div>
            <Label>{String(t("crm.leads.budgetMax", "Max budget"))}</Label>
            <Input
              type="number"
              min="0"
              value={form.budget_max}
              onChange={(e) => setForm({ ...form, budget_max: e.target.value })}
            />
          </div>
          <div>
            <Label>{String(t("crm.leads.currency", "Currency"))}</Label>
            <Input
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
            />
          </div>
        </div>

        <div>
          <Label>{String(t("crm.leads.notes", "Notes"))}</Label>
          <Textarea
            rows={4}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => navigate({ to: "/leads" })}>
            {String(t("common.cancel", "Cancel"))}
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending
              ? String(t("common.saving", "Saving..."))
              : String(t("common.save", "Save"))}
          </Button>
        </div>
      </form>
    </div>
  );
}
