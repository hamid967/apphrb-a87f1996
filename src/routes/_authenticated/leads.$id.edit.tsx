import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Check, Handshake, Loader2 } from "lucide-react";
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
import { updateLead } from "@/lib/crm.functions";
import { getLeadDetail } from "@/lib/lead-activities.functions";
import { ConvertLeadDialog } from "@/components/crm/ConvertLeadDialog";

export const Route = createFileRoute("/_authenticated/leads/$id/edit")({
  component: EditLeadPage,
});

const STAGES = ["new", "contacted", "qualified", "viewing", "negotiation", "won", "lost"] as const;
type Stage = (typeof STAGES)[number];

type FormState = {
  stage: Stage;
  source: string;
  budget_min: string;
  budget_max: string;
  currency: string;
  notes: string;
};

function EditLeadPage() {
  const { id } = Route.useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const detailQ = useQuery({
    queryKey: ["lead-detail", id],
    queryFn: () => getLeadDetail({ data: { id } }),
  });
  const lead = detailQ.data?.lead as any;

  const [form, setForm] = useState<FormState | null>(null);
  const [convertOpen, setConvertOpen] = useState(false);
  useEffect(() => {
    if (lead && !form) {
      setForm({
        stage: (lead.stage ?? "new") as Stage,
        source: lead.source ?? "",
        budget_min: lead.budget_min?.toString() ?? "",
        budget_max: lead.budget_max?.toString() ?? "",
        currency: lead.currency ?? "SAR",
        notes: lead.notes ?? "",
      });
    }
  }, [lead, form]);

  const save = useMutation({
    mutationFn: async (patch: Partial<FormState>) =>
      updateLead({
        data: {
          id,
          ...(patch.stage != null && { stage: patch.stage }),
          ...(patch.source !== undefined && { source: patch.source || null }),
          ...(patch.budget_min !== undefined && {
            budget_min: patch.budget_min ? Number(patch.budget_min) : null,
          }),
          ...(patch.budget_max !== undefined && {
            budget_max: patch.budget_max ? Number(patch.budget_max) : null,
          }),
          ...(patch.currency != null && { currency: patch.currency }),
          ...(patch.notes !== undefined && { notes: patch.notes || null }),
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead-detail", id] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  // Debounced autosave
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const patch = (p: Partial<FormState>) => {
    if (!form) return;
    setForm({ ...form, ...p });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save.mutate(p), 500);
  };
  const patchNow = (p: Partial<FormState>) => {
    if (!form) return;
    setForm({ ...form, ...p });
    if (timer.current) clearTimeout(timer.current);
    save.mutate(p);
  };

  if (detailQ.isLoading || !form) {
    return <div className="p-8 text-sm text-muted-foreground">…</div>;
  }
  if (detailQ.error) {
    return <div className="p-8 text-sm text-destructive">{(detailQ.error as any).message}</div>;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{String(t("crm.leads.edit", "Edit lead"))}</h1>
          <div className="mt-0.5 text-sm text-muted-foreground">
            {lead?.contact?.full_name ?? "—"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SaveIndicator pending={save.isPending} savedAt={save.submittedAt ?? 0} />
          {lead?.stage !== "won" && lead?.stage !== "lost" && (
            <Button size="sm" onClick={() => setConvertOpen(true)}>
              <Handshake className="me-2 size-4" />
              {String(t("crm.leads.convert", "Convert to deal"))}
            </Button>
          )}
          <Button variant="ghost" asChild>
            <Link to="/leads">
              <ArrowLeft className="me-2 size-4" />
              {String(t("common.back", "Back"))}
            </Link>
          </Button>
        </div>
      </div>

      <div className="surface-card grid gap-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>{String(t("crm.leads.stage", "Stage"))}</Label>
            <Select value={form.stage} onValueChange={(v) => patchNow({ stage: v as Stage })}>
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
            <Input value={form.source} onChange={(e) => patch({ source: e.target.value })} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label>{String(t("crm.leads.budgetMin", "Min budget"))}</Label>
            <Input
              type="number"
              min="0"
              value={form.budget_min}
              onChange={(e) => patch({ budget_min: e.target.value })}
            />
          </div>
          <div>
            <Label>{String(t("crm.leads.budgetMax", "Max budget"))}</Label>
            <Input
              type="number"
              min="0"
              value={form.budget_max}
              onChange={(e) => patch({ budget_max: e.target.value })}
            />
          </div>
          <div>
            <Label>{String(t("crm.leads.currency", "Currency"))}</Label>
            <Input
              value={form.currency}
              onChange={(e) => patch({ currency: e.target.value.toUpperCase() })}
            />
          </div>
        </div>

        <div>
          <Label>{String(t("crm.leads.notes", "Notes"))}</Label>
          <Textarea
            rows={5}
            value={form.notes}
            onChange={(e) => patch({ notes: e.target.value })}
          />
        </div>

        <div className="flex justify-end">
          <Button variant="ghost" onClick={() => navigate({ to: "/leads/$id", params: { id } })}>
            {String(t("crm.leads.viewDetail", "View detail"))} →
          </Button>
        </div>
      </div>
    </div>
  );
}

function SaveIndicator({ pending, savedAt }: { pending: boolean; savedAt: number }) {
  if (pending) {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> saving
      </span>
    );
  }
  if (savedAt > 0) {
    return (
      <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
        <Check className="size-3.5" /> saved
      </span>
    );
  }
  return null;
}
