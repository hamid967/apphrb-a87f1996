import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AdminListShell } from "@/components/admin/AdminListShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";

type Provider = {
  id: string;
  name: string;
  provider: string;
  config: Record<string, any>;
  active: boolean;
  org_name: string | null;
  created_at: string;
};

interface Props {
  titleAr: string;
  titleEn: string;
  descAr: string;
  descEn: string;
  queryKey: string;
  listFn: () => Promise<any[]>;
  upsertFn: (a: { data: any }) => Promise<any>;
  toggleFn: (a: { data: { id: string; active: boolean } }) => Promise<any>;
}

export function ProvidersPage(props: Props) {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    provider: "",
    configText: "{}",
    active: true,
  });

  const toggleMut = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => props.toggleFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [props.queryKey] });
      toast.success(isAr ? "تم التحديث" : "Updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const saveMut = useMutation({
    mutationFn: (v: any) => props.upsertFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [props.queryKey] });
      setOpen(false);
      setForm({ name: "", provider: "", configText: "{}", active: true });
      toast.success(isAr ? "تم الحفظ" : "Saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <AdminListShell<Provider>
      titleAr={props.titleAr}
      titleEn={props.titleEn}
      descAr={props.descAr}
      descEn={props.descEn}
      queryKey={props.queryKey}
      listFn={() => props.listFn() as Promise<Provider[]>}
      searchFields={(r) => [r.name, r.provider, r.org_name]}
      toolbar={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4 mr-1" />
              {isAr ? "إضافة" : "Add"}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{isAr ? "مزود جديد" : "New provider"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 py-2">
              <div>
                <Label>{isAr ? "الاسم" : "Name"}</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <Label>{isAr ? "نوع المزود" : "Provider type"}</Label>
                <Input
                  placeholder="resend / mailgun / twilio / gatewayapi"
                  value={form.provider}
                  onChange={(e) => setForm({ ...form, provider: e.target.value })}
                />
              </div>
              <div>
                <Label>{isAr ? "الإعدادات (JSON)" : "Config (JSON)"}</Label>
                <Textarea
                  rows={5}
                  className="font-mono text-xs"
                  value={form.configText}
                  onChange={(e) => setForm({ ...form, configText: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.active}
                  onCheckedChange={(v) => setForm({ ...form, active: v })}
                />
                <Label>{isAr ? "مفعّل" : "Active"}</Label>
              </div>
            </div>
            <DialogFooter>
              <Button
                disabled={saveMut.isPending || !form.name || !form.provider}
                onClick={() => {
                  let config: any = {};
                  try {
                    config = JSON.parse(form.configText || "{}");
                  } catch {
                    toast.error(isAr ? "JSON غير صالح" : "Invalid JSON");
                    return;
                  }
                  saveMut.mutate({
                    name: form.name,
                    provider: form.provider,
                    active: form.active,
                    config,
                  });
                }}
              >
                {isAr ? "حفظ" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }
      columns={[
        {
          key: "name",
          labelAr: "الاسم",
          labelEn: "Name",
          render: (r) => <span className="font-medium">{r.name}</span>,
        },
        {
          key: "provider",
          labelAr: "المزود",
          labelEn: "Provider",
          render: (r) => <Badge variant="outline">{r.provider}</Badge>,
        },
        {
          key: "org",
          labelAr: "الشركة",
          labelEn: "Company",
          render: (r) => (
            <span className="text-sm text-muted-foreground">{r.org_name ?? "—"}</span>
          ),
        },
        {
          key: "active",
          labelAr: "الحالة",
          labelEn: "Status",
          render: (r) => (
            <Switch
              checked={r.active}
              onCheckedChange={(v) => toggleMut.mutate({ id: r.id, active: v })}
            />
          ),
        },
      ]}
    />
  );
}
