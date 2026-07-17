import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, LayoutGrid, Rows3, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { listMyOrganizations } from "@/lib/organizations.functions";
import { listProperties } from "@/lib/properties.functions";
import { can, type OrgRole } from "@/lib/permissions";
import { useCanCreate } from "@/hooks/use-can-create";
import { UpgradeDialog } from "@/components/billing/upgrade-dialog";
import { EnterpriseDataTable, type DTColumn } from "@/components/dashboard/EnterpriseDataTable";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/dashboard/properties/")({
  head: () => sectionHead({ section: "dashboard", entityAr: "العقارات", entityEn: "Properties", path: "/dashboard/properties" }),
  component: PropertiesList,
});

function PropertiesList() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const orgsQ = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });
  const membership = orgsQ.data?.[0];
  const org = membership?.org;
  const role = membership?.role as OrgRole | undefined;
  const canCreate = can.createProperty(role);
  const gate = useCanCreate("property");
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const navigate = useNavigate();
  const propsQ = useQuery({
    queryKey: ["properties", org?.id],
    queryFn: () => listProperties({ data: { org_id: org!.id } }),
    enabled: !!org,
  });

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "sale" | "rent">("all");
  const [view, setView] = useState<"grid" | "table">("grid");

  const rows = useMemo(() => {
    const list = propsQ.data ?? [];
    return list.filter((p) => {
      if (filter !== "all" && p.listing_type !== filter) return false;
      if (!q.trim()) return true;
      const hay = `${p.title_ar} ${p.title_en} ${p.city ?? ""}`.toLowerCase();
      return hay.includes(q.toLowerCase());
    });
  }, [propsQ.data, q, filter]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type PRow = any;
  const columns: DTColumn<PRow>[] = [
    {
      id: "title",
      header: t("properties.title"),
      accessor: (p) => (isAr ? p.title_ar : p.title_en) ?? "",
      width: 240,
    },
    {
      id: "type",
      header: "النوع",
      accessor: (p) => t(`properties.types.${p.property_type}`),
      width: 140,
    },
    {
      id: "listing",
      header: "العرض",
      accessor: (p) => t(`properties.listingTypes.${p.listing_type}`),
      width: 120,
    },
    {
      id: "status",
      header: "الحالة",
      accessor: (p) => t(`properties.statuses.${p.status}`),
      width: 120,
    },
    { id: "city", header: "المدينة", accessor: (p) => p.city ?? "—", width: 140 },
    {
      id: "price",
      header: "السعر",
      accessor: (p) => Number(p.price),
      align: "end",
      width: 160,
      cell: (p) => (
        <span className="tabular-nums">
          {Number(p.price).toLocaleString(isAr ? "ar" : "en")} {p.currency}
        </span>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("properties.title")}
        </h1>
        {canCreate && (
          <Button
            onClick={() => {
              if (!gate.allowed) {
                setUpgradeOpen(true);
                return;
              }
              navigate({ to: "/dashboard/properties/new" });
            }}
          >
            <Plus className="me-2 size-4" />
            {t("properties.add")}
          </Button>
        )}
        <UpgradeDialog
          open={upgradeOpen}
          onOpenChange={setUpgradeOpen}
          label={gate.label}
          used={gate.used}
          max={gate.max}
          planName={gate.planName}
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("properties.search")}
            className="ps-9"
          />
        </div>
        <div className="flex gap-1 rounded-lg border bg-card p-1">
          {(["all", "sale", "rent"] as const).map((f) => (
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
              {f === "all"
                ? t("properties.filterAll")
                : f === "sale"
                  ? t("properties.filterSale")
                  : t("properties.filterRent")}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-lg border bg-card p-1">
          <button
            onClick={() => setView("grid")}
            className={
              "grid size-8 place-items-center rounded-md transition " +
              (view === "grid"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground")
            }
            aria-label="Grid"
          >
            <LayoutGrid className="size-4" />
          </button>
          <button
            onClick={() => setView("table")}
            className={
              "grid size-8 place-items-center rounded-md transition " +
              (view === "table"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground")
            }
            aria-label="Table"
          >
            <Rows3 className="size-4" />
          </button>
        </div>
      </div>

      {view === "table" ? (
        <div className="mt-6">
          <EnterpriseDataTable<PRow>
            data={rows}
            columns={columns}
            rowKey={(p) => p.id}
            isAr={isAr}
            loading={propsQ.isLoading}
            exportFileName="properties"
            emptyLabel={t("properties.empty")}
            searchPlaceholder={t("properties.search")}
            onRowClick={(p) => navigate({ to: "/dashboard/properties/$id", params: { id: p.id } })}
            bulkActions={[
              {
                id: "archive",
                label: isAr ? "أرشفة" : "Archive",
                icon: Trash2,
                variant: "outline",
                onRun: (rs) => {
                  toast.info(`${rs.length} ${isAr ? "عقار للأرشفة" : "properties to archive"}`);
                },
              },
            ]}
          />
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.length === 0 ? (
            <div className="col-span-full surface-card p-10 text-center text-sm text-muted-foreground">
              {t("properties.empty")}
            </div>
          ) : (
            rows.map((p) => (
              <Link
                key={p.id}
                to="/dashboard/properties/$id"
                params={{ id: p.id }}
                className="group overflow-hidden surface-card transition hover:shadow-sm"
              >
                <div className="aspect-[4/3] w-full overflow-hidden bg-muted">
                  {p.cover_image_url ? (
                    <img
                      src={p.cover_image_url}
                      alt=""
                      className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-xs text-muted-foreground">
                      —
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {t(`properties.listingTypes.${p.listing_type}`)}
                    </Badge>
                    <Badge variant="outline">{t(`properties.statuses.${p.status}`)}</Badge>
                  </div>
                  <div className="mt-2 truncate font-medium">{isAr ? p.title_ar : p.title_en}</div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {t(`properties.types.${p.property_type}`)} · {p.city ?? "—"}
                  </div>
                  <div className="mt-3 text-lg font-semibold tabular-nums">
                    {Number(p.price).toLocaleString(isAr ? "ar" : "en")}{" "}
                    <span className="text-sm text-muted-foreground">{p.currency}</span>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
