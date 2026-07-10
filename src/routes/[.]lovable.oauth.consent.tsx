import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Loader2 } from "lucide-react";

// The managed Cloud Auth OAuth server redirects users here to approve or deny
// an incoming OAuth client (e.g. ChatGPT, Claude, Codex) connecting to this
// app's MCP server. The URL is /.lovable/oauth/consent — TanStack Router's
// file router uses [.] to escape a literal dot in the URL segment. Do NOT
// rename this file with a leading `.` (hidden files are silently skipped).

// The `supabase.auth.oauth` namespace is beta and may not be typed in every
// SDK version. Cast a small local wrapper so the route stays typed.
type AuthzDetails = {
  client?: { name?: string; client_id?: string; redirect_uris?: string[] } | null;
  scope?: string;
  redirect_url?: string;
  redirect_to?: string;
} | null;
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: AuthzDetails; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: AuthzDetails; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: AuthzDetails; error: { message: string } | null }>;
};
const authOAuth = () => (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  // Browser-only: the Supabase client reads its session from localStorage,
  // which is absent during SSR. Without this, getSession() is null on the
  // server pass and bounces signed-in users to /auth needlessly.
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      // Preserve the full consent URL so the user returns here after sign-in.
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/auth", search: { redirect: next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await authOAuth().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    // Provider resolved immediately (e.g. the client was previously approved).
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) {
      if (typeof window !== "undefined") window.location.href = immediate;
      throw redirect({ href: immediate });
    }
    return data;
  },
  component: ConsentPage,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-md p-6" dir="rtl">
      <h1 className="mb-2 text-xl font-semibold">تعذّر تحميل طلب الوصول</h1>
      <p className="text-sm text-muted-foreground">
        {String((error as Error)?.message ?? error)}
      </p>
    </main>
  ),
});

function ConsentPage() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const clientName = details?.client?.name || "تطبيق خارجي";
  const scopes = (details?.scope || "").split(/\s+/).filter(Boolean);
  const redirectUri = details?.client?.redirect_uris?.[0];

  async function decide(approve: boolean) {
    setErr(null);
    setBusy(approve ? "approve" : "deny");
    const { data, error } = approve
      ? await authOAuth().approveAuthorization(authorization_id)
      : await authOAuth().denyAuthorization(authorization_id);
    if (error) {
      setBusy(null);
      setErr(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(null);
      setErr("لم يُرجع خادم التفويض عنوان إعادة توجيه.");
      return;
    }
    window.location.href = target;
  }

  return (
    <main
      className="mx-auto flex min-h-[100vh] max-w-md flex-col items-stretch justify-center gap-4 p-6"
      dir="rtl"
    >
      <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-lg">
        <div className="mb-4 flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">
              ربط «{clientName}» بحسابك
            </h1>
            <p className="text-xs text-muted-foreground">
              سيعمل التطبيق نيابةً عنك ضمن صلاحياتك الحالية.
            </p>
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-border/60 bg-muted/30 p-3 text-sm">
          <div>
            <span className="text-muted-foreground">التطبيق:</span>{" "}
            <span className="font-medium">{clientName}</span>
          </div>
          {redirectUri && (
            <div className="truncate" dir="ltr">
              <span className="text-muted-foreground">redirect:</span>{" "}
              <span className="font-mono text-xs">{redirectUri}</span>
            </div>
          )}
          {scopes.length > 0 && (
            <div>
              <span className="text-muted-foreground">الصلاحيات المطلوبة:</span>
              <ul className="mt-1 list-inside list-disc text-sm">
                {scopes.map((s: string) => (
                  <li key={s} className="font-mono text-xs">
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          لا يتجاوز هذا الربط سياسات الوصول وقواعد RLS المطبّقة على حسابك.
        </p>

        {err && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {err}
          </p>
        )}

        <div className="mt-5 flex items-center gap-2">
          <Button
            variant="outline"
            className="flex-1"
            disabled={busy !== null}
            onClick={() => decide(false)}
          >
            {busy === "deny" && <Loader2 className="me-1.5 size-4 animate-spin" />}
            رفض
          </Button>
          <Button
            className="flex-1"
            disabled={busy !== null}
            onClick={() => decide(true)}
          >
            {busy === "approve" && <Loader2 className="me-1.5 size-4 animate-spin" />}
            موافقة وربط
          </Button>
        </div>
      </div>
    </main>
  );
}
