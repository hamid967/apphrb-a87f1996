import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ShieldAlert, ArrowLeft, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import i18n from "@/lib/i18n";

const searchSchema = z.object({
  reason: z.string().optional(),
  from: z.string().optional(),
});

export const Route = createFileRoute("/access-denied")({
  validateSearch: (input) => searchSchema.parse(input),
  head: () => ({
    meta: [
      { title: i18n.t("accessDenied.metaTitle") },
      { name: "description", content: i18n.t("accessDenied.metaDesc") },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AccessDeniedPage,
});

function AccessDeniedPage() {
  const { t } = useTranslation();
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
              {t("accessDenied.title")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("accessDenied.body")}
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
                {t("accessDenied.home")}
              </Link>
            </Button>
            <Button asChild>
              <Link to="/portal">
                <ArrowLeft className="size-4 mr-1" />
                {t("accessDenied.goToPortal")}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
