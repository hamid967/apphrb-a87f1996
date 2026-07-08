import { createFileRoute, Link } from "@tanstack/react-router";
import { detailHead } from "@/lib/detail-og-head";
import { useQuery } from "@tanstack/react-query";
import { getOwnerStatement } from "@/lib/appfolio.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import { authAwareRetry, usePortalAuthGuard } from "@/hooks/use-portal-auth-guard";

export const Route = createFileRoute("/_authenticated/portal/owner/statements/$id")({
  head: ({ params }) => detailHead({ entityAr: 'كشف مالك', entityEn: 'Owner Statement', id: String(params.id), path: `/portal/owner/statements/${params.id}`, kind: 'article' }),
  component: StatementDetail,
});

function StatementDetail() {
  const { id } = Route.useParams();
  const q = useQuery({
    queryKey: ["owner", "stmt", id],
    queryFn: () => getOwnerStatement({ data: { id } }),
    retry: authAwareRetry,
  });
  const { authFailed, Fallback } = usePortalAuthGuard({
    redirectPath: `/owner/portal/statements/${id}`,
    errors: [q.error],
  });
  if (authFailed) return <Fallback />;
  if (q.isLoading)
    return (
      <div className="p-8">
        <Loader2 className="animate-spin" />
      </div>
    );
  const s = q.data?.statement as any;
  const lines = q.data?.lines ?? [];
  if (!s) return <div className="p-8">Not found.</div>;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Button asChild variant="ghost" size="sm">
          <Link to="/portal/owner">
            <ArrowLeft className="size-4 mr-1" />
            Back
          </Link>
        </Button>
        <Button onClick={() => window.print()}>
          <Printer className="size-4 mr-1" />
          Print / PDF
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>
            Owner statement ·{" "}
            {new Date(s.period_start).toLocaleDateString(undefined, {
              month: "long",
              year: "numeric",
            })}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-xs text-muted-foreground">Rent collected</div>
              <div className="text-xl font-semibold">
                {Number(s.rent_collected).toLocaleString()} {s.currency}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Mgmt fee</div>
              <div className="text-xl font-semibold">-{Number(s.mgmt_fee).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Net payout</div>
              <div className="text-xl font-semibold">{Number(s.net_payout).toLocaleString()}</div>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="text-left border-b">
              <tr>
                <th className="py-2">Date</th>
                <th>Type</th>
                <th>Description</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l: any) => (
                <tr key={l.id} className="border-b last:border-0">
                  <td className="py-2">
                    {l.line_date ? new Date(l.line_date).toLocaleDateString() : "—"}
                  </td>
                  <td>{l.kind}</td>
                  <td>{l.description}</td>
                  <td className="text-right">{Number(l.amount).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
