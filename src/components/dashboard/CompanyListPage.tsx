import { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2, Plus, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listMyOrganizations } from "@/lib/organizations.functions";
import { useMemo, useState } from "react";

export interface Column<T> {
  key: string;
  labelAr: string;
  labelEn: string;
  render: (row: T) => ReactNode;
  className?: string;
}

interface Props<T> {
  titleAr: string;
  titleEn: string;
  descAr?: string;
  descEn?: string;
  queryKey: string;
  listFn: (args: { data: { org_id: string } }) => Promise<T[]>;
  columns: Column<T>[];
  searchFields?: (row: T) => string[];
  onCreate?: () => void;
  actionsLabelAr?: string;
  actionsLabelEn?: string;
}

export function CompanyListPage<T extends { id: string }>(props: Props<T>) {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const [search, setSearch] = useState("");

  const orgsQ = useQuery({
    queryKey: ["my-organizations"],
    queryFn: () => listMyOrganizations(),
    staleTime: 60_000,
  });
  const orgId = orgsQ.data?.[0]?.org?.id;

  const rowsQ = useQuery({
    queryKey: [props.queryKey, orgId],
    queryFn: () => props.listFn({ data: { org_id: orgId! } }),
    enabled: !!orgId,
  });

  const filtered = useMemo(() => {
    const rows = rowsQ.data ?? [];
    if (!search.trim() || !props.searchFields) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) => props.searchFields!(r).some((f) => f?.toLowerCase().includes(q)));
  }, [rowsQ.data, search, props]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isAr ? props.titleAr : props.titleEn}
          </h1>
          {(props.descAr || props.descEn) && (
            <p className="mt-1 text-sm text-muted-foreground">
              {isAr ? props.descAr : props.descEn}
            </p>
          )}
        </div>
        {props.onCreate && (
          <Button onClick={props.onCreate}>
            <Plus className="me-2 h-4 w-4" />
            {isAr ? "إضافة" : "Add"}
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base font-semibold">
            {isAr ? "القائمة" : "List"}
            {rowsQ.data && (
              <span className="ms-2 text-xs font-normal text-muted-foreground">
                ({filtered.length})
              </span>
            )}
          </CardTitle>
          {props.searchFields && (
            <div className="relative w-64 max-w-full">
              <Search className="absolute top-2.5 h-4 w-4 text-muted-foreground ltr:left-2.5 rtl:right-2.5" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={isAr ? "بحث..." : "Search..."}
                className="ltr:pl-8 rtl:pr-8"
              />
            </div>
          )}
        </CardHeader>
        <CardContent>
          {rowsQ.isLoading || orgsQ.isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !orgId ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {isAr ? "لا توجد شركة مرتبطة بحسابك." : "No company linked to your account."}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {isAr ? "لا توجد سجلات." : "No records."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {props.columns.map((c) => (
                      <TableHead key={c.key} className={c.className}>
                        {isAr ? c.labelAr : c.labelEn}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => (
                    <TableRow key={row.id}>
                      {props.columns.map((c) => (
                        <TableCell key={c.key} className={c.className}>
                          {c.render(row)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
