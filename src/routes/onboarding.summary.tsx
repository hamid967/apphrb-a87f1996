import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Building2,
  Check,
  Home,
  Loader2,
  Network,
  Pencil,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { savePendingRedirect } from "@/lib/pending-redirect";
import {
  getOnboardingSummary,
  type OnboardingSummary,
} from "@/lib/onboarding-summary.functions";

export const Route = createFileRoute("/onboarding/summary")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "ملخّص التفعيل — HBSpro" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OnboardingSummaryPage,
});

const PROP_LABELS: Record<string, string> = {
  apartment: "شقة",
  villa: "فيلا",
  office: "مكتب",
  shop: "محل",
  building: "عمارة",
  land: "أرض",
};

function OnboardingSummaryPage() {
  const nav = useNavigate();
  const { user, ready } = useAuth();
  const load = useServerFn(getOnboardingSummary);
  const [data, setData] = useState<OnboardingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      const loc = "/onboarding/summary";
      savePendingRedirect(loc);
      nav({ to: "/auth", search: { redirect: loc }, replace: true });
      return;
    }
    (async () => {
      try {
        const res = await load();
        setData(res);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "تعذّر تحميل الملخّص");
      } finally {
        setLoading(false);
      }
    })();
  }, [ready, user, nav, load]);

  return (
    <div className="studio-shell relative min-h-[var(--app-height,100vh)] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-0">
        <div className="absolute -top-40 -start-40 size-[520px] rounded-full bg-[#C5A059]/20 blur-3xl" />
        <div className="absolute -bottom-40 -end-40 size-[520px] rounded-full bg-[#0d7a5f]/20 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-4xl px-4 py-10">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="studio-title text-3xl tracking-tight">ملخّص بيانات التفعيل</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              هذه البيانات التي تمّ حفظها من المعالج — يمكنك تعديل أي قسم لاحقًا.
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link to="/dashboard">
              <ArrowRight className="size-3.5 rtl:rotate-180" />
              لوحة التحكم
            </Link>
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 studio-card-lg p-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> جارٍ تحميل البيانات…
          </div>
        ) : err ? (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
            {err}
          </div>
        ) : data ? (
          <div className="space-y-4">
            <SectionCard
              icon={<UserRound className="size-4" />}
              title="بياناتك"
              editTo="/onboarding/wizard"
              editSearch={{ step: "profile" }}
              filled={Boolean(data.profile?.full_name)}
            >
              {data.profile?.full_name ? (
                <Grid>
                  <Row label="الاسم الكامل" value={data.profile.full_name} />
                  <Row label="رقم الجوال" value={data.profile.phone} dir="ltr" />
                  <Row label="المسمى الوظيفي" value={data.profile.job_title} />
                  <Row label="سبب الاشتراك" value={data.profile.signup_reason} />
                </Grid>
              ) : (
                <Empty text="لم يتم إدخال بياناتك بعد." />
              )}
            </SectionCard>

            <SectionCard
              icon={<Building2 className="size-4" />}
              title="الشركة"
              editTo="/onboarding/wizard"
              editSearch={{ step: "company" }}
              filled={Boolean(data.company)}
            >
              {data.company ? (
                <Grid>
                  <Row label="اسم الشركة" value={data.company.name} />
                  <Row label="رقم الاتصال" value={data.company.phone} dir="ltr" />
                  <Row label="العنوان" value={data.company.address} />
                  <Row
                    label="تاريخ الإنشاء"
                    value={new Date(data.company.created_at).toLocaleDateString("ar-SA")}
                  />
                </Grid>
              ) : (
                <Empty text="لم يتم إنشاء الشركة بعد." />
              )}
            </SectionCard>

            <SectionCard
              icon={<Network className="size-4" />}
              title={`الفروع والأقسام (${data.branches.length})`}
              editTo="/onboarding/wizard"
              editSearch={{ step: "branch" }}
              filled={data.branches.length > 0}
            >
              {data.branches.length ? (
                <div className="space-y-3">
                  {data.branches.map((b) => (
                    <div
                      key={b.id}
                      className="rounded-2xl border border-[#043927]/10 bg-white/70 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium">{b.name}</div>
                        {b.phone && (
                          <span className="text-xs text-muted-foreground" dir="ltr">
                            {b.phone}
                          </span>
                        )}
                      </div>
                      {b.address && (
                        <div className="mt-1 text-xs text-muted-foreground">{b.address}</div>
                      )}
                      {b.departments.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {b.departments.map((d) => (
                            <span
                              key={d.id}
                              className="rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-xs text-primary"
                            >
                              {d.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <Empty text="لم تُضَف فروع بعد." />
              )}
            </SectionCard>

            <SectionCard
              icon={<Home className="size-4" />}
              title={`العقارات (${data.properties.length})`}
              editTo="/onboarding/wizard"
              editSearch={{ step: "property" }}
              filled={data.properties.length > 0}
            >
              {data.properties.length ? (
                <div className="space-y-2">
                  {data.properties.map((p) => (
                    <Link
                      key={p.id}
                      to="/dashboard/properties/$id"
                      params={{ id: p.id }}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-[#043927]/10 bg-white/70 p-3 transition hover:border-primary/40 hover:bg-primary/5"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {p.title_ar || p.title_en || "—"}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">
                          {[
                            p.property_type ? PROP_LABELS[p.property_type] ?? p.property_type : null,
                            p.city,
                          ]
                            .filter(Boolean)
                            .join(" • ")}
                        </div>
                      </div>
                      {p.price != null && (
                        <div className="shrink-0 text-sm font-semibold tabular-nums">
                          {p.price.toLocaleString("ar-SA")}{" "}
                          <span className="text-xs text-muted-foreground">
                            {p.currency || "ر.س"}
                          </span>
                        </div>
                      )}
                    </Link>
                  ))}
                </div>
              ) : (
                <Empty text="لم يُضَف أي عقار بعد." />
              )}
            </SectionCard>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SectionCard({
  icon,
  title,
  editTo,
  editSearch,
  filled,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  editTo: "/onboarding/wizard";
  editSearch: { step: "profile" | "company" | "branch" | "property" };
  filled: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="studio-card studio-hover p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className={[
              "grid size-8 place-items-center rounded-full border",
              filled
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-muted text-muted-foreground",
            ].join(" ")}
          >
            {filled ? <Check className="size-4" /> : icon}
          </div>
          <h2 className="text-sm font-semibold sm:text-base">{title}</h2>
        </div>
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <Link to={editTo} search={editSearch}>
            <Pencil className="size-3.5" />
            تعديل
          </Link>
        </Button>
      </div>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>;
}

function Row({
  label,
  value,
  dir,
}: {
  label: string;
  value: string | null | undefined;
  dir?: "ltr" | "rtl";
}) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={["mt-0.5 truncate text-sm", value ? "text-foreground" : "text-muted-foreground/70"].join(
          " ",
        )}
        dir={dir}
      >
        {value || "—"}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="text-sm text-muted-foreground">{text}</div>;
}
