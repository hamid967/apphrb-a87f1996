import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Wrench } from "lucide-react";
import { tenantMyContext, tenantListTickets, tenantCreateTicket } from "@/lib/appfolio.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/portal/tenant/maintenance")({
  head: () => ({
    meta: [{ title: "طلبات الصيانة — بوابة المستأجر" }, { name: "robots", content: "noindex" }],
  }),
  component: Page,
});

function Page() {
  const qc = useQueryClient();
  const ctxQ = useQuery({ queryKey: ["tenant", "ctx"], queryFn: () => tenantMyContext() });
  const tenant = ctxQ.data?.tenant as { id: string; org_id: string } | undefined;
  const ticketsQ = useQuery({
    queryKey: ["tenant", "tickets", tenant?.id],
    queryFn: () => tenantListTickets({ data: { tenantId: tenant!.id } }),
    enabled: !!tenant?.id,
  });
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [priority, setPriority] = useState("medium");
  const create = useMutation({
    mutationFn: () =>
      tenantCreateTicket({
        data: { orgId: tenant!.org_id, tenantId: tenant!.id, title, description: desc, priority },
      }),
    onSuccess: () => {
      toast.success("تم إرسال الطلب");
      setTitle("");
      setDesc("");
      qc.invalidateQueries({ queryKey: ["tenant", "tickets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!ctxQ.data?.linked)
    return (
      <div className="mx-auto max-w-4xl p-6 text-sm text-muted-foreground">
        لم يتم ربط حسابك بمستأجر.
      </div>
    );

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <h1 className="flex items-center gap-2 text-2xl font-semibold">
        <Wrench className="size-6" /> طلبات الصيانة
      </h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">طلب جديد</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>العنوان</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: تسرب في المطبخ"
            />
          </div>
          <div>
            <Label>الوصف</Label>
            <Textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={4}
              placeholder="اشرح المشكلة"
            />
          </div>
          <div>
            <Label>الأولوية</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">منخفضة</SelectItem>
                <SelectItem value="medium">متوسطة</SelectItem>
                <SelectItem value="high">عالية</SelectItem>
                <SelectItem value="urgent">عاجلة</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => create.mutate()}
            disabled={title.length < 3 || desc.length < 5 || create.isPending}
          >
            إرسال الطلب
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">طلباتي</CardTitle>
        </CardHeader>
        <CardContent>
          {ticketsQ.isLoading ? (
            <Loader2 className="animate-spin" />
          ) : (ticketsQ.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد طلبات بعد.</p>
          ) : (
            <div className="space-y-2">
              {(ticketsQ.data ?? []).map((t) => (
                <div key={t.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{t.title}</div>
                    <Badge>{t.status}</Badge>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">{t.description}</div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    #{t.ticket_no} · {new Date(t.created_at).toLocaleString("ar")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
