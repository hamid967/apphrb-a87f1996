import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { RequireRole } from "@/components/auth/RequireRole";
import { RequirePermission } from "@/components/auth/RequirePermission";
import { ADMIN_ROLES } from "@/lib/permissions";
import { useCurrentOrg } from "@/hooks/use-current-org";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminPageHeader, AdminPageLoading } from "@/components/admin/AdminPageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Plus,
  Save,
  Trash2,
  ShieldCheck,
  UserPlus,
  CheckCircle2,
  SkipForward,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Can } from "@/components/auth/Can";

import { sectionHead } from "@/lib/section-og-head";
type ScopeType = "global" | "company" | "branch" | "department";
const ROLE_TEMPLATES: {
  name: string;
  description: string;
  defaultScope: ScopeType;
  permissions: string[];
}[] = [
  {
    name: "Accountant",
    description: "Financial ops: invoices, expenses, refunds, financial reports & exports.",
    defaultScope: "company",
    permissions: [
      "screen.dashboard.view",
      "screen.accounting.view",
      "screen.reports.view",
      "button.expense.approve",
      "button.payment.refund",
      "field.contract.amount.view",
      "field.owner.bank.view",
      "report.financial.view",
      "export.csv",
      "export.pdf",
      "export.json",
      "company.view",
      "branch.view",
      "api.call",
    ],
  },
  {
    name: "Property Manager",
    description: "Manages branches, contracts, occupancy and tenant records.",
    defaultScope: "branch",
    permissions: [
      "screen.dashboard.view",
      "screen.reports.view",
      "company.view",
      "branch.manage",
      "branch.view",
      "department.view",
      "button.contract.approve",
      "field.contract.amount.view",
      "field.tenant.national_id.view",
      "report.occupancy.view",
      "export.csv",
      "export.pdf",
      "import.units",
      "import.leads",
      "api.call",
    ],
  },
  {
    name: "Front Desk",
    description: "Reception: view-only dashboards, import contacts/leads.",
    defaultScope: "branch",
    permissions: [
      "screen.dashboard.view",
      "company.view",
      "branch.view",
      "department.view",
      "import.contacts",
      "import.leads",
      "api.call",
    ],
  },
];

export const Route = createFileRoute("/_authenticated/admin/roles")({
  head: () => sectionHead({ section: "admin", entityAr: "الأدوار والصلاحيات", entityEn: "Roles & Permissions", path: "/admin/roles" }),
  component: () => (
    <RequireRole roles={ADMIN_ROLES}>
      <RequirePermission permission="api.keys.manage">
        <RoleBuilder />
      </RequirePermission>
    </RequireRole>
  ),
});

type Permission = {
  id: string;
  code: string;
  level: string;
  resource: string;
  action: string;
  description: string | null;
};
type Role = {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  description: string | null;
  is_system: boolean;
  active: boolean;
};
type Assignment = {
  id: string;
  user_id: string;
  role_id: string;
  scope_type: "global" | "company" | "branch" | "department";
  company_id: string | null;
  branch_id: string | null;
  department_id: string | null;
};

