import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/unsubscribe")({
  component: UnsubscribePage,
  head: () => ({ meta: [{ title: "Unsubscribe — Aqari" }] }),
});

type State = "loading" | "valid" | "invalid" | "already" | "success" | "error";

function UnsubscribePage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const [state, setState] = useState<State>("loading");
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    setToken(t);
    if (!t) {
      setState("invalid");
      return;
    }
    fetch(`/email/unsubscribe?token=${encodeURIComponent(t)}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) setState("invalid");
        else if (d.valid) setState("valid");
        else setState("already");
      })
      .catch(() => setState("error"));
  }, []);

  const confirm = async () => {
    if (!token) return;
    setState("loading");
    try {
      const r = await fetch("/email/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const d = await r.json();
      if (d.success) setState("success");
      else if (d.reason === "already_unsubscribed") setState("already");
      else setState("error");
    } catch {
      setState("error");
    }
  };

  return (
    <div
      dir={isAr ? "rtl" : "ltr"}
      className="flex min-h-screen items-center justify-center bg-background px-4"
    >
      <div className="max-w-md w-full rounded-2xl border bg-card p-8 text-center shadow-sm">
        <h1 className="text-2xl font-semibold mb-4">{t("unsubscribeP.title")}</h1>
        {state === "loading" && (
          <p className="text-muted-foreground">{t("unsubscribeP.checking")}</p>
        )}
        {state === "invalid" && <p className="text-destructive">{t("unsubscribeP.invalid")}</p>}
        {state === "already" && (
          <p className="text-muted-foreground">{t("unsubscribeP.already")}</p>
        )}
        {state === "success" && <p className="text-primary">{t("unsubscribeP.success")}</p>}
        {state === "error" && <p className="text-destructive">{t("unsubscribeP.error")}</p>}
        {state === "valid" && (
          <>
            <p className="text-muted-foreground mb-6">{t("unsubscribeP.valid")}</p>
            <button
              onClick={confirm}
              className="rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground"
            >
              {t("unsubscribeP.confirm")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
