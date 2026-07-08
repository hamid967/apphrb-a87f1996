import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Pencil, Trash2, Mail, Phone, Upload } from "lucide-react";
import { toast } from "sonner";
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
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listMyOrganizations } from "@/lib/organizations.functions";
import {
  createContact,
  deleteContact,
  importContacts,
  listContacts,
  updateContact,
} from "@/lib/crm.functions";
import { can, type OrgRole } from "@/lib/permissions";
import { CsvImportDialog } from "@/components/csv-import-dialog";

export const Route = createFileRoute("/_authenticated/contacts/")({
  component: ContactsPage,
});

type ContactType = "buyer" | "seller" | "tenant" | "landlord" | "other";
type Contact = {
  id: string;
  org_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  contact_type: ContactType;
  tags: string[] | null;
  notes: string | null;
};

const TYPES: ContactType[] = ["buyer", "seller", "tenant", "landlord", "other"];

function ContactsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const orgsQ = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });
  const membership = orgsQ.data?.[0];
  const org = membership?.org;
  const role = membership?.role as OrgRole | undefined;
  const canEdit = can.editCRM(role);
  const canDelete = can.deleteCRM(role);

  const listQ = useQuery({
    queryKey: ["contacts", org?.id],
    queryFn: () => listContacts({ data: { org_id: org!.id } }),
    enabled: !!org,
  });

  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Contact | null>(null);
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const rows = useMemo(() => {
    const list = (listQ.data ?? []) as Contact[];
    const term = q.trim().toLowerCase();
    if (!term) return list;
    return list.filter((c) =>
      `${c.full_name} ${c.email ?? ""} ${c.phone ?? ""}`.toLowerCase().includes(term),
    );
  }, [listQ.data, q]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["contacts", org?.id] });

  const del = useMutation({
    mutationFn: (id: string) => deleteContact({ data: { id } }),
    onSuccess: () => {
      invalidate();
      toast.success("Deleted");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("crm.contacts.title")}
        </h1>
        {canEdit && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="me-2 size-4" /> {t("csv.importContacts")}
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <Plus className="me-2 size-4" /> {t("crm.contacts.add")}
            </Button>
          </div>
        )}
      </div>

      <div className="mt-6 relative max-w-md">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("crm.contacts.search")}
          className="ps-9"
        />
      </div>

      <div className="mt-6 overflow-hidden surface-card">
        {rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            {t("crm.contacts.empty")}
          </div>
        ) : (
          <ul className="divide-y">
            {rows.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="truncate font-medium">{c.full_name}</div>
                    <Badge variant="secondary">{t(`crm.contacts.types.${c.contact_type}`)}</Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {c.email && (
                      <span className="inline-flex items-center gap-1">
                        <Mail className="size-3" /> {c.email}
                      </span>
                    )}
                    {c.phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="size-3" /> {c.phone}
                      </span>
                    )}
                  </div>
                  {c.tags && c.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {c.tags.map((tag) => (
                        <Badge key={tag} variant="outline">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditing(c);
                        setOpen(true);
                      }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                  )}
                  {canDelete && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (window.confirm(t("crm.contacts.confirmDelete"))) del.mutate(c.id);
                      }}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {org && (
        <ContactDialog
          open={open}
          onOpenChange={setOpen}
          orgId={org.id}
          initial={editing}
          onSaved={invalidate}
        />
      )}
      {org && (
        <CsvImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          title={t("csv.importContacts")}
          templateHeaders={["full_name", "email", "phone", "contact_type", "tags", "notes"]}
          sampleRow={{
            full_name: "Sara Ahmed",
            email: "sara@example.com",
            phone: "+966500000000",
            contact_type: "buyer",
            tags: "vip,riyadh",
            notes: "",
          }}
          onImport={(rows) => importContacts({ data: { org_id: org.id, rows } })}
          onDone={invalidate}
        />
      )}
    </div>
  );
}

function ContactDialog({
  open,
  onOpenChange,
  orgId,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgId: string;
  initial: Contact | null;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    full_name: initial?.full_name ?? "",
    email: initial?.email ?? "",
    phone: initial?.phone ?? "",
    contact_type: (initial?.contact_type ?? "buyer") as ContactType,
    tags: (initial?.tags ?? []).join(", "),
    notes: initial?.notes ?? "",
  });

  const save = useMutation({
    mutationFn: async () => {
      const tags = form.tags
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (initial) {
        return updateContact({
          data: {
            id: initial.id,
            full_name: form.full_name,
            email: form.email,
            phone: form.phone,
            contact_type: form.contact_type,
            tags,
            notes: form.notes,
          },
        });
      }
      return createContact({
        data: {
          org_id: orgId,
          full_name: form.full_name,
          email: form.email,
          phone: form.phone,
          contact_type: form.contact_type,
          tags,
          notes: form.notes,
        },
      });
    },
    onSuccess: () => {
      toast.success("Saved");
      onSaved();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? t("crm.contacts.edit") : t("crm.contacts.create")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>{t("crm.contacts.fullName")}</Label>
            <Input
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>{t("crm.contacts.email")}</Label>
              <Input
                type="email"
                value={form.email ?? ""}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("crm.contacts.phone")}</Label>
              <Input
                value={form.phone ?? ""}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>{t("crm.contacts.type")}</Label>
            <Select
              value={form.contact_type}
              onValueChange={(v) => setForm({ ...form, contact_type: v as ContactType })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((tp) => (
                  <SelectItem key={tp} value={tp}>
                    {t(`crm.contacts.types.${tp}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("crm.contacts.tags")}</Label>
            <Input
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              placeholder="vip, riyadh"
            />
          </div>
          <div>
            <Label>{t("crm.contacts.notes")}</Label>
            <Textarea
              rows={3}
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => save.mutate()} disabled={!form.full_name.trim() || save.isPending}>
            {t("crm.contacts.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
