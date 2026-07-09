import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { LifeBuoy, MessageCircle, Phone, Mail, Plus, Send } from "lucide-react";
import { portalHead } from "@/lib/portal-og-head";
import { PortalPageHeader } from "@/components/portal/PortalPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HijriDateBadge } from "@/components/ui/hijri-date-badge";
import { createSupportTicket, listMyTickets } from "@/lib/support-tickets.functions";

export const Route = createFileRoute("/_authenticated/portal/support")({
  head: () =>
    portalHead({
      titleAr: "الدعم الفني",
      titleEn: "Support",
      descAr: "تواصل مع فريق الدعم وأنشئ تذاكر.",
      path: "/portal/support",
    }),
  component: SupportPage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">{error.message}</div>,
});

type Priority = "low" | "normal" | "high" | "urgent";

function SupportPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("general");
  const [priority, setPriority] = useState<Priority>("normal");

  const ticketsQ = useQuery({
    queryKey: ["my-tickets"],
    queryFn: () => listMyTickets(),
  });

  const createM = useMutation({
    mutationFn: () =>
      createSupportTicket({
        data: {
          subject: subject.trim(),
          description: description.trim() || undefined,
          category: category || undefined,
          priority,
        },
      }),
    onSuccess: () => {
      toast.success(isAr ? "تم إنشاء التذكرة" : "Ticket created");
      setOpen(false);
      setSubject("");
      setDescription("");
      setCategory("general");
      setPriority("normal");
      qc.invalidateQueries({ queryKey: ["my-tickets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const channels = [
    { icon: MessageCircle, ar: "الدردشة المباشرة", en: "Live chat", href: "#" },
    { icon: Phone, ar: "واتساب", en: "WhatsApp", href: "https://wa.me/966500000000" },
    { icon: Mail, ar: "البريد", en: "Email", href: "mailto:support@hrhbs.com" },
  ];

  return (
    <div className="mx-auto max-w-[1100px] p-4 sm:p-6 lg:p-8">
      <PortalPageHeader
        icon={<LifeBuoy className="size-5" />}
        title={isAr ? "مركز الدعم" : "Support Center"}
        subtitle={isAr ? "أنشئ تذكرة أو تواصل معنا مباشرة" : "Open a ticket or reach us directly"}
      />

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {channels.map((c) => (
          <a
            key={c.en}
            href={c.href}
            className="surface-card group flex items-start gap-3 p-4 transition hover:border-primary/40 hover:shadow-[var(--shadow-soft)]"
          >
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary transition group-hover:scale-110">
              <c.icon className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{isAr ? c.ar : c.en}</div>
            </div>
          </a>
        ))}
      </div>

      <div className="surface-card mt-6 p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="inline-flex items-center gap-2 text-sm font-semibold">
            {isAr ? "تذاكري" : "My tickets"}
            {ticketsQ.data && (
              <span className="text-xs font-normal text-muted-foreground">
                ({ticketsQ.data.length})
              </span>
            )}
          </h3>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="me-2 size-4" />
                {isAr ? "تذكرة جديدة" : "New ticket"}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{isAr ? "فتح تذكرة دعم" : "Open a support ticket"}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label>{isAr ? "الموضوع *" : "Subject *"}</Label>
                  <Input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    maxLength={200}
                    placeholder={isAr ? "ملخص المشكلة..." : "Brief summary..."}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>{isAr ? "الفئة" : "Category"}</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general">{isAr ? "عام" : "General"}</SelectItem>
                        <SelectItem value="billing">{isAr ? "الفواتير" : "Billing"}</SelectItem>
                        <SelectItem value="technical">{isAr ? "تقني" : "Technical"}</SelectItem>
                        <SelectItem value="account">{isAr ? "الحساب" : "Account"}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>{isAr ? "الأولوية" : "Priority"}</Label>
                    <Select
                      value={priority}
                      onValueChange={(v) => setPriority(v as Priority)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">{isAr ? "منخفضة" : "Low"}</SelectItem>
                        <SelectItem value="normal">{isAr ? "عادية" : "Normal"}</SelectItem>
                        <SelectItem value="high">{isAr ? "مرتفعة" : "High"}</SelectItem>
                        <SelectItem value="urgent">{isAr ? "عاجلة" : "Urgent"}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label>{isAr ? "الوصف" : "Description"}</Label>
                  <Textarea
                    rows={5}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={4000}
                    placeholder={isAr ? "تفاصيل تساعدنا في حل المشكلة..." : "Details that help us solve it..."}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  {isAr ? "إلغاء" : "Cancel"}
                </Button>
                <Button
                  onClick={() => {
                    if (subject.trim().length < 3)
                      return toast.error(
                        isAr ? "الموضوع قصير جداً" : "Subject is too short",
                      );
                    createM.mutate();
                  }}
                  disabled={createM.isPending}
                >
                  <Send className="me-2 size-4" />
                  {isAr ? "إرسال" : "Send"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {ticketsQ.isLoading ? (
          <div className="mt-4 text-sm text-muted-foreground">{isAr ? "جارٍ التحميل..." : "Loading..."}</div>
        ) : (ticketsQ.data?.length ?? 0) === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
            {isAr
              ? "لا توجد تذاكر بعد — أنشئ أول تذكرة أعلاه."
              : "No tickets yet — create one above."}
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-border/60">
            {ticketsQ.data!.map((t) => (
              <li key={t.id} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{t.subject}</span>
                    {t.ticket_number && (
                      <span className="font-mono text-[10px] text-muted-foreground">
                        #{t.ticket_number}
                      </span>
                    )}
                    <Badge variant="outline" className="text-[10px]">
                      {t.status}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {t.priority}
                    </Badge>
                  </div>
                  {t.description && (
                    <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {t.description}
                    </div>
                  )}
                </div>
                <HijriDateBadge date={t.created_at} showGregorian />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
