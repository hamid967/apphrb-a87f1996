import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2, Check, X, RotateCcw, Send, FilePlus, Trash2, History, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getApprovalAuditTrail, type ApprovalAuditEvent } from "@/lib/approval-audit.functions";

type Props = {
  entity: "expense_claims" | "expense_batches";
  entityId: string;
  className?: string;
};

const ICONS: Record<ApprovalAuditEvent["action"], React.ComponentType<{ className?: string }>> = {
  created: FilePlus,
  submitted: Send,
  approved: Check,
  rejected: X,
  returned: RotateCcw,
  updated: History,
  deleted: Trash2,
};

const TONE: Record<ApprovalAuditEvent["action"], string> = {
  created: "bg-muted text-muted-foreground",
  submitted: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  approved: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  rejected: "bg-destructive/10 text-destructive",
  returned: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  updated: "bg-muted text-muted-foreground",
  deleted: "bg-destructive/10 text-destructive",
};

export function ApprovalAuditTrail({ entity, entityId, className }: Props) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const locale = isAr ? "ar" : "en";

  const q = useQuery({
    queryKey: ["approval-audit", entity, entityId],
    queryFn: () => getApprovalAuditTrail({ data: { entity, entity_id: entityId } }),
    staleTime: 15_000,
  });

  const fmt = (s: string) =>
    new Date(s).toLocaleString(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    });

  const label = (a: ApprovalAuditEvent["action"]) => t(`approvalAudit.actions.${a}`);

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4 text-muted-foreground" />
          {t("approvalAudit.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        {q.isLoading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t("approvalAudit.loading")}
          </div>
        ) : q.isError ? (
          <div className="py-4 text-sm text-destructive">
            {(q.error as Error)?.message === "forbidden"
              ? t("approvalAudit.forbidden")
              : t("approvalAudit.failed")}
          </div>
        ) : !q.data || q.data.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            {t("approvalAudit.empty")}
          </div>
        ) : (
          <ol className="relative space-y-3 border-s ps-4">
            {q.data.map((ev) => {
              const Icon = ICONS[ev.action];
              return (
                <li key={ev.id} className="relative">
                  <span
                    className={`absolute -start-[26px] grid size-5 place-items-center rounded-full ring-4 ring-background ${TONE[ev.action]}`}
                  >
                    <Icon className="size-3" />
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={TONE[ev.action]}>
                      {label(ev.action)}
                    </Badge>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {fmt(ev.at)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1 text-sm">
                    <User className="size-3.5 text-muted-foreground" />
                    <span className="font-medium">
                      {ev.actor_name || t("approvalAudit.unknownActor")}
                    </span>
                    {ev.actor_role && (
                      <span className="text-xs text-muted-foreground">
                        · {t(`approvalAudit.roles.${ev.actor_role}`, {
                          defaultValue: ev.actor_role,
                        })}
                      </span>
                    )}
                  </div>
                  {ev.reason && (
                    <div className="mt-1 rounded-md border border-border/60 bg-muted/40 p-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {t("approvalAudit.reason")}:
                      </span>{" "}
                      {ev.reason}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
