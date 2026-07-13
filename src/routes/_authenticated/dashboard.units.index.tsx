import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, ArchiveRestore } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listMyOrganizations } from "@/lib/organizations.functions";
import { listUnits, listArchivedUnits, restoreUnits } from "@/lib/units.functions";
import { useTranslation } from "react-i18next";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/dashboard/units/")({
  head: () => sectionHead({ section: "dashboard", entityAr: "الوحدات", entityEn: "Units", path: "/dashboard/units" }),
  component: UnitsIndex,
});

type UnitStatus = "vacant" | "occupied" | "reserved" | "maintenance" | string;

const statusClass = (s: UnitStatus): string => {
  switch (s) {
    case "vacant":
      return "bg-success/15 text-success border-success/30";
    case "occupied":
      return "bg-info/15 text-info border-info/30";
    case "reserved":
      return "bg-warning/15 text-warning border-warning/30";
    case "maintenance":
      return "bg-destructive/15 text-destructive border-destructive/30";
    default:
      return "bg-muted text-muted-foreground";
  }
};

function UnitsIndex() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const qc = useQueryClient();
  const orgsQ = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });
  const org = orgsQ.data?.[0]?.org;
  const [showArchived, setShowArchived] = useState(false);
  const unitsQ = useQuery({
    queryKey: ["units", org?.id, showArchived ? "archived" : "active"],
    queryFn: () =>
      showArchived
        ? listArchivedUnits({ data: { org_id: org!.id } })
        : listUnits({ data: { org_id: org!.id } }),
    enabled: !!org,
  });

  const restoreMut = useMutation({
    mutationFn: (id: string) => restoreUnits({ data: { ids: [id] } }),
    onSuccess: () => {
      toast.success(t("units.restored", { defaultValue: "تم الاسترجاع" }));
      qc.invalidateQueries({ queryKey: ["units", org?.id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [type, setType] = useState<string>("all");
  const [propertyId, setPropertyId] = useState<string>("all");

  const list = unitsQ.data ?? [];

  const properties = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of list) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = (u as any).buildings?.properties;
      if (p?.id) map.set(p.id, isAr ? (p.title_ar ?? "") : (p.title_en ?? ""));
    }
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [list, isAr]);

  const types = useMemo(() => {
    const s = new Set<string>();
    for (const u of list) if (u.type) s.add(u.type);
    return Array.from(s);
  }, [list]);

  const rows = useMemo(
    () =>
      list.filter((u) => {
        if (status !== "all" && u.status !== status) return false;
        if (type !== "all" && u.type !== type) return false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pId = (u as any).buildings?.properties?.id;
        if (propertyId !== "all" && pId !== propertyId) return false;
        if (!q.trim()) return true;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const b: any = (u as any).buildings;
        const hay =
          `${u.code} ${b?.name ?? ""} ${b?.properties?.title_ar ?? ""} ${b?.properties?.title_en ?? ""}`.toLowerCase();
        return hay.includes(q.toLowerCase());
      }),
    [list, status, type, propertyId, q],
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("units.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("units.sub")}</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant={showArchived ? "default" : "outline"}
            size="sm"
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived
              ? t("units.showActive", { defaultValue: "عرض النشطة" })
              : t("units.showArchived", { defaultValue: "عرض المؤرشفة" })}
          </Button>
          <div className="text-sm text-muted-foreground">
            {rows.length} / {list.length}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("units.searchPlaceholder")}
            className="ps-9"
          />
        </div>
        <Select value={propertyId} onValueChange={setPropertyId}>
          <SelectTrigger>
            <SelectValue placeholder={t("units.property")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("units.allProperties")}</SelectItem>
            {properties.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name || "—"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger>
            <SelectValue placeholder={t("units.status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("units.allStatuses")}</SelectItem>
            <SelectItem value="vacant">{t("units.vacant")}</SelectItem>
            <SelectItem value="occupied">{t("units.occupied")}</SelectItem>
            <SelectItem value="reserved">{t("units.reserved")}</SelectItem>
            <SelectItem value="maintenance">{t("units.maintenance")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger>
            <SelectValue placeholder={t("units.type")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("units.allTypes")}</SelectItem>
            {types.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-6 surface-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("units.colUnit")}</TableHead>
              <TableHead>{t("units.colBuilding")}</TableHead>
              <TableHead>{t("units.colType")}</TableHead>
              <TableHead>{t("units.colStatus")}</TableHead>
              <TableHead className="text-end">{t("units.colArea")}</TableHead>
              <TableHead className="text-end">{t("units.colRent")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {unitsQ.isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  {t("units.loading")}
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  {t("units.empty")}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((u) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const b: any = (u as any).buildings;
                const propTitle = isAr ? b?.properties?.title_ar : b?.properties?.title_en;
                const statusKey = (
                  ["vacant", "occupied", "reserved", "maintenance"] as const
                ).includes(u.status as never)
                  ? `units.${u.status}`
                  : null;
                const statusLabel = statusKey ? t(statusKey) : (u.status ?? "—");
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.code}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <div>{b?.name ?? "—"}</div>
                      <div className="text-xs">{propTitle ?? "—"}</div>
                    </TableCell>
                    <TableCell className="text-sm">{u.type ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusClass(u.status)}>
                        {statusLabel}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-end tabular-nums">{u.area ?? "—"}</TableCell>
                    <TableCell className="text-end tabular-nums">
                      {u.rent_amount != null
                        ? `${Number(u.rent_amount).toLocaleString(isAr ? "ar" : "en")} ${u.currency_code ?? "SAR"}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-end">
                      {showArchived ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => restoreMut.mutate(u.id)}
                          title={t("units.restore", { defaultValue: "استرجاع" })}
                        >
                          <ArchiveRestore className="size-4" />
                        </Button>
                      ) : (
                        <Link
                          to="/dashboard/units/$id"
                          params={{ id: u.id }}
                          className="text-sm text-primary hover:underline"
                        >
                          {t("units.view")}
                        </Link>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
