import { t } from "@/lib/i18n";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AdminListShell } from "@/components/admin/AdminListShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { listBanks, upsertBank, deleteBank } from "@/lib/admin-platform.functions";
import { sectionHead } from "@/lib/section-og-head";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/banks")({
  head: () =>
    sectionHead({
      section: "admin",
      entityAr: "البنوك",
      entityEn: "Banks",
      path: "/admin/banks",
    }),
  component: AdminBanksPage,
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
  notFoundComponent: () => <div className="p-6">{t("common.notFound")}</div>,
});

type Bank = {
  id: string;
  name: string;
  swift: string | null;
  country_name_ar: string | null;
  country_name_en: string | null;
};

function AdminBanksPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const listFn = useServerFn(listBanks);
  const upFn = useServerFn(upsertBank);
  const delFn = useServerFn(deleteBank);
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", swift: "" });

  const saveMut = useMutation({
    mutationFn: (v: any) => upFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-banks"] });
      setOpen(false);
      setForm({ name: "", swift: "" });
      toast.success(isAr ? "تم الحفظ" : "Saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-banks"] });
      toast.success(isAr ? "تم الحذف" : "Deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <AdminListShell<Bank>
      titleAr="البنوك المرجعية"
      titleEn="Reference Banks"
      descAr="قائمة البنوك المتاحة عند إضافة حسابات الشركات."
      descEn="Bank directory used when adding company bank accounts."
      queryKey="admin-banks"
      listFn={() => listFn() as Promise<Bank[]>}
      searchFields={(b) => [b.name, b.swift]}
      toolbar={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4 mr-1" />
              {isAr ? "بنك جديد" : "New bank"}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{isAr ? "إضافة بنك" : "Add bank"}</DialogTitle>
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
                <Label>SWIFT / BIC</Label>
                <Input
                  value={form.swift}
                  onChange={(e) => setForm({ ...form, swift: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                disabled={saveMut.isPending || !form.name}
                onClick={() =>
                  saveMut.mutate({ name: form.name, swift: form.swift || null })
                }
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
          render: (b) => <span className="font-medium">{b.name}</span>,
        },
        {
          key: "swift",
          labelAr: "سويفت",
          labelEn: "SWIFT",
          render: (b) => <span className="font-mono text-xs">{b.swift ?? "—"}</span>,
        },
        {
          key: "country",
          labelAr: "الدولة",
          labelEn: "Country",
          render: (b) => (
            <span className="text-sm">
              {(isAr ? b.country_name_ar : b.country_name_en) ?? "—"}
            </span>
          ),
        },
        {
          key: "actions",
          labelAr: "",
          labelEn: "",
          render: (b) => (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (confirm(isAr ? "حذف البنك؟" : "Delete bank?")) delMut.mutate(b.id);
              }}
            >
              <Trash2 className="size-3.5 text-destructive" />
            </Button>
          ),
        },
      ]}
    />
  );
}
