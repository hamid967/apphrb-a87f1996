import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  Loader2,
  Save,
  Mail,
  Upload,
  ImageIcon,
  X,
  CreditCard,
  ShieldCheck,
  KeyRound,
  Bell,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listMyOrganizations, updateOrganization } from "@/lib/organizations.functions";
import { supabase } from "@/integrations/supabase/client";

import { sectionHead } from "@/lib/section-og-head";
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const SIGNED_URL_TTL = 60 * 60 * 24 * 365 * 5; // 5 years

function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const Route = createFileRoute("/_authenticated/dashboard/settings")({
  head: () => sectionHead({ section: "dashboard", entityAr: "الإعدادات", entityEn: "Settings", path: "/dashboard/settings" }),
  component: SettingsPage,
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
          Retry — إعادة المحاولة
        </Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-6">Not found — غير موجود</div>,
});

function SettingsPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const qc = useQueryClient();
  const orgsQ = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });
  const org = orgsQ.data?.[0]?.org as
    | { id: string; name: string; slug: string; logo_url: string | null }
    | undefined;

  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (org) {
      setName(org.name);
      setLogoUrl(org.logo_url ?? "");
    }
  }, [org?.id]);

  useEffect(() => {
    if (!pendingFile) {
      setPendingPreview(null);
      return;
    }
    const url = URL.createObjectURL(pendingFile);
    setPendingPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);

  async function handleFilePick(file: File | null) {
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error(isAr ? "نوع ملف غير مدعوم" : "Unsupported file type", {
        description: isAr ? "PNG أو JPG أو WEBP أو SVG فقط." : "Only PNG, JPG, WEBP, or SVG.",
      });
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error(isAr ? "الملف كبير جدًا" : "File is too large", {
        description: isAr
          ? `الحد الأقصى 2MB (${humanSize(file.size)}).`
          : `Max size 2MB (${humanSize(file.size)}).`,
      });
      return;
    }
    setPendingFile(file);
  }

  async function uploadLogo(): Promise<string | null> {
    if (!pendingFile || !org) return null;
    setUploading(true);
    try {
      const ext = pendingFile.name.split(".").pop()?.toLowerCase() ?? "png";
      const path = `${org.id}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("org-logos")
        .upload(path, pendingFile, { upsert: true, contentType: pendingFile.type });
      if (upErr) throw upErr;
      const { data: signed, error: signErr } = await supabase.storage
        .from("org-logos")
        .createSignedUrl(path, SIGNED_URL_TTL);
      if (signErr) throw signErr;
      return signed.signedUrl;
    } finally {
      setUploading(false);
    }
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      let nextLogo = logoUrl;
      if (pendingFile) {
        const uploaded = await uploadLogo();
        if (uploaded) nextLogo = uploaded;
      }
      const res = await updateOrganization({ data: { id: org!.id, name, logo_url: nextLogo } });
      return { res, nextLogo };
    },
    onSuccess: ({ nextLogo }) => {
      toast.success(isAr ? "تم حفظ الإعدادات" : "Settings saved");
      setLogoUrl(nextLogo);
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["my-organizations"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : isAr ? "خطأ" : "Error"),
  });

  if (orgsQ.isLoading || !org) {
    return (
      <div className="p-6 flex justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const displayLogo = pendingPreview || logoUrl || null;
  const displayName = name || "—";
  const initials = (name || org.name).trim().slice(0, 2).toUpperCase();
  const busy = saveMut.isPending || uploading;

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {isAr ? "الإعدادات" : "Settings"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isAr ? "إعدادات الشركة والحساب والبوابة." : "Company, account, and portal settings."}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isAr ? "معلومات الشركة" : "Company information"}
          </CardTitle>
          <CardDescription>
            {isAr
              ? "الاسم والشعار الذي يظهر في المستندات والفواتير."
              : "Name and logo shown on documents and invoices."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-5 flex items-center gap-4 rounded-lg border bg-muted/30 p-4">
            <div className="size-16 rounded-md bg-background border flex items-center justify-center overflow-hidden shrink-0">
              {displayLogo ? (
                <img
                  src={displayLogo}
                  alt={isAr ? "معاينة الشعار" : "Logo preview"}
                  className="h-full w-full object-contain"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <span className="text-sm font-semibold text-muted-foreground">
                  {initials || <ImageIcon className="size-5" />}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <div className="text-sm text-muted-foreground">
                {isAr ? "معاينة فورية" : "Live preview"}
              </div>
              <div className="font-semibold truncate">{displayName}</div>
              {pendingFile && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  {isAr ? "ملف جديد:" : "New file:"} {pendingFile.name} ·{" "}
                  {humanSize(pendingFile.size)}
                </div>
              )}
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveMut.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>{isAr ? "اسم الشركة" : "Company name"}</Label>
              <Input
                required
                minLength={2}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{isAr ? "المعرّف (Slug)" : "Identifier (slug)"}</Label>
              <Input value={org.slug} disabled />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Upload className="size-3.5" /> {isAr ? "شعار الشركة" : "Company logo"}
              </Label>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ALLOWED_TYPES.join(",")}
                  className="hidden"
                  onChange={(e) => handleFilePick(e.target.files?.[0] ?? null)}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="size-4 me-2" /> {isAr ? "اختيار ملف" : "Choose file"}
                </Button>
                {pendingFile && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setPendingFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                  >
                    <X className="size-4 me-1" /> {isAr ? "إلغاء" : "Cancel"}
                  </Button>
                )}
                {logoUrl && !pendingFile && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => setLogoUrl("")}
                  >
                    <X className="size-4 me-1" /> {isAr ? "إزالة الشعار" : "Remove logo"}
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                PNG / JPG / WEBP / SVG · {isAr ? "الحد الأقصى 2MB" : "Max 2MB"}
              </p>
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? (
                <Loader2 className="size-4 me-2 animate-spin" />
              ) : (
                <Save className="size-4 me-2" />
              )}
              {uploading
                ? isAr
                  ? "جاري الرفع..."
                  : "Uploading…"
                : isAr
                  ? "حفظ التغييرات"
                  : "Save changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{isAr ? "دعوات البوابة" : "Portal invitations"}</CardTitle>
          <CardDescription>
            {isAr
              ? "إدارة دعوات المستأجرين والملاك للدخول إلى بواباتهم."
              : "Manage tenant and owner invitations to their portals."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link to="/admin/portal-invitations">
              <Mail className="size-4 me-2" /> {isAr ? "فتح إدارة الدعوات" : "Open invitations"}
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isAr ? "الاشتراك والفوترة" : "Subscription & billing"}
          </CardTitle>
          <CardDescription>
            {isAr
              ? "الخطة الحالية، الاستخدام، والتجديد عبر التحويل البنكي."
              : "Current plan, usage, and bank-transfer renewal."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link to="/dashboard/settings/billing">
              <CreditCard className="size-4 me-2" />{" "}
              {isAr ? "فتح صفحة الاشتراك" : "Open subscription page"}
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isAr ? "امتثال ZATCA فاز 2" : "ZATCA phase-2 compliance"}
          </CardTitle>
          <CardDescription>
            {isAr
              ? "فحص ذاتي لإعدادات الفوترة الإلكترونية قبل الاعتماد الرسمي."
              : "Self-check your e-invoicing configuration before official onboarding."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link to="/dashboard/settings/zatca">
              <ShieldCheck className="size-4 me-2" />{" "}
              {isAr ? "فتح الفحص الذاتي" : "Open self-check"}
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{isAr ? "استيراد البيانات" : "Data import"}</CardTitle>
          <CardDescription>
            {isAr ? "إعدادات مصادر الاستيراد الخارجية." : "External import source settings."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link to="/dashboard/settings/import">
              {isAr ? "فتح إعدادات الاستيراد" : "Open import settings"}
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{isAr ? "مفاتيح API" : "API keys"}</CardTitle>
          <CardDescription>
            {isAr
              ? "مفاتيح للوصول للـ API العام (قراءة فقط، 60 طلب/دقيقة)."
              : "Keys for the public read-only API (60 requests/minute)."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/dashboard/settings/api-keys">
              <KeyRound className="size-4 me-2" /> {isAr ? "إدارة المفاتيح" : "Manage keys"}
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link to="/docs/api">{isAr ? "توثيق الـ API" : "API docs"}</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{isAr ? "الإشعارات" : "Notifications"}</CardTitle>
          <CardDescription>
            {isAr
              ? "تفعيل قنوات الواتساب/SMS/البريد وتخصيص قوالب فوز المزاد."
              : "Enable WhatsApp/SMS/email channels and customize auction win templates."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/dashboard/settings/notifications">
              <Bell className="size-4 me-2" />{" "}
              {isAr ? "إدارة الإشعارات والقوالب" : "Manage notifications & templates"}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/dashboard/settings/reminders">
              <Bell className="size-4 me-2" />{" "}
              {isAr ? "التذكيرات الذكية" : "Smart reminders"}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
