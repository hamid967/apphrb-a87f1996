import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { listMyOrganizations } from "@/lib/organizations.functions";
import {
  createTechnician,
  deleteTechnician,
  listTechnicians,
  updateTechnician,
} from "@/lib/maintenance.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Plus, Trash2, Mail, Phone } from "lucide-react";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/dashboard/maintenance/technicians")({
  head: () => sectionHead({ section: "dashboard", entityAr: "الفنيون", entityEn: "Technicians", path: "/dashboard/maintenance/technicians" }),
  component: TechniciansPage,
});

function TechniciansPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const orgsQ = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });
  const orgId = orgsQ.data?.[0]?.org?.id;

  const q = useQuery({
    queryKey: ["technicians", orgId],
    queryFn: () => listTechnicians({ data: { orgId: orgId! } }),
    enabled: !!orgId,
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    specialty: "",
    hourly_rate: "",
    notes: "",
  });

  const create = useMutation({
    mutationFn: (payload: any) => createTechnician({ data: payload }),
    onSuccess: () => {
      toast.success(t("maintenance.toast.technicianAdded"));
      qc.invalidateQueries({ queryKey: ["technicians", orgId] });
      setOpen(false);
      setForm({ full_name: "", email: "", phone: "", specialty: "", hourly_rate: "", notes: "" });
    },
    onError: (e: any) => toast.error(e?.message ?? t("maintenance.toast.failed")),
  });

  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      updateTechnician({ data: { id, patch: { active } } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["technicians", orgId] }),
    onError: (e: any) => toast.error(e?.message ?? t("maintenance.toast.failed")),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteTechnician({ data: { id } }),
    onSuccess: () => {
      toast.success(t("maintenance.toast.technicianRemoved"));
      qc.invalidateQueries({ queryKey: ["technicians", orgId] });
    },
    onError: (e: any) => toast.error(e?.message ?? t("maintenance.toast.failed")),
  });

  const rows = q.data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>{t("maintenance.technicians.headerTitle")}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("maintenance.technicians.headerSubtitle")}
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="size-4" /> {t("maintenance.actions.addTechnician")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("maintenance.dialog.newTechnician")}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 py-2">
              <Field label={t("maintenance.fields.fullName")}>
                <Input
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("maintenance.fields.email")}>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </Field>
                <Field label={t("maintenance.fields.phone")}>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("maintenance.fields.specialty")}>
                  <Input
                    value={form.specialty}
                    onChange={(e) => setForm({ ...form, specialty: e.target.value })}
                    placeholder={t("maintenance.placeholders.specialtyHint")}
                  />
                </Field>
                <Field label={t("maintenance.fields.hourlyRate")}>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.hourly_rate}
                    onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })}
                  />
                </Field>
              </div>
              <Field label={t("maintenance.fields.notes")}>
                <Textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </Field>
            </div>
            <DialogFooter>
              <Button
                disabled={create.isPending || !form.full_name}
                onClick={() =>
                  create.mutate({
                    org_id: orgId!,
                    full_name: form.full_name,
                    email: form.email || null,
                    phone: form.phone || null,
                    specialty: form.specialty || null,
                    hourly_rate: form.hourly_rate ? Number(form.hourly_rate) : null,
                    notes: form.notes || null,
                    active: true,
                  })
                }
              >
                {create.isPending && <Loader2 className="me-2 size-4 animate-spin" />}{" "}
                {t("maintenance.actions.add")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="p-0">
        {q.isLoading ? (
          <div className="grid place-items-center p-12">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            {t("maintenance.empty.technicians")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">{t("maintenance.technicians.colName")}</th>
                  <th className="px-4 py-2">{t("maintenance.technicians.colSpecialty")}</th>
                  <th className="px-4 py-2">{t("maintenance.technicians.colContact")}</th>
                  <th className="px-4 py-2">{t("maintenance.technicians.colRate")}</th>
                  <th className="px-4 py-2">{t("maintenance.technicians.colActive")}</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => (
                  <tr key={r.id} className="border-b border-border/30 last:border-0">
                    <td className="px-4 py-2 font-medium">{r.full_name}</td>
                    <td className="px-4 py-2">
                      {r.specialty ? (
                        <Badge variant="secondary" className="rounded-full">
                          {r.specialty}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      <div className="flex flex-col gap-0.5">
                        {r.email && (
                          <span className="inline-flex items-center gap-1">
                            <Mail className="size-3" /> {r.email}
                          </span>
                        )}
                        {r.phone && (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="size-3" /> {r.phone}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      {r.hourly_rate ? (
                        `${Number(r.hourly_rate).toFixed(2)} SAR${t("maintenance.technicians.ratePerHour")}`
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <Switch
                        checked={r.active}
                        onCheckedChange={(v) => toggle.mutate({ id: r.id, active: v })}
                      />
                    </td>
                    <td className="px-4 py-2 text-end">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(t("maintenance.actions.deleteTechnicianConfirm")))
                            del.mutate(r.id);
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs uppercase text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
