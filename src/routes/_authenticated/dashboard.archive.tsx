import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Search,
  Upload,
  FileText,
  Loader2,
  Sparkles,
  Trash2,
  Download,
  Building2,
  User as UserIcon,
  Tag,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listMyOrganizations } from "@/lib/organizations.functions";
import { listProperties } from "@/lib/properties.functions";
import { listContacts } from "@/lib/crm.functions";
import {
  createArchiveUploadUrl,
  searchArchive,
  suggestArchiveLinks,
} from "@/lib/archive.functions";
import {
  createDocument,
  addDocumentVersion,
  setDocumentStatus,
  deleteDocument,
  getDocumentSignedUrl,
} from "@/lib/documents.functions";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/dashboard/archive")({
  errorComponent: ({ error }) => (
    <div className="p-6 text-destructive">{error.message}</div>
  ),
  head: () => sectionHead({ section: "dashboard", entityAr: "الأرشيف", entityEn: "Archive", path: "/dashboard/archive" }),
  component: ArchivePage,
});

type Category = "contract" | "invoice" | "id" | "report" | "other";
const CATEGORIES: Category[] = ["contract", "invoice", "id", "report", "other"];

function catLabel(c: Category, isAr: boolean) {
  const ar: Record<Category, string> = {
    contract: "عقد",
    invoice: "فاتورة",
    id: "هوية",
    report: "تقرير",
    other: "أخرى",
  };
  const en: Record<Category, string> = {
    contract: "Contract",
    invoice: "Invoice",
    id: "ID",
    report: "Report",
    other: "Other",
  };
  return isAr ? ar[c] : en[c];
}

