import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-current-org";
import type { BotRole } from "@/components/trial-bot";

export type NextAction = {
  key: string;
  title: string;
  path: string;
  tone: "warning" | "info" | "success";
  count?: number;
  reason: string;
};

/**
 * Reads live user/org signals (via RLS-scoped queries) and returns
 * a prioritized list of "next best actions" to show in the trial bot.
 */
export function useNextActions(role: BotRole) {
  const { orgId } = useCurrentOrg();

  return useQuery({
    queryKey: ["trial-bot-signals", orgId, role],
    enabled: !!orgId,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async (): Promise<NextAction[]> => {
      if (!orgId) return [];
      const actions: NextAction[] = [];
      const today = new Date().toISOString().slice(0, 10);
      const in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);

      // Admin-only signals
      if (role === "admin") {
        const [pendingUsers, policies, invites] = await Promise.all([
          supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("approval_status", "pending"),
          supabase
            .from("spending_policies")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId)
            .eq("active", true),
          supabase
            .from("org_invitations")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId)
            .is("accepted_at", null),
        ]);
        if ((pendingUsers.count ?? 0) > 0) {
          actions.push({
            key: "pending-users",
            title: `اعتمد ${pendingUsers.count} مستخدم بانتظار الموافقة`,
            path: "/admin/users",
            tone: "warning",
            count: pendingUsers.count ?? 0,
            reason: "مستخدمون جدد ينتظرون تجربة 7 أيام",
          });
        }
        if ((policies.count ?? 0) === 0) {
          actions.push({
            key: "no-policies",
            title: "أضف سياسة إنفاق أولى",
            path: "/admin/policies",
            tone: "info",
            reason: "لا توجد سياسات مصروفات نشطة — لن يتم رصد التجاوزات",
          });
        }
        if ((invites.count ?? 0) > 0) {
          actions.push({
            key: "pending-invites",
            title: `${invites.count} دعوة فريق لم تُقبل بعد`,
            path: "/team",
            tone: "info",
            count: invites.count ?? 0,
            reason: "تابع دعوات الأعضاء المعلّقة",
          });
        }
      }

      // Finance/Admin signals
      if (role === "admin" || role === "finance") {
        const [submitted, overdue] = await Promise.all([
          supabase
            .from("expense_claims")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId)
            .in("status", ["submitted", "in_review"]),
          supabase
            .from("rent_charges")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId)
            .eq("status", "pending")
            .lt("due_date", today),
        ]);
        if ((submitted.count ?? 0) > 0) {
          actions.push({
            key: "claims-review",
            title: `راجع ${submitted.count} مطالبة مصروف`,
            path: "/accounting/claims",
            tone: "warning",
            count: submitted.count ?? 0,
            reason: "مطالبات submitted/in_review بانتظار الاعتماد",
          });
        }
        if ((overdue.count ?? 0) > 0) {
          actions.push({
            key: "overdue-rent",
            title: `${overdue.count} دفعة إيجار متأخرة`,
            path: "/accounting",
            tone: "warning",
            count: overdue.count ?? 0,
            reason: "دفعات مستحقة تجاوزت تاريخها",
          });
        }
      }

      // Contracts expiring — all backoffice roles
      if (role === "admin" || role === "finance" || role === "employee") {
        const { count } = await supabase
          .from("contracts")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("status", "active")
          .gte("end_date", today)
          .lte("end_date", in30);
        if ((count ?? 0) > 0) {
          actions.push({
            key: "contracts-expiring",
            title: `${count} عقد ينتهي خلال 30 يوم`,
            path: "/dashboard/contracts",
            tone: "info",
            count: count ?? 0,
            reason: "جدّد أو تواصل مع المستأجرين قبل انتهاء العقد",
          });
        }
      }

      // Employee signals — my open tasks
      if (role === "employee" || role === "admin") {
        const { data: userRes } = await supabase.auth.getUser();
        const uid = userRes.user?.id;
        if (uid) {
          const { count } = await supabase
            .from("tasks")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId)
            .eq("assignee_id", uid)
            .in("status", ["open", "in_progress"]);
          if ((count ?? 0) > 0) {
            actions.push({
              key: "my-tasks",
              title: `لديك ${count} مهمة مفتوحة`,
              path: "/tasks",
              tone: "info",
              count: count ?? 0,
              reason: "مهام مسندة إليك بحالة pending",
            });
          }
        }
      }

      // Tenant portal — unpaid charges
      if (role === "tenant_portal") {
        const { count } = await supabase
          .from("rent_charges")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
          .lte("due_date", in30);
        if ((count ?? 0) > 0) {
          actions.push({
            key: "tenant-pay",
            title: `${count} دفعة مستحقة قريبًا`,
            path: "/tenant/portal",
            tone: "warning",
            count: count ?? 0,
            reason: "سدّد الإيجار قبل تاريخ الاستحقاق",
          });
        }
      }

      // Prioritize warnings first
      return actions.sort(
        (a, b) => (a.tone === "warning" ? -1 : 1) - (b.tone === "warning" ? -1 : 1),
      );
    },
  });
}
