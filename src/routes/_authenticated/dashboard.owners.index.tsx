import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listMyOrganizations } from "@/lib/organizations.functions";
import { listOwners } from "@/lib/owners.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Users, ExternalLink, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/_authenticated/dashboard/owners/")({
  component: OwnersList,
});

function fmt(n: number) {
  return Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function OwnersList() {
  const orgsQ = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });
  const orgId = orgsQ.data?.[0]?.org?.id as string | undefined;
  const ownersQ = useQuery({
    queryKey: ["owners", orgId],
    queryFn: () => listOwners({ data: { orgId: orgId! } }),
    enabled: !!orgId,
  });
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const list = (ownersQ.data ?? []) as any[];
    if (!q) return list;
    const needle = q.toLowerCase();
    return list.filter((o) =>
      `${o.full_name} ${o.email ?? ""} ${o.phone ?? ""}`.toLowerCase().includes(needle),
    );
  }, [ownersQ.data, q]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Users className="size-6" /> Owner Portal
          </h1>
          <p className="text-sm text-muted-foreground">
            Owners, contracts, and monthly payout statements.
          </p>
        </div>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search owners…"
          className="max-w-xs"
        />
      </div>

      {ownersQ.isLoading ? (
        <div className="grid place-items-center py-24 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Owners ({filtered.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr className="text-start">
                    <th className="p-3 text-start">Name</th>
                    <th className="p-3 text-start">Contact</th>
                    <th className="p-3 text-start">Contracts</th>
                    <th className="p-3 text-start">Monthly rent</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((o: any) => (
                    <tr key={o.id} className="hover:bg-muted/30">
                      <td className="p-3 font-medium">{o.full_name}</td>
                      <td className="p-3 text-muted-foreground">
                        <div>{o.email ?? "—"}</div>
                        <div className="text-xs">{o.phone ?? ""}</div>
                      </td>
                      <td className="p-3">
                        <Badge variant="secondary">{o.active} active</Badge>
                        <span className="ms-2 text-xs text-muted-foreground">of {o.total}</span>
                      </td>
                      <td className="p-3">{fmt(o.monthly)} SAR</td>
                      <td className="p-3 text-end">
                        <Link
                          to="/dashboard/owners/$id"
                          params={{ id: o.id }}
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          Statement <ExternalLink className="size-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {!filtered.length && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-muted-foreground">
                        No owners yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
