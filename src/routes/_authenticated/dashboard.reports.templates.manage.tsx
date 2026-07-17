import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { listMyOrganizations } from "@/lib/organizations.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Pencil, Save, X, LayoutTemplate, ShieldAlert } from "lucide-react";
import { can, type OrgRole } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/dashboard/reports/templates/manage")({
  head: () => ({ meta: [{ title: "Manage Report Templates" }] }),
  component: ManageTemplatesPage,
});

type Row = {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  source: string;
  export_formats: string[];
  config: Record<string, unknown>;
};

type FormState = {
  id?: string;
  name: string;
  description: string;
  source: string;
  export_formats: string;
  configText: string;
};

const EMPTY: FormState = {
  name: "",
  description: "",
  source: "deals",
  export_formats: "csv,json",
  configText: JSON.stringify(
    {
      columns: ["status", "amount"],
      filters: { last_days: 90 },
      segments: ["status"],
      summaries: [{ label: "Total", field: "amount", agg: "sum" }],
    },
    null,
    2,
  ),
};

function ManageTemplatesPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);
  const editing = !!form.id;

  const orgsQ = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });
  const orgs = orgsQ.data ?? [];
  const activeOrg = orgs[0]?.org;
  const role = orgs[0]?.role as OrgRole | undefined;
  const canView = can.viewReports(role);
  const canCreate = can.saveReportTemplate(role);
  const canEdit = can.editReportTemplate(role);
  const canDelete = can.deleteReportTemplate(role);
  const canManage = canCreate || canEdit || canDelete;

  const listQ = useQuery({
    queryKey: ["report_templates", "manage", activeOrg?.id],
    enabled: !!activeOrg,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_templates")
        .select("id,org_id,name,description,source,export_formats,config")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const rows = useMemo(() => listQ.data ?? [], [listQ.data]);

  const reset = () => setForm(EMPTY);

  const parsedConfig = () => {
    try {
      return JSON.parse(form.configText);
    } catch {
      throw new Error("Config must be valid JSON");
    }
  };

  const upsertMut = useMutation({
    mutationFn: async () => {
      if (!activeOrg) throw new Error("No organization");
      if (!form.name.trim()) throw new Error("Name is required");
      const config = parsedConfig();
      const formats = form.export_formats
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (editing) {
        const { error } = await supabase
          .from("report_templates")
          .update({
            name: form.name.trim(),
            description: form.description.trim() || null,
            source: form.source.trim(),
            export_formats: formats,
            config,
          })
          .eq("id", form.id!);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("report_templates").insert({
          org_id: activeOrg.id,
          name: form.name.trim(),
          description: form.description.trim() || null,
          source: form.source.trim(),
          export_formats: formats,
          config,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Template updated" : "Template created");
      reset();
      qc.invalidateQueries({ queryKey: ["report_templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("report_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Template deleted");
      qc.invalidateQueries({ queryKey: ["report_templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startEdit = (r: Row) =>
    setForm({
      id: r.id,
      name: r.name,
      description: r.description ?? "",
      source: r.source,
      export_formats: (r.export_formats ?? []).join(","),
      configText: JSON.stringify(r.config ?? {}, null, 2),
    });

  if (orgsQ.isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <ShieldAlert className="size-8 text-muted-foreground" />
            <div className="text-lg font-semibold">
              {canView ? "Read-only access" : "Access restricted"}
            </div>
            <p className="text-sm text-muted-foreground">
              Your role can{canView ? " view templates but not modify them" : "not access report templates"}.
            </p>
            <Button asChild variant="outline">
              <Link to="/dashboard/reports/templates">Back to templates</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <LayoutTemplate className="size-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Manage Report Templates</h1>
            <p className="text-sm text-muted-foreground">
              Create, edit, and delete report templates for your organization.
            </p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/dashboard/reports/templates">Preview list</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>{editing ? "Edit template" : "New template"}</span>
            {editing && (
              <Button size="sm" variant="ghost" onClick={reset}>
                <X className="size-4 me-1" /> Cancel
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="source">Source table</Label>
            <Input
              id="source"
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
              placeholder="deals | expense_claims | contracts | commissions"
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="formats">Export formats (comma-separated)</Label>
            <Input
              id="formats"
              value={form.export_formats}
              onChange={(e) => setForm({ ...form, export_formats: e.target.value })}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="config">Config (JSON)</Label>
            <Textarea
              id="config"
              rows={12}
              className="font-mono text-xs"
              value={form.configText}
              onChange={(e) => setForm({ ...form, configText: e.target.value })}
            />
          </div>
          <div className="md:col-span-2 flex justify-end gap-2">
            <Button
              onClick={() => upsertMut.mutate()}
              disabled={upsertMut.isPending || (editing ? !canEdit : !canCreate)}
              title={
                editing
                  ? !canEdit
                    ? "No permission to edit templates"
                    : undefined
                  : !canCreate
                    ? "No permission to create templates"
                    : undefined
              }
            >
              {upsertMut.isPending ? (
                <Loader2 className="size-4 animate-spin me-1.5" />
              ) : editing ? (
                <Save className="size-4 me-1.5" />
              ) : (
                <Plus className="size-4 me-1.5" />
              )}
              {editing ? "Save changes" : "Create template"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Existing templates</CardTitle>
        </CardHeader>
        <CardContent>
          {listQ.isLoading ? (
            <div className="grid place-items-center py-10">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No templates yet.</div>
          ) : (
            <div className="divide-y divide-border/60">
              {rows.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="truncate font-medium">{r.name}</div>
                      <Badge variant="secondary" className="font-normal">
                        {r.source}
                      </Badge>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{r.description}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => startEdit(r)}
                      disabled={!canEdit}
                      title={!canEdit ? "No permission to edit templates" : undefined}
                    >
                      <Pencil className="size-4 me-1" /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => {
                        if (confirm(`Delete "${r.name}"?`)) deleteMut.mutate(r.id);
                      }}
                      disabled={deleteMut.isPending || !canDelete}
                      title={!canDelete ? "No permission to delete templates" : undefined}
                    >
                      <Trash2 className="size-4 me-1" /> Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
