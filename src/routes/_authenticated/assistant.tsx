import { createFileRoute, Outlet, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import {
  listAssistantThreads,
  createAssistantThread,
  deleteAssistantThread,
} from "@/lib/assistant-threads.functions";
import { Button } from "@/components/ui/button";
import { MessageSquarePlus, Trash2, Sparkles, Terminal, ScrollText, Mic2 } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";

export const Route = createFileRoute("/_authenticated/assistant")({
  component: AssistantLayout,
});

function AssistantLayout() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language?.startsWith("ar") ?? true;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listFn = useServerFn(listAssistantThreads);
  const createFn = useServerFn(createAssistantThread);
  const deleteFn = useServerFn(deleteAssistantThread);
  const params = useParams({ strict: false }) as { threadId?: string };

  const threads = useQuery({
    queryKey: ["assistant-threads"],
    queryFn: () => listFn(),
  });

  const createMut = useMutation({
    mutationFn: () => createFn({ data: {} }),
    onSuccess: (thr: any) => {
      qc.invalidateQueries({ queryKey: ["assistant-threads"] });
      navigate({ to: "/assistant/$threadId", params: { threadId: thr.id } });
    },
    onError: (e: any) => toast.error(e.message ?? t("assistant.createFailed")),
  });

  const deleteMut = useMutation({
    mutationFn: (threadId: string) => deleteFn({ data: { threadId } }),
    onSuccess: (_r, threadId) => {
      qc.invalidateQueries({ queryKey: ["assistant-threads"] });
      if (params.threadId === threadId) navigate({ to: "/assistant" });
      toast.success(t("assistant.deleted"));
    },
  });

  return (
    <div className="h-[calc(100vh-2rem)] flex gap-4 p-4" dir={isRtl ? "rtl" : "ltr"}>
      <aside className="w-72 shrink-0 border rounded-xl flex flex-col bg-card">
        <div className="p-3 border-b flex items-center gap-2">
          <div className="size-8 rounded-lg bg-gradient-to-br from-primary to-primary/60 grid place-items-center text-primary-foreground">
            <Sparkles className="size-4" />
          </div>
          <div className="font-semibold text-sm">{t("assistant.title")}</div>
        </div>
        <div className="p-2">
          <Button
            size="sm"
            className="w-full"
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending}
          >
            <MessageSquarePlus className="size-4 ml-1" /> {t("assistant.newChat")}
          </Button>
          <Link
            to="/assistant/scripts"
            className="mt-2 flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent/50"
            activeProps={{
              className:
                "mt-2 flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs bg-accent",
            }}
          >
            <Terminal className="size-3.5" /> {t("assistant.scriptsLink")}
          </Link>
          <Link
            to="/assistant/audit"
            className="mt-2 flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent/50"
            activeProps={{
              className:
                "mt-2 flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs bg-accent",
            }}
          >
            <ScrollText className="size-3.5" /> {t("assistant.auditLink")}
          </Link>
          <Link
            to="/assistant/elevenlabs"
            className="mt-2 flex items-center gap-2 rounded-md border border-[#C5A059]/30 bg-[#C5A059]/10 px-3 py-1.5 text-xs font-bold text-[#043927] hover:bg-[#C5A059]/20"
            activeProps={{
              className:
                "mt-2 flex items-center gap-2 rounded-md border border-[#C5A059]/40 bg-[#C5A059]/20 px-3 py-1.5 text-xs font-bold text-[#043927]",
            }}
          >
            <Mic2 className="size-3.5" /> {isRtl ? "حامد ElevenLabs" : "Hamid ElevenLabs"}
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {threads.isLoading && (
            <div className="text-xs text-muted-foreground p-2">{t("assistant.loading")}</div>
          )}
          {threads.data?.length === 0 && (
            <div className="text-xs text-muted-foreground p-2">{t("assistant.empty")}</div>
          )}
          <AnimatePresence initial={false}>
            {threads.data?.map((thr: any) => {
              const active = params.threadId === thr.id;
              return (
                <motion.div
                  key={thr.id}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{
                    opacity: 0,
                    x: 8,
                    height: 0,
                    marginTop: 0,
                    paddingTop: 0,
                    paddingBottom: 0,
                  }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className={`group flex items-center gap-1 rounded-lg text-sm overflow-hidden ${active ? "bg-accent" : "hover:bg-accent/50"}`}
                >
                  <Link
                    to="/assistant/$threadId"
                    params={{ threadId: thr.id }}
                    className={`flex-1 truncate px-3 py-2 ${isRtl ? "text-right" : "text-left"}`}
                  >
                    {thr.title || t("assistant.conversation")}
                  </Link>
                  <button
                    aria-label={t("assistant.delete")}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(t("assistant.confirmDelete"))) deleteMut.mutate(thr.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-2 text-muted-foreground hover:text-destructive transition"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
