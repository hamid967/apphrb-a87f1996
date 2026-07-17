import { t } from "@/lib/i18n";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Copy, KeyRound, Loader2, Plus, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { listMyOrganizations } from "@/lib/organizations.functions";
import { listApiKeys, createApiKey, revokeApiKey } from "@/lib/api-keys.functions";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/dashboard/settings/api-keys")({
  head: () => sectionHead({ section: "dashboard", entityAr: "مفاتيح API", entityEn: "API Keys", path: "/dashboard/settings/api-keys" }),
  component: ApiKeysPage,
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
          إعادة المحاولة
        </Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-6">{t("common.notFound")}</div>,
});

function ApiKeysPage() {
  const qc = useQueryClient();
  const orgsQ = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });
  const org = orgsQ.data?.[0]?.org as { id: string; name: string } | undefined;

  const listFn = useServerFn(listApiKeys);
  const createFn = useServerFn(createApiKey);
  const revokeFn = useServerFn(revokeApiKey);

  const keysQ = useQuery({
    queryKey: ["api-keys", org?.id],
    queryFn: () => listFn({ data: { orgId: org!.id } }),
    enabled: !!org?.id,
  });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [expires, setExpires] = useState<string>("365");
  const [newToken, setNewToken] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          orgId: org!.id,
          name: name.trim(),
          expiresInDays: expires === "never" ? null : Number(expires),
        },
      }),
    onSuccess: (row) => {
      setNewToken(row.token);
      setName("");
      qc.invalidateQueries({ queryKey: ["api-keys", org?.id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "فشل الإنشاء"),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeFn({ data: { orgId: org!.id, id } }),
    onSuccess: () => {
      toast.success("تم إبطال المفتاح");
      qc.invalidateQueries({ queryKey: ["api-keys", org?.id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "فشل"),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/dashboard/settings">
            <ArrowLeft className="size-4 me-1" /> عودة
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">مفاتيح API</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            استخدم هذه المفاتيح للوصول للـ API العام (قراءة فقط، 60 طلب/دقيقة). راجع{" "}
            <Link className="text-primary underline" to="/docs/api">
              توثيق الـ API
            </Link>
            .
          </p>
        </div>
        {org && (
          <Button
            onClick={() => {
              setOpen(true);
              setNewToken(null);
            }}
            className="gap-2"
          >
            <Plus className="size-4" /> إنشاء مفتاح
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4" /> المفاتيح النشطة
          </CardTitle>
          <CardDescription>
            يظهر المفتاح الكامل مرة واحدة فقط عند الإنشاء — احفظه بأمان.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {keysQ.isLoading ? (
            <div className="grid place-items-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (keysQ.data?.length ?? 0) === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              لا توجد مفاتيح بعد.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الاسم</TableHead>
                  <TableHead>البادئة</TableHead>
                  <TableHead>آخر استخدام</TableHead>
                  <TableHead>الانتهاء</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="text-end">إجراء</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(keysQ.data ?? []).map((k: any) => {
                  const revoked = !!k.revoked_at;
                  const expired = k.expires_at && new Date(k.expires_at) < new Date();
                  return (
                    <TableRow key={k.id}>
                      <TableCell className="font-medium">{k.name}</TableCell>
                      <TableCell>
                        <code className="rounded bg-muted px-2 py-0.5 text-xs">
                          {k.key_prefix}…
                        </code>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {k.expires_at ? new Date(k.expires_at).toLocaleDateString() : "أبدي"}
                      </TableCell>
                      <TableCell>
                        {revoked ? (
                          <Badge variant="destructive">مُبطَل</Badge>
                        ) : expired ? (
                          <Badge variant="secondary">منتهي</Badge>
                        ) : (
                          <Badge>نشط</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-end">
                        {!revoked && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (confirm("إبطال هذا المفتاح؟")) revoke.mutate(k.id);
                            }}
                          >
                            <ShieldOff className="size-4 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setNewToken(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{newToken ? "احفظ المفتاح الآن" : "إنشاء مفتاح جديد"}</DialogTitle>
            <DialogDescription>
              {newToken
                ? "لن يظهر المفتاح الكامل مرة أخرى. انسخه واحفظه في مكان آمن."
                : "أدخل اسمًا وصفيًا وحدد مدة الصلاحية."}
            </DialogDescription>
          </DialogHeader>
          {newToken ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-md border bg-muted p-3 font-mono text-xs break-all">
                {newToken}
              </div>
              <Button
                variant="secondary"
                className="gap-2"
                onClick={async () => {
                  await navigator.clipboard.writeText(newToken);
                  toast.success("تم النسخ");
                }}
              >
                <Copy className="size-4" /> نسخ
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <Label>الاسم</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Zapier Integration"
                />
              </div>
              <div>
                <Label>الصلاحية</Label>
                <select
                  className="mt-1 w-full rounded-md border bg-background p-2 text-sm"
                  value={expires}
                  onChange={(e) => setExpires(e.target.value)}
                >
                  <option value="30">30 يومًا</option>
                  <option value="90">90 يومًا</option>
                  <option value="365">سنة</option>
                  <option value="never">بدون انتهاء</option>
                </select>
              </div>
            </div>
          )}
          <DialogFooter>
            {newToken ? (
              <Button
                onClick={() => {
                  setOpen(false);
                  setNewToken(null);
                }}
              >
                تم
              </Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  إلغاء
                </Button>
                <Button
                  onClick={() => create.mutate()}
                  disabled={create.isPending || name.trim().length < 2}
                >
                  {create.isPending && <Loader2 className="me-2 size-4 animate-spin" />}
                  إنشاء
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
