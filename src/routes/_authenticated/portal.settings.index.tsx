import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { getPortalOverview } from "@/lib/portal.functions";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/theme-toggle";

const q = queryOptions({ queryKey: ["portal", "overview"], queryFn: () => getPortalOverview() });

export const Route = createFileRoute("/_authenticated/portal/settings/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(q),
  component: ProfileSettings,
});

function ProfileSettings() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const { data } = useSuspenseQuery(q);
  return (
    <div className="space-y-4">
      <section className="surface-card p-5">
        <h2 className="text-sm font-semibold">{isAr ? "الملف الشخصي" : "Personal profile"}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field
            label={isAr ? "الاسم الكامل" : "Full name"}
            value={data.profile.full_name ?? "—"}
          />
          <Field label={isAr ? "البريد" : "Email"} value={data.profile.email ?? "—"} />
          <Field label={isAr ? "القسم" : "Department"} value={data.profile.department ?? "—"} />
          <Field label={isAr ? "الدور" : "Role"} value={data.organization?.role ?? "—"} />
        </div>
      </section>
      <section className="surface-card p-5">
        <h2 className="text-sm font-semibold">{isAr ? "الشركة" : "Company"}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label={isAr ? "الاسم" : "Name"} value={data.organization?.name ?? "—"} />
          <Field label={isAr ? "المعرّف" : "Slug"} value={data.organization?.slug ?? "—"} />
        </div>
      </section>
      <section className="surface-card p-5">
        <h2 className="text-sm font-semibold">
          {isAr ? "المظهر واللغة" : "Appearance & Language"}
        </h2>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <ThemeToggle />
          <LanguageSwitcher />
        </div>
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-sm">
        {value}
      </div>
    </div>
  );
}