function ArchivePage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const qc = useQueryClient();

  const orgsQ = useQuery({ queryKey: ["orgs"], queryFn: () => listMyOrganizations() });
  const orgs = orgsQ.data ?? [];
  const [orgId, setOrgId] = useState("");
  const activeOrg = orgId || orgs[0]?.org.id || "";

  const [q, setQ] = useState("");
  const [category, setCategory] = useState<Category | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"active" | "archived" | "all">("active");

  const propsQ = useQuery({
    queryKey: ["properties", activeOrg],
    queryFn: () => listProperties({ data: { org_id: activeOrg } }),
    enabled: !!activeOrg,
  });
  const contactsQ = useQuery({
    queryKey: ["contacts", activeOrg],
    queryFn: () => listContacts({ data: { org_id: activeOrg } }),
    enabled: !!activeOrg,
  });

  const listQ = useQuery({
    queryKey: ["archive", activeOrg, q, category, statusFilter],
    queryFn: () =>
      searchArchive({
        data: {
          org_id: activeOrg,
          q: q || null,
          category: category === "all" ? null : category,
          status: statusFilter === "all" ? null : statusFilter,
        },
      }),
    enabled: !!activeOrg,
  });

  const rows: any[] = listQ.data ?? [];

  const openMut = useMutation({
    mutationFn: (file_path: string) => getDocumentSignedUrl({ data: { file_path } }),
    onSuccess: (res) => {
      if (res?.url) window.open(res.url, "_blank", "noopener");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMut = useMutation({
    mutationFn: (v: { id: string; status: "active" | "archived" }) =>
      setDocumentStatus({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["archive"] });
      toast.success(isAr ? "تم التحديث" : "Updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteDocument({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["archive"] });
      toast.success(isAr ? "تم الحذف" : "Deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-[1200px] p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Archive className="size-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">
              {isAr ? "الأرشيف الإلكتروني" : "Electronic Archive"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isAr
                ? "ارفع مستنداتك مع بحث ذكي وربط تلقائي بالعقار أو العميل."
                : "Upload documents with smart search and auto-linking to properties or clients."}
            </p>
          </div>
        </div>

        <UploadDialog
          isAr={isAr}
          orgId={activeOrg}
          properties={propsQ.data ?? []}
          contacts={contactsQ.data ?? []}
          onCreated={() => qc.invalidateQueries({ queryKey: ["archive"] })}
        />
      </div>

      <div className="surface-card mb-4 flex flex-wrap items-center gap-3 p-3">
        {orgs.length > 1 && (
          <div className="min-w-[180px]">
            <Select value={activeOrg} onValueChange={setOrgId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {orgs.map((o) => (
                  <SelectItem key={o.org.id} value={o.org.id}>{o.org.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={
              isAr ? "ابحث بالعنوان، الوسوم، الملاحظات..." : "Search title, tags, notes..."
            }
            className="ps-9"
          />
        </div>
        <div className="min-w-[150px]">
          <Select value={category} onValueChange={(v) => setCategory(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isAr ? "كل الفئات" : "All categories"}</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{catLabel(c, isAr)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[140px]">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">{isAr ? "نشطة" : "Active"}</SelectItem>
              <SelectItem value="archived">{isAr ? "مؤرشفة" : "Archived"}</SelectItem>
              <SelectItem value="all">{isAr ? "الكل" : "All"}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="ms-auto text-xs text-muted-foreground">
          {isAr ? "إجمالي" : "Total"}: {rows.length}
        </div>
      </div>

      <div className="space-y-3">
        {listQ.isLoading && (
          <div className="surface-card grid place-items-center p-10 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        )}
        {!listQ.isLoading && rows.length === 0 && (
          <div className="surface-card grid place-items-center gap-2 p-10 text-center text-sm text-muted-foreground">
            <Archive className="size-6 text-primary/60" />
            {isAr ? "لا توجد مستندات مطابقة." : "No documents match."}
          </div>
        )}
        {rows.map((d) => {
          const cat = d.category as Category;
          const propTitle = d.property
            ? d.property[isAr ? "title_ar" : "title_en"] ??
              d.property.title_ar ??
              d.property.title_en
            : null;
          return (
            <div key={d.id} className="surface-card flex flex-wrap items-start gap-4 p-4">
              <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/5 text-primary">
                <FileText className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="truncate font-semibold">{d.title}</div>
                  <Badge variant="secondary" className="bg-primary/10 text-primary">
                    {catLabel(cat, isAr)}
                  </Badge>
                  {d.status === "archived" && (
                    <Badge variant="outline">{isAr ? "مؤرشف" : "Archived"}</Badge>
                  )}
                  {d.signature_status === "signed" && (
                    <Badge className="bg-success/10 text-success" variant="secondary">
                      {isAr ? "موقّع" : "Signed"}
                    </Badge>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {propTitle && (
                    <span className="flex items-center gap-1">
                      <Building2 className="size-3" /> {propTitle}
                    </span>
                  )}
                  {d.contact?.full_name && (
                    <span className="flex items-center gap-1">
                      <UserIcon className="size-3" /> {d.contact.full_name}
                    </span>
                  )}
                  {d.current_version?.file_size ? (
                    <span>
                      {(d.current_version.file_size / 1024).toFixed(1)} KB
                    </span>
                  ) : null}
                  <span>
                    {new Date(d.updated_at).toLocaleDateString(
                      isAr ? "ar-SA" : "en-US",
                    )}
                  </span>
                </div>
                {d.tags?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {d.tags.slice(0, 8).map((t: string) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                      >
                        <Tag className="size-2.5" /> {t}
                      </span>
                    ))}
                  </div>
                )}
                {d.notes && (
                  <div className="mt-2 line-clamp-2 rounded-md bg-muted/40 p-2 text-xs">
                    {d.notes}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {d.current_version?.file_path && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openMut.mutate(d.current_version.file_path)}
                    disabled={openMut.isPending}
                  >
                    <Download className="size-4" />
                  </Button>
                )}
                <Select
                  value={d.status}
                  onValueChange={(v) =>
                    statusMut.mutate({ id: d.id, status: v as "active" | "archived" })
                  }
                >
                  <SelectTrigger className="h-8 w-[120px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{isAr ? "نشط" : "Active"}</SelectItem>
                    <SelectItem value="archived">{isAr ? "مؤرشف" : "Archived"}</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    if (confirm(isAr ? "حذف المستند نهائيًا؟" : "Delete document?"))
                      delMut.mutate(d.id);
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function UploadDialog({
  isAr,
  orgId,
  properties,
  contacts,
  onCreated,
}: {
  isAr: boolean;
  orgId: string;
  properties: Array<{ id: string; title_ar: string; title_en: string; city?: string | null }>;
  contacts: Array<{ id: string; full_name: string; phone?: string | null }>;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<Category>("contract");
  const [propertyId, setPropertyId] = useState<string>("");
  const [contactId, setContactId] = useState<string>("");
  const [tagsRaw, setTagsRaw] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [rationale, setRationale] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setTitle("");
    setCategory("contract");
    setPropertyId("");
    setContactId("");
    setTagsRaw("");
    setNotes("");
    setFile(null);
    setRationale("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const suggest = async () => {
    if (!orgId || !title.trim()) {
      toast.error(isAr ? "أدخل العنوان أولاً" : "Enter a title first");
      return;
    }
    setSuggesting(true);
    try {
      const res = await suggestArchiveLinks({
        data: {
          org_id: orgId,
          title: title.trim(),
          filename: file?.name ?? null,
          notes: notes || null,
        },
      });
      if (res.property_id) setPropertyId(res.property_id);
      if (res.contact_id) setContactId(res.contact_id);
      if (res.suggested_category) setCategory(res.suggested_category as Category);
      setRationale(res.rationale ?? "");
      toast.success(isAr ? "تم اقتراح الروابط" : "Links suggested");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSuggesting(false);
    }
  };

  const submit = async () => {
    if (!orgId || !title.trim() || !file) return;
    setUploading(true);
    try {
      // 1. Signed upload
      const up = await createArchiveUploadUrl({
        data: { org_id: orgId, filename: file.name },
      });
      const putRes = await fetch(up.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!putRes.ok) throw new Error(`Upload failed (${putRes.status})`);

      // 2. Create document
      const tags = tagsRaw
        .split(/[,،]/)
        .map((t) => t.trim())
        .filter(Boolean);
      const doc = await createDocument({
        data: {
          org_id: orgId,
          title: title.trim(),
          category,
          property_id: propertyId || null,
          contact_id: contactId || null,
          tags,
          notes: notes || null,
        },
      });

      // 3. Attach version
      await addDocumentVersion({
        data: {
          document_id: doc.id,
          file_path: up.path,
          file_size: file.size,
          mime_type: file.type || null,
        },
      });

      toast.success(isAr ? "تم رفع المستند" : "Document uploaded");
      onCreated();
      setOpen(false);
      reset();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  };

  const canSubmit = !!orgId && title.trim().length >= 1 && !!file && !uploading;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button disabled={!orgId} className="gap-2">
          <Upload className="size-4" /> {isAr ? "رفع مستند" : "Upload document"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isAr ? "أرشفة مستند جديد" : "Archive a new document"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>{isAr ? "الملف" : "File"}</Label>
            <Input
              ref={fileRef}
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"
            />
            {file && (
              <div className="mt-1 text-xs text-muted-foreground">
                {file.name} — {(file.size / 1024).toFixed(1)} KB
              </div>
            )}
          </div>

          <div>
            <Label>{isAr ? "العنوان" : "Title"}</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{isAr ? "الفئة" : "Category"}</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{catLabel(c, isAr)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{isAr ? "الوسوم (بفواصل)" : "Tags (comma-separated)"}</Label>
              <Input value={tagsRaw} onChange={(e) => setTagsRaw(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{isAr ? "العقار" : "Property"}</Label>
              <Select value={propertyId} onValueChange={setPropertyId}>
                <SelectTrigger>
                  <SelectValue placeholder={isAr ? "اختر (اختياري)" : "Optional"} />
                </SelectTrigger>
                <SelectContent>
                  {properties.slice(0, 200).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {isAr ? p.title_ar : p.title_en}
                      {p.city ? ` — ${p.city}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{isAr ? "العميل" : "Contact"}</Label>
              <Select value={contactId} onValueChange={setContactId}>
                <SelectTrigger>
                  <SelectValue placeholder={isAr ? "اختر (اختياري)" : "Optional"} />
                </SelectTrigger>
                <SelectContent>
                  {contacts.slice(0, 300).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>{isAr ? "ملاحظات" : "Notes"}</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full gap-2"
            onClick={suggest}
            disabled={suggesting || !title.trim()}
          >
            {suggesting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4 text-primary" />
            )}
            {isAr ? "اقترح الروابط بالذكاء الاصطناعي" : "Suggest links with AI"}
          </Button>
          {rationale && (
            <div className="rounded-md bg-primary/5 p-2 text-xs text-primary">
              {rationale}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={submit} disabled={!canSubmit}>
            {uploading && <Loader2 className="me-2 size-4 animate-spin" />}
            {isAr ? "حفظ" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}