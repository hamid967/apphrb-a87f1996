import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Printer, Trash2, ArchiveRestore } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listMyOrganizations } from "@/lib/organizations.functions";
import {
  listContracts,
  listArchivedContracts,
  archiveContracts,
  restoreContracts,
} from "@/lib/contracts.functions";
import { EnterpriseDataTable, type DTColumn } from "@/components/dashboard/EnterpriseDataTable";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/dashboard/contracts/")({
  head: () => sectionHead({ section: "dashboard", entityAr: "العقود", entityEn: "Contracts", path: "/dashboard/contracts" }),
  component: ContractsIndex,
});

type Filter = "all" | "active" | "expiring" | "expired" | "terminated" | "draft" | "archived";

const STATUS_CLASS: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  draft: "bg-slate-500/15 text-slate-700 border-slate-500/30",
  expired: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  terminated: "bg-rose-500/15 text-rose-700 border-rose-500/30",
  renewed: "bg-blue-500/15 text-blue-700 border-blue-500/30",
};

const daysUntil = (iso: string) =>
  Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

function ContractsIndex() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const orgsQ = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });
  const org = orgsQ.data?.[0]?.org;
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["contracts", org?.id],
    queryFn: () => listContracts({ data: { org_id: org!.id } }),
    enabled: !!org,
  });
  const archivedQ = useQuery({
    queryKey: ["contracts-archived", org?.id],
    queryFn: () => listArchivedContracts({ data: { org_id: org!.id } }),
    enabled: !!org,
  });

  const [filter, setFilter] = useState<Filter>("all");
  const navigate = useNavigate();

  const archiveMut = useMutation({
    mutationFn: (ids: string[]) => archiveContracts({ data: { ids } }),
    onSuccess: (r) => {
      toast.success(
        t("contracts.archivedOk", { n: r.count, defaultValue: `تمت أرشفة ${r.count} عقد` }),
      );
      qc.invalidateQueries({ queryKey: ["contracts", org?.id] });
      qc.invalidateQueries({ queryKey: ["contracts-archived", org?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const restoreMut = useMutation({
    mutationFn: (ids: string[]) => restoreContracts({ data: { ids } }),
    onSuccess: (r) => {
      toast.success(
        t("contracts.restoredOk", { n: r.count, defaultValue: `تم استرجاع ${r.count} عقد` }),
      );
      qc.invalidateQueries({ queryKey: ["contracts", org?.id] });
      qc.invalidateQueries({ queryKey: ["contracts-archived", org?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    if (filter === "archived") return archivedQ.data ?? [];
    const list = q.data ?? [];
    return list.filter((c) => {
      if (filter === "active" && c.status !== "active") return false;
      if (filter === "draft" && c.status !== "draft") return false;
      if (filter === "expired" && c.status !== "expired") return false;
      if (filter === "terminated" && c.status !== "terminated") return false;
      if (filter === "expiring") {
        if (c.status !== "active") return false;
        const d = daysUntil(c.end_date);
        if (d < 0 || d > 60) return false;
      }
      return true;
    });
  }, [q.data, archivedQ.data, filter]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Row = any;
  const columns: DTColumn<Row>[] = [
    {
      id: "no",
      header: t("contracts.colNo"),
      accessor: (r) => r.contract_number ?? r.id.slice(0, 8),
      width: 140,
    },
    {
      id: "tenant",
      header: t("contracts.colTenant"),
      accessor: (r) => r.tenants?.full_name ?? "—",
      width: 200,
    },
    {
      id: "unit",
      header: t("contracts.colUnit"),
      accessor: (r) => r.units?.code ?? "—",
      width: 120,
    },
    { id: "start", header: t("contracts.colStart"), accessor: (r) => r.start_date, width: 120 },
    { id: "end", header: t("contracts.colEnd"), accessor: (r) => r.end_date, width: 120 },
    {
      id: "amount",
      header: t("contracts.colValue"),
      accessor: (r) => Number(r.amount),
      width: 140,
      align: "end",
      cell: (r) => (
        <span className="tabular-nums">
          {Number(r.amount).toLocaleString(isAr ? "ar" : "en")} {r.currency_code}
        </span>
      ),
    },
    {
      id: "status",
      header: t("contracts.colStatus"),
      accessor: (r) => r.status,
      width: 120,
      cell: (r) => {
        const cls = STATUS_CLASS[r.status] ?? "bg-muted";
        const key = `contracts.status${r.status.charAt(0).toUpperCase()}${r.status.slice(1)}`;
        const label = i18n.exists(key) ? t(key) : r.status;
        return (
          <Badge variant="outline" className={cls}>
            {label}
          </Badge>
        );
      },
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("contracts.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("contracts.sub")}</p>
        </div>
        <Button asChild>
          <Link to="/dashboard/contracts/new">
            <Plus className="me-2 size-4" /> {t("contracts.new")}
          </Link>
        </Button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="-mx-1 flex gap-1 overflow-x-auto rounded-lg border bg-card p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {(
            [
              ["all", t("contracts.filterAll")],
              ["active", t("contracts.filterActive")],
              ["expiring", t("contracts.filterExpiring")],
              ["expired", t("contracts.filterExpired")],
              ["terminated", t("contracts.filterTerminated")],
              ["draft", t("contracts.filterDraft")],
              [
                "archived",
                t("contracts.filterArchived", { defaultValue: "المؤرشفة" }) +
                  (archivedQ.data?.length ? ` (${archivedQ.data.length})` : ""),
              ],
            ] as [Filter, string][]
          ).map(([f, label]) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={
                "rounded-md px-3 py-1.5 text-sm transition " +
                (filter === f
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <EnterpriseDataTable<Row>
          data={rows}
          columns={columns}
          rowKey={(r) => r.id}
          isAr={isAr}
          loading={filter === "archived" ? archivedQ.isLoading : q.isLoading}
          exportFileName="contracts"
          emptyLabel={t("contracts.empty")}
          searchPlaceholder={t("contracts.search")}
          onRowClick={(r) => navigate({ to: "/dashboard/contracts/$id", params: { id: r.id } })}
          bulkActions={
            filter === "archived"
              ? [
                  {
                    id: "restore",
                    label: t("contracts.bulkRestore", { defaultValue: "استرجاع" }),
                    icon: ArchiveRestore,
                    onRun: (rs: Row[]) => restoreMut.mutate(rs.map((r) => r.id)),
                  },
                ]
              : [
                  {
                    id: "print",
                    label: t("contracts.bulkPrint"),
                    icon: Printer,
                    onRun: () => window.print(),
                  },
                  {
                    id: "archive",
                    label: t("contracts.bulkArchive"),
                    icon: Trash2,
                    variant: "outline",
                    onRun: (rs: Row[]) => {
                      if (!rs.length) return;
                      if (
                        !window.confirm(
                          t("contracts.archiveConfirm", {
                            n: rs.length,
                            defaultValue: `أرشفة ${rs.length} عقد؟ يمكن استرجاعها لاحقاً.`,
                          }),
                        )
                      )
                        return;
                      archiveMut.mutate(rs.map((r) => r.id));
                    },
                  },
                ]
          }
        />
      </div>
    </div>
  );
}
