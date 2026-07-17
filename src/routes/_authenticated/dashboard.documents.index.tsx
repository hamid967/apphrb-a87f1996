import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listMyOrganizations } from "@/lib/organizations.functions";
import { createDocument, listDocuments, setDocumentStatus } from "@/lib/documents.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Archive, ArchiveRestore, FileText, Loader2, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard/documents/")({
  component: DocumentsPage,
});

const CATEGORIES = ["contract", "invoice", "id", "report", "other"] as const;

function DocumentsPage() {
  const qc = useQueryClient();
  const orgsQ = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });
  const orgId = orgsQ.data?.[0]?.org?.id;

  const [tab, setTab] = useState<"active" | "archived">("active");
  const q = useQuery({
    queryKey: ["documents", orgId, tab],
    queryFn: () => listDocuments({ data: { orgId: orgId!, status: tab } }),
    enabled: !!orgId,
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    category: "contract" as (typeof CATEGORIES)[number],
    notes: "",
  });

  const create = useMutation({
    mutationFn: (payload: any) => createDocument({ data: payload }),
    onSuccess: () => {
      toast.success("Document created");
      qc.invalidateQueries({ queryKey: ["documents", orgId] });
      setOpen(false);
      setForm({ title: "", category: "contract", notes: "" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: "active" | "archived" }) =>
      setDocumentStatus({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents", orgId] }),
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Documents</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Contracts, invoices and signed files.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" disabled={!orgId}>
              <Plus className="me-2 size-4" /> New
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New document</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <div>
                <Label>Title</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Lease agreement – Villa 12"
                />
              </div>
              <div>
                <Label>Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(v: any) => setForm({ ...form, category: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                disabled={!form.title.trim() || create.isPending}
                onClick={() =>
                  create.mutate({
                    org_id: orgId,
                    title: form.title.trim(),
                    category: form.category,
                    notes: form.notes || null,
                    tags: [],
                  })
                }
              >
                {create.isPending && <Loader2 className="me-2 size-4 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="archived">Archive</TabsTrigger>
        </TabsList>
      </Tabs>

      {q.isLoading ? (
        <div className="grid place-items-center py-16">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (q.data ?? []).length === 0 ? (
        <Card>
          <CardContent className="grid place-items-center gap-2 py-16 text-sm text-muted-foreground">
            <FileText className="size-8 opacity-60" /> No documents yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(q.data ?? []).map((d: any) => (
            <Card key={d.id} className="group overflow-hidden">
              <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <Link to="/documents/$id" params={{ id: d.id }} className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium group-hover:text-primary">
                      {d.title}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary" className="capitalize">
                        {d.category}
                      </Badge>
                      {d.signature_status === "signed" && (
                        <Badge className="bg-success hover:bg-success">Signed</Badge>
                      )}
                      {d.signature_status === "pending" && <Badge variant="outline">Pending</Badge>}
                      {d.current_version && (
                        <Badge variant="outline">v{d.current_version.version_no}</Badge>
                      )}
                    </div>
                  </Link>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    onClick={() =>
                      setStatus.mutate({
                        id: d.id,
                        status: d.status === "archived" ? "active" : "archived",
                      })
                    }
                    title={d.status === "archived" ? "Restore" : "Archive"}
                  >
                    {d.status === "archived" ? (
                      <ArchiveRestore className="size-4" />
                    ) : (
                      <Archive className="size-4" />
                    )}
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground">
                  Updated {new Date(d.updated_at).toLocaleDateString()}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
