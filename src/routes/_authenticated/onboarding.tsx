import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: OnboardingRedirect,
});

function OnboardingRedirect() {
  const nav = useNavigate();
  useEffect(() => {
    nav({ to: "/onboarding/wizard", replace: true });
  }, [nav]);
  return (
    <div className="grid min-h-[var(--app-height,100vh)] place-items-center text-sm text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
    </div>
  );
}
