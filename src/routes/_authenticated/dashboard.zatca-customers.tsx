import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Users2,
  Plus,
  Search,
  Pencil,
  Link as LinkIcon,
  Loader2,
  Receipt,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  listZatcaCustomers,
  upsertZatcaCustomer,
  listCustomerInvoices,
  listUnlinkedInvoices,
  linkInvoiceToCustomer,
  type ZatcaCustomerInput,
  type ZatcaCustomerRow,
} from "@/lib/zatca-customers.functions";

export const Route = createFileRoute("/_authenticated/dashboard/zatca-customers")({
  head: () => ({
    meta: [
      { title: "عملاء ZATCA — بوابة الفوترة" },
      {
        name: "description",
        content:
          "إدارة عملاء الفوترة الإلكترونية: أرقام VAT و CR والعناوين الوطنية وربطها بالفواتير.",
      },
    ],
  }),
  component: ZatcaCustomersPage,
});

const EMPTY: ZatcaCustomerInput = {
  full_name: "",
  email: "",
  phone: "",
  vat_number: "",
  cr_number: "",
  address_street: "",
  address_building_number: "",
  address_additional_number: "",
  address_district: "",
  address_city: "",
  address_postal_code: "",
  address_country_code: "SA",
};

function ZatcaCustomersPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<ZatcaCustomerRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["zatca-customers", q],
    queryFn: () => listZatcaCustomers({ data: { q } }),
    staleTime: 20_000,
  });

  const items = list.data?.items ?? [];
  const stats = useMemo(() => {
    let withVat = 0;
    let withAddress = 0;
    let totalInvoices = 0;
    for (const c of items) {
      if (c.vat_number) withVat++;
      if (c.address_city && c.address_postal_code) withAddress++;
      totalInvoices += c.invoice_count;
    }
    return { total: items.length, withVat, withAddress, totalInvoices };
  }, [items]);

  return (
    <div className="space-y-4 p-4 md:space-y-6 md:p-6" dir={isAr ? "rtl" : "ltr"}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
            <Users2 className="size-5 shrink-0 text-primary" />
            <span className="truncate">
              {isAr ? "عملاء ZATCA" : "ZATCA Customers"}
            </span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAr
              ? "إدارة أرقام VAT/CR والعنوان الوطني — تُستخدم في الفواتير الإلكترونية"
              : "Manage VAT/CR numbers and national address — used on e-invoices"}
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="me-1 size-4" />
          {isAr ? "عميل جديد" : "New customer"}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={isAr ? "إجمالي العملاء" : "Customers"} value={String(stats.total)} icon={Users2} />
        <Stat label={isAr ? "لديهم VAT" : "With VAT"} value={String(stats.withVat)} icon={ShieldCheck} />
        <Stat label={isAr ? "عنوان مكتمل" : "Full address"} value={String(stats.withAddress)} />
        <Stat label={isAr ? "فواتير مرتبطة" : "Linked invoices"} value={String(stats.totalInvoices)} icon={Receipt} />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">
              {isAr ? "القائمة" : "Customers"}
            </CardTitle>
            <div className="relative w-full max-w-xs">
              <Search className="absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground start-2" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={isAr ? "بحث بالاسم/VAT/CR" : "Search name / VAT / CR"}
                className="ps-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {list.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {isAr ? "لا يوجد عملاء بعد" : "No customers yet"}
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{isAr ? "الاسم" : "Name"}</TableHead>
                      <TableHead>VAT</TableHead>
                      <TableHead>CR</TableHead>
                      <TableHead>{isAr ? "المدينة" : "City"}</TableHead>
                      <TableHead>{isAr ? "الفواتير" : "Invoices"}</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <div className="font-medium">{c.full_name}</div>
                          {c.email && (
                            <div className="text-xs text-muted-foreground">{c.email}</div>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {c.vat_number ?? "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {c.cr_number ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {c.address_city ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={c.invoice_count > 0 ? "default" : "secondary"}>
                            {c.invoice_count}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-end">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => setLinkingId(c.id)}>
                              <LinkIcon className="size-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>
                              <Pencil className="size-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-2 md:hidden">
                {items.map((c) => (
                  <div key={c.id} className="rounded-lg border border-border/60 bg-card p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{c.full_name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {c.address_city ?? "—"} · {c.invoice_count} {isAr ? "فاتورة" : "inv"}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => setLinkingId(c.id)}>
                          <LinkIcon className="size-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setEditing(c)}>
                          <Pencil className="size-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-1 text-[11px]">
                      <div>
                        <span className="text-muted-foreground">VAT: </span>
                        <span className="font-mono">{c.vat_number ?? "—"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">CR: </span>
                        <span className="font-mono">{c.cr_number ?? "—"}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <EditDialog
        open={creating || !!editing}
        onOpenChange={(o) => {
          if (!o) {
            setCreating(false);
            setEditing(null);
          }
        }}
        initial={editing ? rowToInput(editing) : EMPTY}
        editingId={editing?.id}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["zatca-customers"] });
          setCreating(false);
          setEditing(null);
        }}
        isAr={isAr}
      />

      <LinkDialog
        contactId={linkingId}
        onOpenChange={(o) => !o && setLinkingId(null)}
        onLinked={() => {
          qc.invalidateQueries({ queryKey: ["zatca-customers"] });
          qc.invalidateQueries({ queryKey: ["dashboard-invoices"] });
        }}
        isAr={isAr}
      />
    </div>
  );
}

function rowToInput(r: ZatcaCustomerRow): ZatcaCustomerInput {
  return {
    id: r.id,
    full_name: r.full_name,
    email: r.email ?? "",
    phone: r.phone ?? "",
    vat_number: r.vat_number ?? "",
    cr_number: r.cr_number ?? "",
    address_street: r.address_street ?? "",
    address_building_number: r.address_building_number ?? "",
    address_additional_number: r.address_additional_number ?? "",
    address_district: r.address_district ?? "",
    address_city: r.address_city ?? "",
    address_postal_code: r.address_postal_code ?? "",
    address_country_code: r.address_country_code ?? "SA",
  };
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {Icon && <Icon className="size-3.5" />}
          {label}
        </div>
        <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function EditDialog({
  open,
  onOpenChange,
  initial,
  editingId,
  onSaved,
  isAr,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: ZatcaCustomerInput;
  editingId?: string;
  onSaved: () => void;
  isAr: boolean;
}) {
  const [form, setForm] = useState<ZatcaCustomerInput>(initial);
  // Reset form when dialog opens with new data
  useMemo(() => {
    if (open) setForm(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingId]);

  const save = useMutation({
    mutationFn: () =>
      upsertZatcaCustomer({
        data: { ...form, id: editingId },
      }),
    onSuccess: () => {
      toast.success(isAr ? "تم الحفظ" : "Saved");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const upd = (k: keyof ZatcaCustomerInput) => (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editingId
              ? isAr ? "تعديل عميل ZATCA" : "Edit ZATCA customer"
              : isAr ? "عميل ZATCA جديد" : "New ZATCA customer"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={isAr ? "الاسم" : "Full name"} required>
            <Input value={form.full_name} onChange={upd("full_name")} />
          </Field>
          <Field label={isAr ? "البريد" : "Email"}>
            <Input value={form.email ?? ""} onChange={upd("email")} type="email" />
          </Field>
          <Field label={isAr ? "الهاتف" : "Phone"}>
            <Input value={form.phone ?? ""} onChange={upd("phone")} />
          </Field>
          <Field label="VAT" hint={isAr ? "15 رقم، يبدأ وينتهي بـ 3" : "15 digits, 3…3"}>
            <Input value={form.vat_number ?? ""} onChange={upd("vat_number")} inputMode="numeric" maxLength={15} className="font-mono" />
          </Field>
          <Field label="CR" hint={isAr ? "7-10 أرقام" : "7-10 digits"}>
            <Input value={form.cr_number ?? ""} onChange={upd("cr_number")} inputMode="numeric" maxLength={10} className="font-mono" />
          </Field>
          <Field label={isAr ? "الدولة" : "Country"}>
            <Input value={form.address_country_code ?? "SA"} onChange={upd("address_country_code")} maxLength={2} />
          </Field>
        </div>

        <div className="mt-2 border-t pt-3">
          <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
            {isAr ? "العنوان الوطني" : "National Address"}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={isAr ? "الشارع" : "Street"}>
              <Input value={form.address_street ?? ""} onChange={upd("address_street")} />
            </Field>
            <Field label={isAr ? "الحي" : "District"}>
              <Input value={form.address_district ?? ""} onChange={upd("address_district")} />
            </Field>
            <Field label={isAr ? "رقم المبنى" : "Building #"} hint="4 digits">
              <Input value={form.address_building_number ?? ""} onChange={upd("address_building_number")} inputMode="numeric" maxLength={4} className="font-mono" />
            </Field>
            <Field label={isAr ? "الرقم الإضافي" : "Additional #"} hint="4 digits">
              <Input value={form.address_additional_number ?? ""} onChange={upd("address_additional_number")} inputMode="numeric" maxLength={4} className="font-mono" />
            </Field>
            <Field label={isAr ? "المدينة" : "City"}>
              <Input value={form.address_city ?? ""} onChange={upd("address_city")} />
            </Field>
            <Field label={isAr ? "الرمز البريدي" : "Postal code"} hint="5 digits">
              <Input value={form.address_postal_code ?? ""} onChange={upd("address_postal_code")} inputMode="numeric" maxLength={5} className="font-mono" />
            </Field>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {isAr ? "إلغاء" : "Cancel"}
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || !form.full_name.trim()}
          >
            {save.isPending && <Loader2 className="me-1 size-4 animate-spin" />}
            {isAr ? "حفظ" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">
        {label}
        {required && <span className="ms-1 text-destructive">*</span>}
        {hint && <span className="ms-2 text-[10px] font-normal text-muted-foreground">{hint}</span>}
      </Label>
      {children}
    </div>
  );
}

function LinkDialog({
  contactId,
  onOpenChange,
  onLinked,
  isAr,
}: {
  contactId: string | null;
  onOpenChange: (o: boolean) => void;
  onLinked: () => void;
  isAr: boolean;
}) {
  const open = !!contactId;
  const linked = useQuery({
    queryKey: ["zatca-customer-invoices", contactId],
    queryFn: () => listCustomerInvoices({ data: { contact_id: contactId! } }),
    enabled: open,
  });
  const unlinked = useQuery({
    queryKey: ["zatca-unlinked-invoices"],
    queryFn: () => listUnlinkedInvoices(),
    enabled: open,
  });
  const link = useMutation({
    mutationFn: (invoice_id: string) =>
      linkInvoiceToCustomer({ data: { invoice_id, contact_id: contactId } }),
    onSuccess: () => {
      toast.success(isAr ? "تم الربط" : "Linked");
      linked.refetch();
      unlinked.refetch();
      onLinked();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const unlink = useMutation({
    mutationFn: (invoice_id: string) =>
      linkInvoiceToCustomer({ data: { invoice_id, contact_id: null } }),
    onSuccess: () => {
      linked.refetch();
      unlinked.refetch();
      onLinked();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isAr ? "ربط الفواتير بالعميل" : "Link invoices to customer"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <section>
            <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              {isAr ? "المرتبطة حاليًا" : "Currently linked"}
            </div>
            {linked.isLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (linked.data?.items ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">{isAr ? "لا شيء" : "None"}</p>
            ) : (
              <ul className="max-h-64 space-y-1 overflow-auto">
                {linked.data!.items.map((inv: any) => (
                  <li key={inv.id} className="flex items-center justify-between rounded border p-2 text-xs">
                    <span className="font-mono">{inv.number ?? inv.id.slice(0, 8)}</span>
                    <span className="text-muted-foreground">{inv.issue_date}</span>
                    <Button size="sm" variant="ghost" onClick={() => unlink.mutate(inv.id)}>
                      {isAr ? "فصل" : "Unlink"}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              {isAr ? "فواتير غير مربوطة" : "Unlinked invoices"}
            </div>
            {unlinked.isLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (unlinked.data?.items ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">{isAr ? "لا شيء" : "None"}</p>
            ) : (
              <ul className="max-h-64 space-y-1 overflow-auto">
                {unlinked.data!.items.map((inv: any) => (
                  <li key={inv.id} className="flex items-center justify-between rounded border p-2 text-xs">
                    <span className="font-mono">{inv.number ?? inv.id.slice(0, 8)}</span>
                    <span className="text-muted-foreground">{inv.issue_date}</span>
                    <Button size="sm" variant="outline" onClick={() => link.mutate(inv.id)}>
                      <LinkIcon className="me-1 size-3" />
                      {isAr ? "ربط" : "Link"}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {isAr ? "إغلاق" : "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
