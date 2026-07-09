import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { listAssistantThreads, createAssistantThread } from "@/lib/assistant-threads.functions";
import { Loader2 } from "lucide-react";
import { sectionHead } from "@/lib/section-og-head";

export const Route = createFileRoute("/_authenticated/assistant/")({
  component: AssistantIndex,
  head: () =>
    sectionHead({
      section: "assistant",
      entityAr: "المحادثات",
      entityEn: "Conversations",
      descAr: "اسأل، حلّل، وأنجز مهامك عبر مساعد Aqari الذكي بلغة عربية طبيعية.",
      path: "/assistant",
    }),
});

function AssistantIndex() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const listFn = useServerFn(listAssistantThreads);
  const createFn = useServerFn(createAssistantThread);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      const threads = await listFn();
      const first = threads?.[0];
      if (first) {
        navigate({ to: "/assistant/$threadId", params: { threadId: first.id }, replace: true });
      } else {
        const thr = await createFn({ data: {} });
        navigate({ to: "/assistant/$threadId", params: { threadId: thr.id }, replace: true });
      }
    })().catch(() => {
      ran.current = false;
    });
  }, [listFn, createFn, navigate]);

  return (
    <div className="h-full grid place-items-center text-muted-foreground">
      <div className="flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" /> {t("assistant.preparing")}
      </div>
    </div>
  );
}
