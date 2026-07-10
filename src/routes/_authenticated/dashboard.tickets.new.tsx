import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowLeft, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { createStaffTicket } from "@/lib/staff-tickets.functions";

export const Route = createFileRoute("/_authenticated/dashboard/tickets/new")({
  head: () => ({
    meta: [
      { title: "تذكرة جديدة — HBSpro" },
      { name: "description", content: "إنشاء تذكرة دعم جديدة." },
    ],
  }),
  component: NewTicketPage,
});

function NewTicketPage() {
  const nav = useNavigate();
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");

  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [channel, setChannel] = useState<"portal" | "email" | "phone" | "whatsapp" | "internal">("internal");

  const m = useMutation({
    mutationFn: () =>
      createStaffTicket({
        data: {
          subject,
          description: description || undefined,
          category: category || undefined,
          priority,
          channel,
          tags: [],
        },
      }),
    onSuccess: (row) => {
      toast.success(isAr ? `تم إنشاء ${row.ticket_number}` : `Created ${row.ticket_number}`);
      nav({ to: "/dashboard/tickets/$id", params: { id: row.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4" dir={isAr ? "rtl" : "ltr"}>
      <Button variant="ghost" size="sm" onClick={() => nav({ to: "/dashboard/tickets" })}>
        <ArrowLeft className="h-4 w-4 me-1 rtl:rotate-180" />
        {isAr ? "العودة" : "Back"}
      </Button>

      <Card className="p-6 space-y-4">
        <div>
          <h1 className="text-xl font-bold">
            {isAr ? "تذكرة دعم جديدة" : "New support ticket"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isAr ? "املأ التفاصيل أدناه لتسجيل التذكرة." : "Fill in the details below."}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="subject">{isAr ? "الموضوع" : "Subject"} *</Label>
          <Input
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
            maxLength={200}
            placeholder={isAr ? "وصف قصير" : "Short summary"}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">{isAr ? "الوصف" : "Description"}</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            maxLength={4000}
            placeholder={isAr ? "تفاصيل المشكلة أو الطلب…" : "Details of the issue…"}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-2">
            <Label>{isAr ? "الأولوية" : "Priority"}</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">{isAr ? "منخفضة" : "Low"}</SelectItem>
                <SelectItem value="normal">{isAr ? "عادية" : "Normal"}</SelectItem>
                <SelectItem value="high">{isAr ? "عالية" : "High"}</SelectItem>
                <SelectItem value="urgent">{isAr ? "عاجلة" : "Urgent"}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{isAr ? "القناة" : "Channel"}</Label>
            <Select value={channel} onValueChange={(v) => setChannel(v as typeof channel)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="internal">{isAr ? "داخلي" : "Internal"}</SelectItem>
                <SelectItem value="portal">{isAr ? "بوابة" : "Portal"}</SelectItem>
                <SelectItem value="email">{isAr ? "بريد" : "Email"}</SelectItem>
                <SelectItem value="phone">{isAr ? "هاتف" : "Phone"}</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">{isAr ? "التصنيف" : "Category"}</Label>
            <Input
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              maxLength={60}
              placeholder={isAr ? "مثال: صيانة" : "e.g. Maintenance"}
            />
          </div>
        </div>

        <Button
          onClick={() => m.mutate()}
          disabled={m.isPending || subject.trim().length < 3}
          className="w-full"
        >
          <Send className="h-4 w-4 me-1" />
          {isAr ? "إنشاء التذكرة" : "Create ticket"}
        </Button>
      </Card>
    </div>
  );
}
