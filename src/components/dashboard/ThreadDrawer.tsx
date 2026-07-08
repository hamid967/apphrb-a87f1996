import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Send, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar, enUS } from "date-fns/locale";

type Msg = { id: string; role: string; content: string; created_at: string };

export function ThreadDrawer({
  threadId,
  title,
  open,
  onOpenChange,
  isAr,
}: {
  threadId: string | null;
  title?: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  isAr: boolean;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const dfLocale = isAr ? ar : enUS;

  const msgsQ = useQuery({
    enabled: !!threadId && open,
    queryKey: ["thread-messages", threadId],
    refetchInterval: open ? 15_000 : false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assistant_messages")
        .select("id, role, content, created_at")
        .eq("thread_id", threadId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Msg[];
    },
  });

  const sendM = useMutation({
    mutationFn: async (content: string) => {
      if (!threadId) throw new Error("no thread");
      const { error } = await supabase
        .from("assistant_messages")
        .insert({ thread_id: threadId, role: "user", content });
      if (error) throw error;
      await supabase
        .from("assistant_threads")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", threadId);
    },
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["thread-messages", threadId] });
      qc.invalidateQueries({ queryKey: ["topbar-msg-count"] });
    },
  });

  useEffect(() => {
    if (msgsQ.data && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [msgsQ.data]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || sendM.isPending) return;
    sendM.mutate(t);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isAr ? "left" : "right"}
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-border/60 px-4 py-3 text-start">
          <SheetTitle className="truncate text-base">
            {title || (isAr ? "محادثة" : "Conversation")}
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 px-4 py-3">
          {msgsQ.isLoading ? (
            <div className="grid place-items-center py-10 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : (msgsQ.data ?? []).length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {isAr
                ? "لا توجد رسائل بعد. أرسل ردًا لبدء المحادثة."
                : "No messages yet. Send a reply to start."}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {(msgsQ.data ?? []).map((m) => {
                const isUser = m.role === "user";
                return (
                  <div key={m.id} className={cn("flex", isUser ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm",
                        isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                      )}
                    >
                      <div className="whitespace-pre-wrap">{m.content}</div>
                      <div
                        className={cn(
                          "mt-1 text-[10px] opacity-70",
                          isUser ? "text-primary-foreground/80" : "text-muted-foreground",
                        )}
                      >
                        {formatDistanceToNow(new Date(m.created_at), {
                          addSuffix: true,
                          locale: dfLocale,
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </ScrollArea>

        <form onSubmit={submit} className="flex items-end gap-2 border-t border-border/60 p-3">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={isAr ? "اكتب ردًا سريعًا..." : "Type a quick reply..."}
            rows={2}
            className="min-h-[44px] flex-1 resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(e);
              }
            }}
          />
          <Button type="submit" size="icon" disabled={!text.trim() || sendM.isPending}>
            {sendM.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
