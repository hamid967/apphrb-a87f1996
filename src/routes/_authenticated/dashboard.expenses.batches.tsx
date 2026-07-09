import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Loader2, Plus, Briefcase, Plane, ChevronRight } from "lucide-react";
import { useCurrentOrg } from "@/hooks/use-current-org";
import { createExpenseBatch, listMyBatches } from "@/lib/expense-batches.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/dashboard/expenses/batches")({
  head: () => sectionHead({ section: "dashboard", entityAr: "دفعات المصروفات", entityEn: "Expense Batches", path: "/dashboard/expenses/batches" }),
  component: BatchesPage,
});

type BatchType = "trip" | "project";

function BatchesPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { orgId, ready } = useCurrentOrg();

  const q = useQuery({
    queryKey: ["expense-batches", orgId],
    queryFn: () => listMyBatches({ data: { org_id: orgId! } }),
    enabled: ready && !!orgId,
  });

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [batchType, setBatchType] = useState<BatchType>("trip");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Auto-open the "new batch" dialog when arriving from the dashboard
  // quick-action (`/dashboard/expenses/batches#new`) so the flow is 2 steps.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash === "#new") {
      setOpen(true);
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  const create = useMutation({
    mutationFn: createExpenseBatch,
    onSuccess: (row: { id: string }) => {
      qc.invalidateQueries({ queryKey: ["expense-batches", orgId] });
      toast.success(t("expenseBatches.created"));
      setOpen(false);
      setTitle("");
      setDescription("");
      setStartDate("");
      setEndDate("");
      navigate({ to: "/dashboard/expenses/batches/$batchId", params: { batchId: row.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = q.data ?? [];
  const fmt = (n: number) =>
    Number(n).toLocaleString(isAr ? "ar" : "en", { maximumFractionDigits: 2 });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("expenseBatches.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("expenseBatches.sub")}</p>
        </div>
        <Button onClick={() => setOpen(true)} disabled={!orgId}>
          <Plus className="me-2 size-4" /> {t("expenseBatches.newBatch")}
        </Button>
      </div>

      <div className="mt-6">
        {q.isLoading ? (
          <div className="grid place-items-center p-16">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              {t("expenseBatches.empty")}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {rows.map((b) => (
              <Link
                key={b.id}
                to="/dashboard/expenses/batches/$batchId"
                params={{ batchId: b.id }}
                className="block"
              >
                <Card className="transition hover:border-primary/50 hover:shadow-md">
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary shrink-0">
                      {b.batch_type === "trip" ? (
                        <Plane className="size-5" />
                      ) : (
                        <Briefcase className="size-5" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="truncate font-medium">{b.title}</div>
                        <StatusBadge status={b.status} />
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground truncate">
                        {b.batch_number}
                        {b.start_date &&
                          ` · ${b.start_date}${b.end_date ? ` → ${b.end_date}` : ""}`}
                      </div>
                    </div>
                    <div className="text-end tabular-nums shrink-0">
                      <div className="font-semibold">{fmt(Number(b.total_amount))}</div>
                      <div className="text-[11px] uppercase text-muted-foreground">
                        {b.currency}
                      </div>
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("expenseBatches.newTitle")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>{t("expenseBatches.typeL")}</Label>
              <div className="grid grid-cols-2 gap-2">
                <TypeChip
                  icon={<Plane className="size-4" />}
                  label={t("expenseBatches.trip")}
                  active={batchType === "trip"}
                  onClick={() => setBatchType("trip")}
                />
                <TypeChip
                  icon={<Briefcase className="size-4" />}
                  label={t("expenseBatches.project")}
                  active={batchType === "project"}
                  onClick={() => setBatchType("project")}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="batch-title">{t("expenseBatches.titleField")}</Label>
              <Input
                id="batch-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  batchType === "trip"
                    ? t("expenseBatches.tripPlaceholder")
                    : t("expenseBatches.projectPlaceholder")
                }
                maxLength={200}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="batch-start">{t("expenseBatches.startDate")}</Label>
                <Input
                  id="batch-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="batch-end">{t("expenseBatches.endDate")}</Label>
                <Input
                  id="batch-end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="batch-desc">{t("expenseBatches.descL")}</Label>
              <Textarea
                id="batch-desc"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={2000}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("expenseBatches.cancel")}
            </Button>
            <Button
              disabled={create.isPending || title.trim().length < 2 || !orgId}
              onClick={() =>
                create.mutate({
                  data: {
                    org_id: orgId!,
                    title: title.trim(),
                    batch_type: batchType,
                    description: description.trim() || null,
                    start_date: startDate || null,
                    end_date: endDate || null,
                    currency: "SAR",
                  },
                })
              }
            >
              {create.isPending && <Loader2 className="me-2 size-4 animate-spin" />}
              {t("expenseBatches.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TypeChip({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm transition " +
        (active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border hover:border-primary/40")
      }
    >
      {icon} {label}
    </button>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const map: Record<
    string,
    { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
  > = {
    draft: { label: t("expenseBatches.stDraft"), variant: "outline" },
    submitted: { label: t("expenseBatches.stSubmitted"), variant: "secondary" },
    approved: { label: t("expenseBatches.stApproved"), variant: "default" },
    rejected: { label: t("expenseBatches.stRejected"), variant: "destructive" },
  };
  const entry = map[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={entry.variant}>{entry.label}</Badge>;
}