function slugify(v: string) {
  return v
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function RoleBuilder() {
  const { i18n } = useTranslation();
  const isAr = (i18n.language || "ar").startsWith("ar");
  const { orgId, ready } = useCurrentOrg();
  const qc = useQueryClient();
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [templateScopes, setTemplateScopes] = useState<Record<string, ScopeType>>(() =>
    Object.fromEntries(ROLE_TEMPLATES.map((t) => [t.name, t.defaultScope])),
  );
  const [roleDefaultScope, setRoleDefaultScope] = useState<Record<string, ScopeType>>({});

  const roles = useQuery({
    queryKey: ["rbac_roles", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rbac_roles")
        .select("*")
        .eq("org_id", orgId!)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Role[];
    },
  });

  const permissions = useQuery({
    queryKey: ["rbac_permissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rbac_permissions")
        .select("*")
        .order("level")
        .order("code");
      if (error) throw error;
      return (data ?? []) as Permission[];
    },
  });

  const rolePerms = useQuery({
    queryKey: ["rbac_role_permissions", selectedRoleId],
    enabled: !!selectedRoleId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rbac_role_permissions")
        .select("permission_id, allow")
        .eq("role_id", selectedRoleId!);
      if (error) throw error;
      return new Map<string, boolean>((data ?? []).map((r: any) => [r.permission_id, r.allow]));
    },
  });

  const [newRole, setNewRole] = useState({ name: "", description: "" });
  const createRole = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("No organization");
      if (!newRole.name.trim()) throw new Error("Name required");
      const slug = slugify(newRole.name);
      const { data, error } = await supabase
        .from("rbac_roles")
        .insert({
          org_id: orgId,
          name: newRole.name.trim(),
          slug,
          description: newRole.description || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as Role;
    },
    onSuccess: (r) => {
      toast.success(isAr ? "تم إنشاء الدور" : "Role created");
      setNewRole({ name: "", description: "" });
      setSelectedRoleId(r.id);
      qc.invalidateQueries({ queryKey: ["rbac_roles", orgId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : isAr ? "فشل الإنشاء" : "Create failed"),
  });

  const applyTemplate = useMutation({
    mutationFn: async (tpl: (typeof ROLE_TEMPLATES)[number]) => {
      if (!orgId) throw new Error("No organization");
      const slug = slugify(tpl.name);
      const { data: role, error } = await supabase
        .from("rbac_roles")
        .insert({
          org_id: orgId,
          name: tpl.name,
          slug,
          description: tpl.description,
        })
        .select()
        .single();
      if (error) throw error;
      const { data: perms, error: pErr } = await supabase
        .from("rbac_permissions")
        .select("id, code")
        .in("code", tpl.permissions);
      if (pErr) throw pErr;
      if (perms && perms.length) {
        const rows = perms.map((p: any) => ({
          role_id: role.id,
          permission_id: p.id,
          allow: true,
        }));
        const { error: rpErr } = await supabase
          .from("rbac_role_permissions")
          .upsert(rows, { onConflict: "role_id,permission_id" });
        if (rpErr) throw rpErr;
      }
      return { role: role as Role, scope: templateScopes[tpl.name] ?? tpl.defaultScope };
    },
    onSuccess: ({ role, scope }) => {
      toast.success(
        isAr
          ? `تم تطبيق القالب (نطاق ${scope}) — راجع وعدّل "${role.name}"`
          : `Template applied (${scope} scope) — review & tweak "${role.name}"`,
      );
      setSelectedRoleId(role.id);
      setRoleDefaultScope((m) => ({ ...m, [role.id]: scope }));
      qc.invalidateQueries({ queryKey: ["rbac_roles", orgId] });
      qc.invalidateQueries({ queryKey: ["rbac_role_permissions", role.id] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : isAr ? "فشل التطبيق" : "Apply failed"),
  });

  const deleteRole = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rbac_roles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(isAr ? "تم الحذف" : "Deleted");
      setSelectedRoleId(null);
      qc.invalidateQueries({ queryKey: ["rbac_roles", orgId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : isAr ? "فشل الحذف" : "Delete failed"),
  });

  const togglePerm = useMutation({
    mutationFn: async ({ permId, checked }: { permId: string; checked: boolean }) => {
      if (!selectedRoleId) throw new Error("Select a role");
      if (checked) {
        const { error } = await supabase
          .from("rbac_role_permissions")
          .upsert(
            { role_id: selectedRoleId, permission_id: permId, allow: true },
            { onConflict: "role_id,permission_id" },
          );
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("rbac_role_permissions")
          .delete()
          .eq("role_id", selectedRoleId)
          .eq("permission_id", permId);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rbac_role_permissions", selectedRoleId] }),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : isAr ? "فشل التبديل" : "Toggle failed"),
  });

  const permsByLevel = useMemo(() => {
    const grouped = new Map<string, Permission[]>();
    for (const p of permissions.data ?? []) {
      if (!grouped.has(p.level)) grouped.set(p.level, []);
      grouped.get(p.level)!.push(p);
    }
    return grouped;
  }, [permissions.data]);

  // Assignments
  const assignments = useQuery({
    queryKey: ["rbac_user_roles", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rbac_user_roles")
        .select("*")
        .eq("org_id", orgId!)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Assignment[];
    },
  });

  const [assignForm, setAssignForm] = useState({
    user_id: "",
    role_id: "",
    scope_type: "global" as Assignment["scope_type"],
  });
  const createAssignment = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("No organization");
      if (!assignForm.user_id.trim() || !assignForm.role_id)
        throw new Error("User & role required");
      const { error } = await supabase.from("rbac_user_roles").insert({
        org_id: orgId,
        user_id: assignForm.user_id.trim(),
        role_id: assignForm.role_id,
        scope_type: assignForm.scope_type,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(isAr ? "تم الإسناد" : "Assigned");
      setAssignForm({ user_id: "", role_id: "", scope_type: "global" });
      qc.invalidateQueries({ queryKey: ["rbac_user_roles", orgId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : isAr ? "فشل الإسناد" : "Assign failed"),
  });

  const removeAssignment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rbac_user_roles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rbac_user_roles", orgId] }),
  });

  const [bulkForm, setBulkForm] = useState({
    template: ROLE_TEMPLATES[0].name,
    scope: ROLE_TEMPLATES[0].defaultScope as ScopeType,
    users: "",
  });
  type BulkResult = { user_id: string; status: "assigned" | "duplicate" | "error"; error?: string };
  type BulkSummary = {
    assigned: number;
    skipped: number;
    total: number;
    results: BulkResult[];
    role: string;
    scope: ScopeType;
  };
  const [bulkReport, setBulkReport] = useState<BulkSummary | null>(null);
  const bulkApply = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("No organization");
      const tpl = ROLE_TEMPLATES.find((t) => t.name === bulkForm.template);
      if (!tpl) throw new Error("Template not found");
      const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
      const ids = Array.from(
        new Set((bulkForm.users.match(uuidRe) ?? []).map((s) => s.toLowerCase())),
      );
      if (!ids.length) throw new Error("No valid user UUIDs found");

      const { data, error } = await supabase.rpc("bulk_apply_role_template", {
        _org: orgId,
        _template_name: tpl.name,
        _template_slug: slugify(tpl.name),
        _description: tpl.description,
        _permissions: tpl.permissions,
        _scope: bulkForm.scope,
        _user_ids: ids,
      });
      if (error) throw error;
      return {
        ...(data as { assigned: number; skipped: number; total: number; results: BulkResult[] }),
        role: tpl.name,
        scope: bulkForm.scope,
      };
    },
    onSuccess: (r) => {
      const failed = r.results.filter((x) => x.status === "error").length;
      toast.success(
        isAr
          ? `"${r.role}" (${r.scope}): ${r.assigned} مُسند، ${r.skipped} مكرر${failed ? `، ${failed} فشل` : ""}`
          : `"${r.role}" (${r.scope}): ${r.assigned} assigned, ${r.skipped} duplicate${failed ? `, ${failed} failed` : ""}`,
      );
      setBulkReport(r);
      setBulkForm((f) => ({ ...f, users: "" }));
      qc.invalidateQueries({ queryKey: ["rbac_user_roles", orgId] });
      qc.invalidateQueries({ queryKey: ["rbac_roles", orgId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : isAr ? "فشل التطبيق الجماعي" : "Bulk apply failed"),
  });

  if (!ready) {
    return (
      <AdminPageLoading
        ar="الأدوار والصلاحيات"
        en="Role Builder"
        icon={ShieldCheck}
        descriptionAr="تصميم أدوار مخصّصة وتفعيل صلاحيات بنطاقات دقيقة، ثم إسنادها للأعضاء."
        descriptionEn="Design custom roles, toggle scoped permissions, and assign them to team members."
      />
    );
  }

  const selectedRole = roles.data?.find((r) => r.id === selectedRoleId);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <AdminPageHeader
        ar="الأدوار والصلاحيات"
        en="Role Builder"
        icon={ShieldCheck}
        descriptionAr="تصميم أدوار مخصّصة وتفعيل صلاحيات بنطاقات دقيقة، ثم إسنادها للأعضاء."
        descriptionEn="Design custom roles, toggle scoped permissions, and assign them to team members."
        actions={<Badge variant="secondary">{roles.data?.length ?? 0} {isAr ? "دور" : "roles"}</Badge>}
      />

      <Tabs defaultValue="roles" className="w-full">
        <TabsList>
          <TabsTrigger value="roles">{isAr ? "الأدوار والصلاحيات" : "Roles & Permissions"}</TabsTrigger>
          <TabsTrigger value="assignments">{isAr ? "إسنادات المستخدمين" : "User Assignments"}</TabsTrigger>
        </TabsList>

        <TabsContent value="roles" className="grid gap-4 md:grid-cols-[320px_1fr] mt-4">
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">{isAr ? "قوالب الأدوار" : "Role templates"}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              {ROLE_TEMPLATES.map((tpl) => (
                <div key={tpl.name} className="rounded-md border p-3 flex flex-col gap-2">
                  <div className="font-medium">{tpl.name}</div>
                  <div className="text-xs text-muted-foreground flex-1">{tpl.description}</div>
                  <div className="flex flex-wrap gap-1">
                    {tpl.permissions.slice(0, 4).map((c) => (
                      <Badge key={c} variant="secondary" className="text-[10px]">
                        {c}
                      </Badge>
                    ))}
                    {tpl.permissions.length > 4 && (
                      <Badge variant="outline" className="text-[10px]">
                        +{tpl.permissions.length - 4}
                      </Badge>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{isAr ? "النطاق الافتراضي للإسناد" : "Default scope for assignments"}</Label>
                    <Select
                      value={templateScopes[tpl.name] ?? tpl.defaultScope}
                      onValueChange={(v: ScopeType) =>
                        setTemplateScopes((m) => ({ ...m, [tpl.name]: v }))
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="global">{isAr ? "عام (على مستوى المنظمة)" : "Global (org-wide)"}</SelectItem>
                        <SelectItem value="company">{isAr ? "شركة" : "Company"}</SelectItem>
                        <SelectItem value="branch">{isAr ? "فرع" : "Branch"}</SelectItem>
                        <SelectItem value="department">{isAr ? "قسم" : "Department"}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Can
                    permission="api.keys.manage"
                    fallback={
                      <Button size="sm" disabled>
                        {isAr ? "صلاحية غير كافية" : "Insufficient permission"}
                      </Button>
                    }
                  >
                    <Button
                      size="sm"
                      onClick={() => applyTemplate.mutate(tpl)}
                      disabled={applyTemplate.isPending}
                      className="gap-2"
                    >
                      {applyTemplate.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                      {isAr ? "استخدام القالب" : "Use template"}
                    </Button>
                  </Can>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{isAr ? "الأدوار" : "Roles"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Can permission="api.keys.manage">
                <div className="space-y-2 border-b pb-3">
                  <Label>{isAr ? "الاسم" : "Name"}</Label>
                  <Input
                    value={newRole.name}
                    onChange={(e) => setNewRole({ ...newRole, name: e.target.value })}
                    placeholder={isAr ? "مثلاً مدير فرع" : "e.g. Branch Manager"}
                  />
                  <Label>{isAr ? "الوصف" : "Description"}</Label>
                  <Textarea
                    rows={2}
                    value={newRole.description}
                    onChange={(e) => setNewRole({ ...newRole, description: e.target.value })}
                  />
                  <Button
                    className="w-full gap-2"
                    onClick={() => createRole.mutate()}
                    disabled={createRole.isPending}
                  >
                    {createRole.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    {isAr ? "إنشاء دور" : "Create role"}
                  </Button>
                </div>
              </Can>
              <div className="space-y-1">
                {(roles.data ?? []).map((r) => (
                  <div
                    key={r.id}
                    onClick={() => setSelectedRoleId(r.id)}
                    className={`flex items-center justify-between rounded-md border px-3 py-2 cursor-pointer hover:bg-muted/50 ${selectedRoleId === r.id ? "bg-muted border-primary" : ""}`}
                  >
                    <div>
                      <div className="font-medium text-sm">{r.name}</div>
                      <div className="text-xs text-muted-foreground">{r.slug}</div>
                    </div>
                    {!r.is_system && (
                      <Can permission="api.keys.manage">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="حذف الدور"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(isAr ? "حذف الدور؟" : "Delete role?")) deleteRole.mutate(r.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </Can>
                    )}
                  </div>
                ))}
                {(roles.data?.length ?? 0) === 0 && (
                  <p className="text-sm text-muted-foreground">
                    {isAr ? "لا توجد أدوار بعد — أنشئ أول دور." : "No roles yet — create your first one."}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {selectedRole
                  ? (isAr ? `الصلاحيات — ${selectedRole.name}` : `Permissions — ${selectedRole.name}`)
                  : (isAr ? "اختر دوراً لتعديل صلاحياته" : "Select a role to edit permissions")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedRole && (
                <p className="text-sm text-muted-foreground">{isAr ? "اختر دوراً من القائمة." : "Pick a role on the left."}</p>
              )}
              {selectedRole && permissions.isLoading && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {selectedRole && !permissions.isLoading && (
                <div className="space-y-6">
                  {Array.from(permsByLevel.entries()).map(([level, perms]) => (
                    <div key={level}>
                      <h3 className="font-semibold text-sm uppercase text-muted-foreground mb-2">
                        {level}
                      </h3>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {perms.map((p) => {
                          const checked = rolePerms.data?.get(p.id) === true;
                          return (
                            <label
                              key={p.id}
                              className="flex items-start gap-2 rounded-md border px-3 py-2 cursor-pointer hover:bg-muted/40"
                            >
                              <Can
                                permission="api.keys.manage"
                                fallback={<Checkbox checked={checked} disabled />}
                              >
                                <Checkbox
                                  checked={checked}
                                  disabled={togglePerm.isPending}
                                  onCheckedChange={(v) =>
                                    togglePerm.mutate({ permId: p.id, checked: !!v })
                                  }
                                />
                              </Can>
                              <div className="text-sm">
                                <div className="font-medium">{p.code}</div>
                                {p.description && (
                                  <div className="text-xs text-muted-foreground">
                                    {p.description}
                                  </div>
                                )}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assignments" className="mt-4">
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-lg">{isAr ? "تطبيق قالب جماعي" : "Bulk apply template"}</CardTitle>
            </CardHeader>
            <CardContent>
              <Can
                permission="api.keys.manage"
                fallback={
                  <p className="text-sm text-muted-foreground">
                    {isAr ? "ليست لديك صلاحية الإسناد الجماعي." : "You don't have permission to bulk-assign roles."}
                  </p>
                }
              >
                <div className="grid gap-3 md:grid-cols-[1fr_1fr_2fr_auto] items-end">
                  <div>
                    <Label>{isAr ? "القالب" : "Template"}</Label>
                    <Select
                      value={bulkForm.template}
                      onValueChange={(v) => {
                        const tpl = ROLE_TEMPLATES.find((t) => t.name === v)!;
                        setBulkForm({ ...bulkForm, template: v, scope: tpl.defaultScope });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLE_TEMPLATES.map((t) => (
                          <SelectItem key={t.name} value={t.name}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{isAr ? "النطاق" : "Scope"}</Label>
                    <Select
                      value={bulkForm.scope}
                      onValueChange={(v: ScopeType) => setBulkForm({ ...bulkForm, scope: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="global">{isAr ? "عام (على مستوى المنظمة)" : "Global (org-wide)"}</SelectItem>
                        <SelectItem value="company">{isAr ? "شركة" : "Company"}</SelectItem>
                        <SelectItem value="branch">{isAr ? "فرع" : "Branch"}</SelectItem>
                        <SelectItem value="department">{isAr ? "قسم" : "Department"}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{isAr ? "معرّفات المستخدمين UUID (فاصلة أو سطر جديد)" : "User UUIDs (comma / newline separated)"}</Label>
                    <Textarea
                      rows={3}
                      placeholder="00000000-0000-0000-0000-000000000000, ..."
                      value={bulkForm.users}
                      onChange={(e) => setBulkForm({ ...bulkForm, users: e.target.value })}
                    />
                  </div>
                  <Button
                    onClick={() => bulkApply.mutate()}
                    disabled={bulkApply.isPending}
                    className="gap-2"
                  >
                    {bulkApply.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <UserPlus className="h-4 w-4" />
                    )}
                    {isAr ? "تطبيق جماعي" : "Bulk apply"}
                  </Button>
                </div>
                {bulkReport && (
                  <div className="mt-4 space-y-3">
                    <div className="grid gap-2 sm:grid-cols-4">
                      <div className="rounded-md border p-3">
                        <div className="text-xs text-muted-foreground">{isAr ? "القالب · النطاق" : "Template · scope"}</div>
                        <div className="font-medium truncate">{bulkReport.role}</div>
                        <Badge variant="outline" className="mt-1">
                          {bulkReport.scope}
                        </Badge>
                      </div>
                      <div className="rounded-md border p-3">
                        <div className="text-xs text-muted-foreground">{isAr ? "مُسند" : "Assigned"}</div>
                        <div className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
                          {bulkReport.assigned}
                        </div>
                      </div>
                      <div className="rounded-md border p-3">
                        <div className="text-xs text-muted-foreground">{isAr ? "مكررات مُتخطاة" : "Duplicates skipped"}</div>
                        <div className="text-2xl font-semibold text-amber-600 dark:text-amber-400">
                          {bulkReport.skipped}
                        </div>
                      </div>
                      <div className="rounded-md border p-3">
                        <div className="text-xs text-muted-foreground">{isAr ? "فشل" : "Failed"}</div>
                        <div className="text-2xl font-semibold text-destructive">
                          {bulkReport.results.filter((r) => r.status === "error").length}
                        </div>
                      </div>
                    </div>
                    <div className="border rounded-md divide-y max-h-64 overflow-auto">
                      {bulkReport.results.map((r) => (
                        <div key={r.user_id} className="flex items-center gap-3 px-3 py-2 text-sm">
                          {r.status === "assigned" && (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                          )}
                          {r.status === "duplicate" && (
                            <SkipForward className="h-4 w-4 text-amber-500 shrink-0" />
                          )}
                          {r.status === "error" && (
                            <XCircle className="h-4 w-4 text-destructive shrink-0" />
                          )}
                          <code className="text-xs text-muted-foreground">{r.user_id}</code>
                          <Badge
                            variant={
                              r.status === "assigned"
                                ? "default"
                                : r.status === "duplicate"
                                  ? "secondary"
                                  : "destructive"
                            }
                            className="ml-auto capitalize"
                          >
                            {r.status}
                          </Badge>
                          {r.status === "error" && r.error && (
                            <span
                              className="text-xs text-destructive max-w-[40%] truncate"
                              title={r.error}
                            >
                              {r.error}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-end">
                      <Button variant="ghost" size="sm" onClick={() => setBulkReport(null)}>
                        {isAr ? "مسح التقرير" : "Clear report"}
                      </Button>
                    </div>
                  </div>
                )}
              </Can>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{isAr ? "إسناد أدوار للمستخدمين" : "Assign roles to users"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Can permission="api.keys.manage">
                <div className="grid gap-3 md:grid-cols-4 items-end">
                  <div>
                    <Label>{isAr ? "معرّف المستخدم (UUID)" : "User ID (UUID)"}</Label>
                    <Input
                      value={assignForm.user_id}
                      onChange={(e) => setAssignForm({ ...assignForm, user_id: e.target.value })}
                      placeholder={isAr ? "معرّف مستخدم auth" : "auth user id"}
                    />
                  </div>
                  <div>
                    <Label>{isAr ? "الدور" : "Role"}</Label>
                    <Select
                      value={assignForm.role_id}
                      onValueChange={(v) => {
                        const r = roles.data?.find((x) => x.id === v);
                        const tpl = r ? ROLE_TEMPLATES.find((t) => t.name === r.name) : undefined;
                        const scope =
                          roleDefaultScope[v] ?? tpl?.defaultScope ?? assignForm.scope_type;
                        setAssignForm({ ...assignForm, role_id: v, scope_type: scope });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={isAr ? "اختر دوراً" : "Select role"} />
                      </SelectTrigger>
                      <SelectContent>
                        {(roles.data ?? []).map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{isAr ? "النطاق" : "Scope"}</Label>
                    <Select
                      value={assignForm.scope_type}
                      onValueChange={(v: Assignment["scope_type"]) =>
                        setAssignForm({ ...assignForm, scope_type: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="global">{isAr ? "عام (على مستوى المنظمة)" : "Global (org-wide)"}</SelectItem>
                        <SelectItem value="company">{isAr ? "شركة" : "Company"}</SelectItem>
                        <SelectItem value="branch">{isAr ? "فرع" : "Branch"}</SelectItem>
                        <SelectItem value="department">{isAr ? "قسم" : "Department"}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={() => createAssignment.mutate()}
                    disabled={createAssignment.isPending}
                    className="gap-2"
                  >
                    {createAssignment.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <UserPlus className="h-4 w-4" />
                    )}
                    {isAr ? "إسناد" : "Assign"}
                  </Button>
                </div>
              </Can>

              <div className="border rounded-md divide-y">
                {(assignments.data ?? []).map((a) => {
                  const r = roles.data?.find((x) => x.id === a.role_id);
                  return (
                    <div key={a.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <div className="flex items-center gap-3">
                        <code className="text-xs text-muted-foreground">
                          {a.user_id.slice(0, 8)}…
                        </code>
                        <span className="font-medium">{r?.name ?? a.role_id}</span>
                        <Badge variant="outline">{a.scope_type}</Badge>
                      </div>
                      <Can permission="api.keys.manage">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="إزالة التعيين"
                          onClick={() => removeAssignment.mutate(a.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </Can>
                    </div>
                  );
                })}
                {(assignments.data?.length ?? 0) === 0 && (
                  <p className="text-sm text-muted-foreground p-3">{isAr ? "لا توجد إسنادات بعد." : "No assignments yet."}</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
