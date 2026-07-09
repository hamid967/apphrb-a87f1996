import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExternalLink, Search, Shield, Globe, Lock, Zap } from "lucide-react";

/**
 * /admin/route-map — internal audit page that lists every route the TanStack
 * router knows about, classified by access scope. Complements
 * `tests/routes-link-integrity.test.ts` (which fails CI when a `to="..."`
 * literal points to nothing) by giving a human view of every URL the app
 * actually serves, so missing tiles like `/admin/seed` are trivial to spot.
 */
export const Route = createFileRoute("/_authenticated/admin/route-map")({
  component: RouteMapPage,
});

type Scope = "public" | "authenticated" | "admin" | "api";

type RouteRow = {
  path: string;
  scope: Scope;
  dynamic: boolean;
  segments: number;
};

function classify(path: string): Scope {
  if (path.startsWith("/api/")) return "api";
  // The router strips `_authenticated` from public URLs, so we detect scope
  // by walking routesById below and marking anything whose id contains
  // `/_authenticated/admin` as admin, `/_authenticated` as authenticated,
  // everything else as public.
  return "public";
}

const SCOPE_META: Record<
  Scope,
  { labelAr: string; labelEn: string; tone: string; icon: typeof Globe }
> = {
  public: {
    labelAr: "عام",
    labelEn: "Public",
    tone: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    icon: Globe,
  },
  authenticated: {
    labelAr: "يتطلب تسجيل الدخول",
    labelEn: "Authenticated",
    tone: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    icon: Lock,
  },
  admin: {
    labelAr: "إدارة النظام",
    labelEn: "Admin only",
    tone: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    icon: Shield,
  },
  api: {
    labelAr: "خادم / API",
    labelEn: "Server / API",
    tone: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    icon: Zap,
  },
};

function useAllRoutes(): RouteRow[] {
  const router = useRouter();
  return useMemo(() => {
    const byId = (router.routesById ?? {}) as Record<
      string,
      { id: string; fullPath?: string; path?: string }
    >;
    const seen = new Map<string, RouteRow>();
    for (const id of Object.keys(byId)) {
      if (id === "__root__") continue;
      const route = byId[id];
      // Prefer the router's own `fullPath` (what users type in the URL bar).
      let fullPath = route.fullPath ?? "";
      if (!fullPath) continue;
      if (fullPath.length > 1 && fullPath.endsWith("/")) {
        fullPath = fullPath.slice(0, -1);
      }
      // Skip pathless layout ids (`/_authenticated`, `/_authenticated/admin`).
      if (fullPath.startsWith("/_")) continue;

      let scope: Scope = classify(fullPath);
      if (scope === "public") {
        if (id.includes("/_authenticated/admin")) scope = "admin";
        else if (id.includes("/_authenticated")) scope = "authenticated";
      }
      const row: RouteRow = {
        path: fullPath,
        scope,
        dynamic: fullPath.includes("$"),
        segments: fullPath.split("/").filter(Boolean).length,
      };
      // Deduplicate: FileRoutesByFullPath/ByTo produce two ids for the same URL.
      if (!seen.has(row.path)) seen.set(row.path, row);
    }
    return [...seen.values()].sort((a, b) => a.path.localeCompare(b.path));
  }, [router]);
}

function RouteMapPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const rows = useAllRoutes();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope | "all">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (scope !== "all" && r.scope !== scope) return false;
      if (q && !r.path.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, query, scope]);

  const counts = useMemo(() => {
    const c: Record<Scope, number> = { public: 0, authenticated: 0, admin: 0, api: 0 };
    for (const r of rows) c[r.scope]++;
    return c;
  }, [rows]);

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6 space-y-4">
      <AdminPageHeader
        title={isAr ? "خريطة المسارات" : "Route map"}
        description={
          isAr
            ? "قائمة كل المسارات التي يعرفها الموجّه، مع نطاق الوصول لكل مسار. تُستخدم لمراجعة الروابط المفقودة."
            : "Every URL the router serves, classified by access scope. Use it to audit dead links or missing pages."
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(Object.keys(SCOPE_META) as Scope[]).map((s) => {
          const meta = SCOPE_META[s];
          const Icon = meta.icon;
          return (
            <Card key={s} className="border-border/50">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`rounded-lg p-2 border ${meta.tone}`}>
                  <Icon className="size-4" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">
                    {isAr ? meta.labelAr : meta.labelEn}
                  </div>
                  <div className="text-xl font-semibold tabular-nums">
                    {counts[s]}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col md:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={isAr ? "ابحث عن مسار..." : "Filter by path..."}
                className="ps-9"
              />
            </div>
            <Select value={scope} onValueChange={(v) => setScope(v as Scope | "all")}>
              <SelectTrigger className="md:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {isAr ? "كل النطاقات" : "All scopes"} ({rows.length})
                </SelectItem>
                {(Object.keys(SCOPE_META) as Scope[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {isAr ? SCOPE_META[s].labelAr : SCOPE_META[s].labelEn} (
                    {counts[s]})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="text-xs text-muted-foreground">
            {isAr
              ? `يعرض ${filtered.length} من ${rows.length} مسار`
              : `Showing ${filtered.length} of ${rows.length} routes`}
          </div>

          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[55%]">
                    {isAr ? "المسار" : "Path"}
                  </TableHead>
                  <TableHead>{isAr ? "النطاق" : "Scope"}</TableHead>
                  <TableHead className="text-center">
                    {isAr ? "ديناميكي" : "Dynamic"}
                  </TableHead>
                  <TableHead className="text-end">
                    {isAr ? "فتح" : "Open"}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const meta = SCOPE_META[r.scope];
                  return (
                    <TableRow key={r.path}>
                      <TableCell className="font-mono text-xs md:text-sm">
                        {r.path}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={meta.tone}>
                          {isAr ? meta.labelAr : meta.labelEn}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-xs text-muted-foreground">
                        {r.dynamic ? (isAr ? "نعم" : "Yes") : "—"}
                      </TableCell>
                      <TableCell className="text-end">
                        {r.dynamic || r.scope === "api" ? (
                          <span className="text-xs text-muted-foreground">
                            {isAr ? "—" : "—"}
                          </span>
                        ) : (
                          <Link
                            to={r.path as never}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            target="_blank"
                          >
                            {isAr ? "فتح" : "Open"}
                            <ExternalLink className="size-3" />
                          </Link>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">
                      {isAr ? "لا توجد نتائج" : "No routes match your filters"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
