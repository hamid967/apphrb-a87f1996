import { ReactNode, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface AdminColumn<T> {
  key: string;
  labelAr: string;
  labelEn: string;
  render: (row: T) => ReactNode;
}

interface Props<T> {
  titleAr: string;
  titleEn: string;
  descAr?: string;
  descEn?: string;
  queryKey: string;
  listFn: () => Promise<T[]>;
  columns: AdminColumn<T>[];
  searchFields?: (row: T) => (string | null | undefined)[];
  toolbar?: ReactNode;
}

export function AdminListShell<T extends { id?: string }>(props: Props<T>) {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const [q, setQ] = useState("");

  const query = useQuery({
    queryKey: [props.queryKey],
    queryFn: () => props.listFn(),
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    const rows = query.data ?? [];
    if (!q.trim() || !props.searchFields) return rows;
    const needle = q.toLowerCase();
    return rows.filter((r) =>
      props.searchFields!(r).some((v) => v && v.toLowerCase().includes(needle)),
    );
  }, [query.data, q, props]);

  return (
    <div className="studio-shell min-h-dvh space-y-6 p-4 md:p-6">
      <div className="studio-panel-dark studio-noise flex flex-wrap items-start justify-between gap-3 p-6">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white">
            {isAr ? props.titleAr : props.titleEn}
          </h1>
          {(props.descAr || props.descEn) && (
            <p className="mt-2 max-w-2xl text-sm leading-7 text-[#c9ddd4]">
              {isAr ? props.descAr : props.descEn}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">{props.toolbar}</div>
      </div>

      <Card className="studio-card-lg border-[#C5A059]/20">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">
              {isAr ? "القائمة" : "Records"}{" "}
              <span className="text-muted-foreground text-sm">
                ({filtered.length})
              </span>
            </CardTitle>
            {props.searchFields && (
              <div className="relative w-full max-w-xs">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={isAr ? "بحث..." : "Search..."}
                  className="pl-8"
                />
              </div>
            )}
          </div>
          {(props.descAr || props.descEn) && (
            <CardDescription className="sr-only">
              {isAr ? props.descAr : props.descEn}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : query.isError ? (
            <div className="py-8 text-center text-sm text-destructive">
              {(query.error as Error).message}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {isAr ? "لا توجد بيانات" : "No data yet"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {props.columns.map((c) => (
                      <TableHead key={c.key}>{isAr ? c.labelAr : c.labelEn}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row, i) => (
                    <TableRow key={row.id ?? i}>
                      {props.columns.map((c) => (
                        <TableCell key={c.key}>{c.render(row)}</TableCell>
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
