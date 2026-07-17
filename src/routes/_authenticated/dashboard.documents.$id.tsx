import { createFileRoute, Link } from "@tanstack/react-router";
import { detailHead } from "@/lib/detail-og-head";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  addDocumentVersion,
  deleteDocument,
  DOCUMENTS_BUCKET,
  getDocument,
  getDocumentSignedUrl,
  setDocumentStatus,
  signDocument,
} from "@/lib/documents.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Download,
  Loader2,
  PenTool,
  Trash2,
  Upload,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard/documents/$id")({
  head: ({ params }) => detailHead({ entityAr: 'مستند', entityEn: 'Document', id: String(params.id), path: `/documents/${params.id}`, kind: 'docs' }),
  component: DocumentDetail,
});

const MAX_SIZE = 20 * 1024 * 1024;

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function DocumentDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const nav = Route.useNavigate();

  const q = useQuery({
    queryKey: ["document", id],
    queryFn: () => getDocument({ data: { id } }),
  });

  const doc = q.data?.doc;
  const versions = q.data?.versions ?? [];
  const currentVersion = versions.find((v: any) => v.id === doc?.current_version_id) ?? versions[0];

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setPreviewUrl(null);
    if (!currentVersion?.file_path) return;
    getDocumentSignedUrl({ data: { file_path: currentVersion.file_path } })
      .then(({ url }) => {
        if (!cancelled) setPreviewUrl(url);
      })
      .catch((e) => toast.error(e?.message ?? "Failed to load preview"));
    return () => {
      cancelled = true;
    };
  }, [currentVersion?.file_path]);

  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(file: File) {
    if (!doc) return;
    if (file.size > MAX_SIZE) return toast.error("Max 20MB");
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
      const path = `${doc.org_id}/${doc.id}/${Date.now()}-${safeName}`;
      const up = await supabase.storage.from(DOCUMENTS_BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || "application/octet-stream",
      });
      if (up.error) throw up.error;
      await addDocumentVersion({
        data: {
          document_id: doc.id,
          file_path: path,
          file_size: file.size,
          mime_type: file.type || null,
          notes: null,
        },
      });
      toast.success("New version uploaded");
      qc.invalidateQueries({ queryKey: ["document", id] });
      qc.invalidateQueries({ queryKey: ["documents"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const archive = useMutation({
    mutationFn: (status: "active" | "archived") => setDocumentStatus({ data: { id, status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["document", id] }),
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const del = useMutation({
    mutationFn: () => deleteDocument({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      nav({ to: "/documents" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const [signOpen, setSignOpen] = useState(false);
  const [signerName, setSignerName] = useState("");
  const sign = useMutation({
    mutationFn: () => signDocument({ data: { id, signer_name: signerName.trim() } }),
    onSuccess: () => {
      toast.success("Document signed");
      setSignOpen(false);
      setSignerName("");
      qc.invalidateQueries({ queryKey: ["document", id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  if (q.isLoading || !doc) {
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isPdf = currentVersion?.mime_type?.includes("pdf");
  const isImage = currentVersion?.mime_type?.startsWith("image/");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Button asChild size="sm" variant="ghost" className="mb-2 -ms-2">
            <Link to="/documents">
              <ArrowLeft className="me-1 size-4" /> Back
            </Link>
          </Button>
          <h1 className="truncate text-2xl font-semibold tracking-tight md:text-3xl">
            {doc.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="capitalize">
              {doc.category}
            </Badge>
            <Badge variant="outline" className="capitalize">
              {doc.status}
            </Badge>
            {doc.signature_status === "signed" ? (
              <Badge className="bg-success hover:bg-success">
                Signed · {doc.signed_by_name}
              </Badge>
            ) : (
              <Badge variant="outline">Unsigned</Badge>
            )}
            {currentVersion && <Badge variant="outline">v{currentVersion.version_no}</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept="application/pdf,image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleUpload(f);
            }}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="me-2 size-4 animate-spin" />
            ) : (
              <Upload className="me-2 size-4" />
            )}
            {currentVersion ? "New version" : "Upload"}
          </Button>
          <Dialog open={signOpen} onOpenChange={setSignOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="default" disabled={!currentVersion}>
                <PenTool className="me-2 size-4" /> Sign
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Digital signature</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Stub signature — records signer name and timestamp. Replace with an eIDAS provider
                  later.
                </p>
                <div>
                  <Label>Full legal name</Label>
                  <Input
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    placeholder="Jane Doe"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  disabled={!signerName.trim() || sign.isPending}
                  onClick={() => sign.mutate()}
                >
                  {sign.isPending && <Loader2 className="me-2 size-4 animate-spin" />}
                  Sign document
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button
            size="sm"
            variant="outline"
            onClick={() => archive.mutate(doc.status === "archived" ? "active" : "archived")}
          >
            {doc.status === "archived" ? (
              <>
                <ArchiveRestore className="me-2 size-4" /> Restore
              </>
            ) : (
              <>
                <Archive className="me-2 size-4" /> Archive
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() => {
              if (confirm("Delete document?")) del.mutate();
            }}
          >
            <Trash2 className="me-2 size-4" /> Delete
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">Preview</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!currentVersion ? (
              <div className="grid aspect-[4/3] place-items-center bg-muted/30 text-sm text-muted-foreground">
                No file uploaded yet.
              </div>
            ) : !previewUrl ? (
              <div className="grid aspect-[4/3] place-items-center bg-muted/30">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : isPdf ? (
              <iframe
                src={previewUrl}
                title="PDF preview"
                className="h-[70vh] w-full bg-background"
              />
            ) : isImage ? (
              <img
                src={previewUrl}
                alt=""
                className="max-h-[70vh] w-full object-contain bg-background"
              />
            ) : (
              <div className="grid aspect-[4/3] place-items-center gap-3 bg-muted/30 text-sm text-muted-foreground">
                No inline preview
                <Button asChild size="sm" variant="outline">
                  <a href={previewUrl} target="_blank" rel="noreferrer">
                    <Download className="me-2 size-4" /> Open file
                  </a>
                </Button>
              </div>
            )}
            {previewUrl && (
              <div className="border-t p-3">
                <Button asChild size="sm" variant="ghost">
                  <a href={previewUrl} target="_blank" rel="noreferrer">
                    <Download className="me-2 size-4" /> Download
                  </a>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Signature</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {doc.signature_status === "signed" ? (
                <div className="space-y-1">
                  <div className="font-medium text-success">Signed</div>
                  <div>
                    By <span className="font-medium">{doc.signed_by_name}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {doc.signed_at ? new Date(doc.signed_at).toLocaleString() : ""}
                  </div>
                </div>
              ) : (
                <div className="text-muted-foreground">Not yet signed.</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Version history</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {versions.length === 0 && <div className="text-muted-foreground">No versions.</div>}
              {versions.map((v: any) => (
                <div
                  key={v.id}
                  className={`flex items-center justify-between gap-2 rounded-lg border p-2 ${v.id === doc.current_version_id ? "border-primary/50 bg-primary/5" : "border-border/60"}`}
                >
                  <div className="min-w-0">
                    <div className="font-medium">
                      v{v.version_no}
                      {v.id === doc.current_version_id && (
                        <span className="ms-2 text-xs text-primary">current</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(v.created_at).toLocaleString()} · {formatBytes(v.file_size)}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      const { url } = await getDocumentSignedUrl({
                        data: { file_path: v.file_path },
                      });
                      window.open(url, "_blank", "noopener");
                    }}
                  >
                    <Download className="size-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
