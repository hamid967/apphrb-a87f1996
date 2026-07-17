import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  MessageSquare,
  Phone,
  Mail,
  Sparkles,
  Trash2,
  ExternalLink,
  Download,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportRows } from "@/lib/export-rows";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addLeadActivity,
  getLeadDetail,
  removeMatch,
  suggestListingsForLead,
  updateMatchStatus,
} from "@/lib/lead-activities.functions";
import { updateLead } from "@/lib/crm.functions";

export const Route = createFileRoute("/_authenticated/leads/$id")({
  component: LeadDetailPage,
});

const STAGES = [
  "new",
  "contacted",
  "qualified",
  "viewing",
  "negotiation",
  "won",
  "lost",
] as const;
type Stage = (typeof STAGES)[number];
const ACTIVITY_KINDS = ["note", "call", "email", "whatsapp"] as const;
type Kind = (typeof ACTIVITY_KINDS)[number];

function LeadDetailPage() {
  const { id } = Route.useParams();
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const qc = useQueryClient();

  const detailQ = useQuery({
    queryKey: ["lead-detail", id],
    queryFn: () => getLeadDetail({ data: { id } }),
  });

  const [kind, setKind] = useState<Kind>("note");
  const [body, setBody] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["lead-detail", id] });

  const addAct = useMutation({
    mutationFn: () =>
      addLeadActivity({ data: { lead_id: id, activity_type: kind, body: body.trim() } }),
    onSuccess: () => {
      setBody("");
      invalidate();
      toast.success(t("common.saved", "Saved"));
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const stageMut = useMutation({
    mutationFn: (stage: Stage) => updateLead({ data: { id, stage } }),
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const suggest = useMutation({
    mutationFn: () => suggestListingsForLead({ data: { lead_id: id } }),
    onSuccess: (r) => {
      invalidate();
      toast.success(`+${r.count}`);
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const matchMut = useMutation({
    mutationFn: (v: { id: string; status: "sent" | "interested" | "rejected" }) =>
      updateMatchStatus({ data: v }),
    onSuccess: invalidate,
  });
  const delMatch = useMutation({
    mutationFn: (mid: string) => removeMatch({ data: { id: mid } }),
    onSuccess: invalidate,
  });

  if (detailQ.isLoading) return <div className="p-8 text-sm">…</div>;
  if (detailQ.isError || !detailQ.data)
    return <div className="p-8 text-sm text-destructive">{String(detailQ.error)}</div>;

  const { lead, activities, matches } = detailQ.data as any;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-4 flex items-center gap-2 text-sm">
        <Link to="/leads" className="text-muted-foreground hover:underline">
          {isAr ? <ArrowRight className="inline size-4" /> : <ArrowLeft className="inline size-4" />}{" "}
          {t("crm.leads.title", "Leads")}
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="surface-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold">{lead.contact?.full_name ?? "—"}</h1>
                <div className="mt-1 text-sm text-muted-foreground">
                  {lead.contact?.email ?? ""} {lead.contact?.phone ? `· ${lead.contact.phone}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{String(t(`crm.leads.stages.${lead.stage}`, { defaultValue: lead.stage }))}</Badge>
                <Select
                  value={lead.stage}
                  onValueChange={(v) => stageMut.mutate(v as Stage)}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {t(`crm.leads.stages.${s}`, s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {(lead.budget_min != null || lead.budget_max != null) && (
              <div className="mt-3 text-sm tabular-nums text-muted-foreground">
                {t("crm.leads.budget", "Budget")}:{" "}
                {(lead.budget_min ?? 0).toLocaleString()} – {(lead.budget_max ?? 0).toLocaleString()}{" "}
                {lead.currency}
              </div>
            )}
          </div>

          <div className="surface-card p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">
                {t("crm.leads.activity", "Activity")}
              </h2>
              <ExportMenu
                label={t("crm.leads.exportActivities")}
                disabled={activities.length === 0}
                onExport={(fmt) =>
                  exportRows(
                    `lead_${id}_activities`,
                    activities.map((a: any) => ({
                      created_at: a.created_at,
                      type: a.activity_type,
                      from_stage: a.from_stage ?? "",
                      to_stage: a.to_stage ?? "",
                      body: a.body ?? "",
                    })),
                    fmt,
                  )
                }
              />
            </div>

            <div className="mb-4 grid gap-2">
              <div className="flex gap-2">
                <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIVITY_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {k}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Textarea
                  className="flex-1"
                  rows={2}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={t("crm.leads.activityPlaceholder", "Log a note, call, email…")}
                />
              </div>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  disabled={!body.trim() || addAct.isPending}
                  onClick={() => addAct.mutate()}
                >
                  {t("common.add", "Add")}
                </Button>
              </div>
            </div>
            <ol className="space-y-3">
              {activities.length === 0 && (
                <li className="text-sm text-muted-foreground">
                  {t("crm.leads.noActivity", "No activity yet")}
                </li>
              )}
              {activities.map((a: any) => (
                <li key={a.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      {iconFor(a.activity_type)} <span>{a.activity_type}</span>
                    </span>
                    <span>·</span>
                    <span>{new Date(a.created_at).toLocaleString()}</span>
                    {a.from_stage && a.to_stage && (
                      <>
                        <span>·</span>
                        <span>
                          {a.from_stage} → {a.to_stage}
                        </span>
                      </>
                    )}
                  </div>
                  {a.body && <div className="mt-1 whitespace-pre-wrap">{a.body}</div>}
                </li>
              ))}
            </ol>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="surface-card p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">
                {t("crm.leads.matches", "Matches")}
              </h2>
              <div className="flex items-center gap-2">
                <ExportMenu
                  label={t("crm.leads.exportMatches")}
                  disabled={matches.length === 0}
                  onExport={(fmt) =>
                    exportRows(
                      `lead_${id}_matches`,
                      matches.map((m: any) => ({
                        listing_id: m.listing?.id ?? "",
                        title: m.listing?.title ?? "",
                        price: m.listing?.price ?? "",
                        currency: m.listing?.currency ?? "",
                        city: m.listing?.city ?? "",
                        bedrooms: m.listing?.bedrooms ?? "",
                        bathrooms: m.listing?.bathrooms ?? "",
                        area: m.listing?.area ?? "",
                        status: m.status,
                      })),
                      fmt,
                    )
                  }
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={suggest.isPending}
                  onClick={() => suggest.mutate()}
                >
                  <Sparkles className="me-1.5 size-3.5" />
                  {t("crm.leads.suggest", "Suggest")}
                </Button>
              </div>
            </div>

            {matches.length === 0 && (
              <div className="text-sm text-muted-foreground">
                {t("crm.leads.noMatches", "No matches yet")}
              </div>
            )}
            <ul className="space-y-3">
              {matches.map((m: any) => (
                <li key={m.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{m.listing?.title ?? "—"}</div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {m.listing?.price?.toLocaleString()} {m.listing?.currency} ·{" "}
                        {m.listing?.city}
                      </div>
                    </div>
                    <Badge variant="secondary">{m.status}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => matchMut.mutate({ id: m.id, status: "sent" })}
                    >
                      sent
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => matchMut.mutate({ id: m.id, status: "interested" })}
                    >
                      interested
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => matchMut.mutate({ id: m.id, status: "rejected" })}
                    >
                      rejected
                    </Button>
                    {m.listing?.slug && (
                      <Link
                        to="/listings/$slug"
                        params={{ slug: m.listing.slug }}
                        className="ms-auto inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="size-3" />
                      </Link>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={() => delMatch.mutate(m.id)}
                    >
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

function iconFor(k: string) {
  if (k === "call") return <Phone className="size-3.5" />;
  if (k === "email") return <Mail className="size-3.5" />;
  if (k === "whatsapp" || k === "note") return <MessageSquare className="size-3.5" />;
  return <MessageSquare className="size-3.5" />;
}

function ExportMenu({
  label,
  disabled,
  onExport,
}: {
  label: string;
  disabled?: boolean;
  onExport: (format: "csv" | "xlsx") => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled}>
          <Download className="me-1.5 size-3.5" />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onExport("csv")}>CSV</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onExport("xlsx")}>Excel</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
