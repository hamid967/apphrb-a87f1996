import { createFileRoute, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { AccessDenied } from "@/components/auth/AccessDenied";

const searchSchema = z.object({
  permission: z.string().optional(),
  scope: z.string().optional(),
  reason: z.string().optional(),
});

export const Route = createFileRoute("/access-denied")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [{ title: "Access denied" }, { name: "robots", content: "noindex" }],
  }),
  component: AccessDeniedPage,
});

function AccessDeniedPage() {
  const { permission, scope, reason } = useSearch({ from: "/access-denied" });
  const reasonKey = (reason ?? "default") + "|" + (permission ?? "") + "|" + (scope ?? "");

  useEffect(() => {
    if (!reason) return;
    const lower = reason.toLowerCase();
    const isBilling =
      lower.includes("expired") ||
      lower.includes("subscription") ||
      lower.includes("اشتراك") ||
      lower.includes("منتهي") ||
      lower.includes("فوترة");
    toast(isBilling ? "اشتراكك بحاجة إلى تجديد" : "تم تقييد الوصول", {
      description: reason,
      duration: 4000,
    });
  }, [reason]);

  return (
    <div className="min-h-screen bg-background">
      <AnimatePresence mode="wait">
        <motion.div
          key={reasonKey}
          initial={{ opacity: 0, y: 12, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <AccessDenied requiredPermission={permission} scopeLabel={scope} reason={reason} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
