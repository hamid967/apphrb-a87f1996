import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { ShieldAlert, ArrowLeft, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const searchSchema = z.object({
  reason: z.string().optional(),
  from: z.string().optional(),
});

export const Route = createFileRoute("/access-denied")({
  validateSearch: (input) => searchSchema.parse(input),
  head: () => ({
    meta: [
      { title: "Access denied — Aqari" },
      { name: "description", content: "You don't have permission to view this resource." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AccessDeniedPage,
});

function AccessDeniedPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const search = useSearch({ from: "/access-denied" });

  return (
    <div className="min-h-dvh flex items-center justify-center p-6 bg-background">
      <Card className="w-full max-w-md">
        <CardContent className="pt-8 pb-6 text-center space-y-4">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-destructive/10 text-destructive">
            <ShieldAlert className="size-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {isAr ? "غير مصرح لك بالوصول" : "Access denied"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {isAr
                ? "ليست لديك الصلاحية المطلوبة لعرض هذه الصفحة. تواصل مع مدير الحساب إذا كنت تظن أنه خطأ."
                : "You don't have the permissions required to view this page. Contact your account admin if you think this is a mistake."}
            </p>
            {search.reason && (
              <p className="mt-2 text-xs text-muted-foreground/80">
                <span className="font-mono">{search.reason}</span>
              </p>
            )}
          </div>
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <Button asChild variant="outline">
              <Link to="/">
                <Home className="size-4 mr-1" />
                {isAr ? "الرئيسية" : "Home"}
              </Link>
            </Button>
            <Button asChild>
              <Link to="/portal">
                <ArrowLeft className="size-4 mr-1" />
                {isAr ? "الذهاب إلى البوابة" : "Go to portal"}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
