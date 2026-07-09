import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
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
import { listPackages, upsertPackage, togglePackageActive } from "@/lib/admin-platform.functions";
import { sectionHead } from "@/lib/section-og-head";
import { Plus, Pencil } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/plans")({
  head: () =>
    sectionHead({ section: "admin", entityAr: "الباقات", entityEn: "Plans", path: "/admin/plans" }),
  component: AdminPlansPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-6">
        <p className="text-destructive mb-2">{error.message}</p>
        <Button
          onClick={() => {
            reset();
            router.invalidate();
          }}
        >
          Retry
        </Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-6">Not found</div>,
});

type PackageRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price_monthly: number;
  price_yearly: number;
  max_users: number | null;
  max_properties: number | null;
  max_units: number | null;
  active: boolean;
};

function AdminPlansPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const listFn = useServerFn(listPackages);
  const upsertFn = useServerFn(upsertPackage);
  const toggleFn = useServerFn(togglePackageActive);
  const qc = useQueryClient();

  const [editing, setEditing] = useState<PackageRow | null>(null);
  const [open, setOpen] = useState(false);

  const toggleMut = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => toggleFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-plans"] });
      toast.success(isAr ? "تم التحديث" : "Updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const saveMut = useMutation({
    mutationFn: (v: any) => upsertFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-plans"] });
      setOpen(false);
      setEditing(null);
      toast.success(isAr ? "تم الحفظ" : "Saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      <AdminListShell<PackageRow>
        titleAr="الباقات والاشتراكات"
        titleEn="Plans & Packages"
        descAr="إدارة باقات الاشتراك المتاحة للعملاء وحدود الاستخدام."
        descEn="Manage subscription plans available to customers and their limits."
        queryKey="admin-plans"
        listFn={() => listFn() as Promise<PackageRow[]>}
        searchFields={(r) => [r.name, r.code]}
        toolbar={
          <Dialog
            open={open}
            onOpenChange={(o) => {
              setOpen(o);
              if (!o) setEditing(null);
            }}
          >
            <DialogTrigger asChild>
              <Button onClick={() => setEditing(null)}>
                <Plus className="size-4 mr-1" />
                {isAr ? "باقة جديدة" : "New plan"}
              </Button>
            </DialogTrigger>
            <PlanDialog
              key={editing?.id ?? "new"}
              initial={editing}
              isAr={!!isAr}
              onSubmit={(v) => saveMut.mutate(v)}
              submitting={saveMut.isPending}
            />
          </Dialog>
        }
        columns={[
          { key: "code", labelAr: "الكود", labelEn: "Code", render: (r) => <span className="font-mono text-xs">{r.code}</span> },
          { key: "name", labelAr: "الاسم", labelEn: "Name", render: (r) => <span className="font-medium">{r.name}</span> },
          {
            key: "price",
            labelAr: "السعر (شهري / سنوي)",
            labelEn: "Price (M / Y)",
            render: (r) => (
              <span className="text-sm">
                {r.price_monthly} / {r.price_yearly} SAR
              </span>
            ),
          },
          {
            key: "limits",
            labelAr: "الحدود",
            labelEn: "Limits",
            render: (r) => (
              <span className="text-xs text-muted-foreground">
                {r.max_users ?? "∞"} {isAr ? "مستخدم" : "users"} · {r.max_properties ?? "∞"}{" "}
                {isAr ? "عقار" : "properties"} · {r.max_units ?? "∞"} {isAr ? "وحدة" : "units"}
              </span>
            ),
          },
          {
            key: "active",
            labelAr: "الحالة",
            labelEn: "Status",
            render: (r) => (
              <div className="flex items-center gap-2">
                <Switch
                  checked={r.active}
                  onCheckedChange={(v) => toggleMut.mutate({ id: r.id, active: v })}
                />
                <Badge variant={r.active ? "default" : "secondary"}>
                  {r.active ? (isAr ? "مفعّل" : "Active") : isAr ? "متوقف" : "Inactive"}
                </Badge>
              </div>
            ),
          },
          {
            key: "actions",
            labelAr: "",
            labelEn: "",
            render: (r) => (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(r);
                  setOpen(true);
                }}
              >
                <Pencil className="size-3.5" />
              </Button>
            ),
          },
        ]}
      />
    </>
  );
}

function PlanDialog({
  initial,
  isAr,
  onSubmit,
  submitting,
}: {
  initial: PackageRow | null;
  isAr: boolean;
  onSubmit: (v: any) => void;
  submitting: boolean;
}) {
  const [form, setForm] = useState({
    id: initial?.id,
    code: initial?.code ?? "",
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    price_monthly: initial?.price_monthly ?? 0,
    price_yearly: initial?.price_yearly ?? 0,
    max_users: initial?.max_users ?? null,
    max_properties: initial?.max_properties ?? null,
    max_units: initial?.max_units ?? null,
    active: initial?.active ?? true,
  });
  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>
          {initial ? (isAr ? "تعديل الباقة" : "Edit plan") : isAr ? "باقة جديدة" : "New plan"}
        </DialogTitle>
      </DialogHeader>
      <div className="grid gap-4 py-2">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{isAr ? "الكود" : "Code"}</Label>
            <Input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </div>
          <div>
            <Label>{isAr ? "الاسم" : "Name"}</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
        </div>
        <div>
          <Label>{isAr ? "الوصف" : "Description"}</Label>
          <Textarea
            value={form.description ?? ""}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{isAr ? "السعر الشهري" : "Monthly price"}</Label>
            <Input
              type="number"
              value={form.price_monthly}
              onChange={(e) => setForm({ ...form, price_monthly: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>{isAr ? "السعر السنوي" : "Yearly price"}</Label>
            <Input
              type="number"
              value={form.price_yearly}
              onChange={(e) => setForm({ ...form, price_yearly: Number(e.target.value) })}
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>{isAr ? "مستخدمون" : "Users"}</Label>
            <Input
              type="number"
              value={form.max_users ?? ""}
              onChange={(e) =>
                setForm({ ...form, max_users: e.target.value ? Number(e.target.value) : null })
              }
            />
          </div>
          <div>
            <Label>{isAr ? "عقارات" : "Properties"}</Label>
            <Input
              type="number"
              value={form.max_properties ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  max_properties: e.target.value ? Number(e.target.value) : null,
                })
              }
            />
          </div>
          <div>
            <Label>{isAr ? "وحدات" : "Units"}</Label>
            <Input
              type="number"
              value={form.max_units ?? ""}
              onChange={(e) =>
                setForm({ ...form, max_units: e.target.value ? Number(e.target.value) : null })
              }
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={form.active}
            onCheckedChange={(v) => setForm({ ...form, active: v })}
          />
          <Label>{isAr ? "مفعّلة" : "Active"}</Label>
        </div>
      </div>
      <DialogFooter>
        <Button
          disabled={submitting || !form.code || !form.name}
          onClick={() =>
            onSubmit({
              ...form,
              description: form.description || null,
            })
          }
        >
          {isAr ? "حفظ" : "Save"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
