import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Trash2, Send, Search, ArchiveRestore, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { listMyOrganizations } from "@/lib/organizations.functions";
import {
  listTenants,
  createTenant,
  updateTenant,
  deleteTenant,
  listArchivedTenants,
  restoreTenants,
} from "@/lib/tenants.functions";
import { bulkInsertTenants } from "@/lib/bulk-import.functions";
import { CsvImportDialog } from "@/components/csv-import-dialog";
import { createPortalInvitation } from "@/lib/portal-invitations.functions";

import { sectionHead } from "@/lib/section-og-head";
type Tenant = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  notes: string | null;
  created_at: string;
  deleted_at?: string | null;
};

export const Route = createFileRoute("/_authenticated/dashboard/tenants")({
  head: () => sectionHead({ section: "dashboard", entityAr: "المستأجرون", entityEn: "Tenants", path: "/dashboard/tenants" }),
  component: TenantsPage,
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
          {i18n.t("units.retry")}
        </Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-6">{i18n.t("tenants.notFound")}</div>,
});

function TenantsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const orgsQ = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });
  const orgId = orgsQ.data?.[0]?.org.id;

  const [showArchived, setShowArchived] = useState(false);

  const tenantsQ = useQuery({
    queryKey: ["tenants", orgId, showArchived ? "archived" : "active"],
    queryFn: () =>
      (showArchived
        ? listArchivedTenants({ data: { org_id: orgId! } })
        : listTenants({ data: { org_id: orgId! } })) as Promise<Tenant[]>,
    enabled: !!orgId,
  });

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [creating, setCreating] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [inviting, setInviting] = useState<Tenant | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Tenant | null>(null);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = tenantsQ.data ?? [];
    if (!q) return list;
    return list.filter((row) =>
      [row.full_name, row.email, row.phone, row.nationality].some((v) =>
        v?.toLowerCase().includes(q),
      ),
    );
  }, [tenantsQ.data, search]);

  const deleteMut = useMutation({
    mutationFn: (row: Tenant) => deleteTenant({ data: { id: row.id, org_id: orgId! } }),
    onSuccess: () => {
      toast.success(t("tenants.deleted"));
      qc.invalidateQueries({ queryKey: ["tenants", orgId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("tenants.genericError")),
  });

  const restoreMut = useMutation({
    mutationFn: (row: Tenant) => restoreTenants({ data: { ids: [row.id] } }),
    onSuccess: () => {
      toast.success(t("tenants.restored", { defaultValue: "تم الاسترجاع" }));
      qc.invalidateQueries({ queryKey: ["tenants", orgId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("tenants.genericError")),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("tenants.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("tenants.sub")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showArchived ? "default" : "outline"}
            size="sm"
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived
              ? t("tenants.showActive", { defaultValue: "عرض النشطين" })
              : t("tenants.showArchived", { defaultValue: "عرض المؤرشفين" })}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="size-4 me-2" /> {t("csv.importTenants")}
          </Button>
          <Dialog open={creating} onOpenChange={setCreating}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4 me-2" /> {t("tenants.new")}
              </Button>
            </DialogTrigger>
            {creating && orgId && (
              <TenantForm
                orgId={orgId}
                onDone={() => {
                  setCreating(false);
                  qc.invalidateQueries({ queryKey: ["tenants", orgId] });
                }}
              />
            )}
          </Dialog>
        </div>
      </div>

      {orgId && (
        <CsvImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          title={t("csv.importTenants")}
          templateHeaders={["full_name", "email", "phone", "nationality", "notes"]}
          sampleRow={{
            full_name: "سالم القحطاني",
            email: "tenant@example.com",
            phone: "+966500000001",
            nationality: "سعودي",
            notes: "",
          }}
          onImport={(rows) => bulkInsertTenants({ data: { org_id: orgId, rows } })}
          onDone={() => qc.invalidateQueries({ queryKey: ["tenants", orgId] })}
        />
      )}


      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">{t("tenants.list", { n: rows.length })}</CardTitle>
          <div className="relative w-full max-w-sm">
            <Search className="absolute start-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("tenants.search")}
              className="ps-8"
            />
          </div>
        </CardHeader>
        <CardContent>
          {tenantsQ.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">{t("tenants.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("tenants.colName")}</TableHead>
                    <TableHead>{t("tenants.colEmail")}</TableHead>
                    <TableHead>{t("tenants.colPhone")}</TableHead>
                    <TableHead>{t("tenants.colNationality")}</TableHead>
                    <TableHead className="text-end">{t("tenants.colActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.full_name}</TableCell>
                      <TableCell className="text-muted-foreground">{row.email ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{row.phone ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.nationality ?? "—"}
                      </TableCell>
                      <TableCell className="text-end">
                        <div className="flex items-center justify-end gap-1">
                          {showArchived ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => restoreMut.mutate(row)}
                              title={t("tenants.restore", { defaultValue: "استرجاع" })}
                            >
                              <ArchiveRestore className="size-4" />
                            </Button>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setInviting(row)}
                                disabled={!row.email}
                                title={row.email ? t("tenants.invite") : t("tenants.addEmailFirst")}
                              >
                                <Send className="size-4" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditing(row)}>
                                <Pencil className="size-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive"
                                onClick={() => setConfirmDelete(row)}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && orgId && (
          <TenantForm
            orgId={orgId}
            tenant={editing}
            onDone={() => {
              setEditing(null);
              qc.invalidateQueries({ queryKey: ["tenants", orgId] });
            }}
          />
        )}
      </Dialog>

      <InviteDialog tenant={inviting} orgId={orgId} onClose={() => setInviting(null)} />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("tenants.delTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("tenants.delDesc", { name: confirmDelete?.full_name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("tenants.undo")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmDelete) deleteMut.mutate(confirmDelete);
                setConfirmDelete(null);
              }}
            >
              {t("tenants.confirmDel")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TenantForm({
  orgId,
  tenant,
  onDone,
}: {
  orgId: string;
  tenant?: Tenant;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [full_name, setFullName] = useState(tenant?.full_name ?? "");
  const [email, setEmail] = useState(tenant?.email ?? "");
  const [phone, setPhone] = useState(tenant?.phone ?? "");
  const [nationality, setNationality] = useState(tenant?.nationality ?? "");
  const [notes, setNotes] = useState(tenant?.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (tenant) {
        await updateTenant({
          data: { id: tenant.id, org_id: orgId, full_name, email, phone, nationality, notes },
        });
        toast.success(t("tenants.updated"));
      } else {
        await createTenant({
          data: { org_id: orgId, full_name, email, phone, nationality, notes },
        });
        toast.success(t("tenants.created"));
      }
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("tenants.genericError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{tenant ? t("tenants.editTitle") : t("tenants.newTitle")}</DialogTitle>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label>{t("tenants.fullName")}</Label>
          <Input
            required
            minLength={2}
            value={full_name}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>{t("tenants.emailL")}</Label>
            <Input type="email" value={email ?? ""} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("tenants.phoneL")}</Label>
            <Input value={phone ?? ""} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <div className="space-y-2">
          <Label>{t("tenants.nationalityL")}</Label>
          <Input value={nationality ?? ""} onChange={(e) => setNationality(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>{t("tenants.notesL")}</Label>
          <Textarea rows={3} value={notes ?? ""} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="size-4 me-2 animate-spin" />}
            {t("tenants.save")}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function InviteDialog({
  tenant,
  orgId,
  onClose,
}: {
  tenant: Tenant | null;
  orgId: string | undefined;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  const open = !!tenant;
  const initialEmail = tenant?.email ?? "";
  if (open && email === "" && link === null && initialEmail) {
    setEmail(initialEmail);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!tenant || !orgId) return;
    setSending(true);
    try {
      const inv = await createPortalInvitation({
        data: { orgId, kind: "tenant", targetId: tenant.id, email },
      });
      const url = `${window.location.origin}/portal-invite/${inv.token}`;
      setLink(url);
      await navigator.clipboard.writeText(url).catch(() => {});
      toast.success(t("tenants.inviteCreated"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("tenants.genericError"));
    } finally {
      setSending(false);
    }
  }

  function handleClose(o: boolean) {
    if (!o) {
      setEmail("");
      setLink(null);
      onClose();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("tenants.inviteTitle", { name: tenant?.full_name ?? "" })}</DialogTitle>
        </DialogHeader>
        {link ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("tenants.inviteBody")}</p>
            <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
            <DialogFooter>
              <Button onClick={() => handleClose(false)}>{t("tenants.done")}</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label>{t("tenants.emailL")}</Label>
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={sending}>
                {sending ? (
                  <Loader2 className="size-4 me-2 animate-spin" />
                ) : (
                  <Send className="size-4 me-2" />
                )}
                {t("tenants.createLink")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
