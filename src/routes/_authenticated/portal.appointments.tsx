import { createFileRoute } from "@tanstack/react-router";
import { portalHead } from "@/lib/portal-og-head";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, MapPin, Link as LinkIcon } from "lucide-react";
import { PortalPageHeader } from "@/components/portal/PortalPageHeader";
import { listPortalMeetings } from "@/lib/portal.functions";

export const Route = createFileRoute("/_authenticated/portal/appointments")({
  head: () => portalHead({ titleAr: 'المواعيد', titleEn: 'Appointments', descAr: 'احجز مواعيد المعاينة والصيانة.', path: '/portal/appointments' }),
  component: AppointmentsPage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">{error.message}</div>,
});

function AppointmentsPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const df = new Intl.DateTimeFormat(isAr ? "ar-SA" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const { data, isLoading } = useQuery({
    queryKey: ["portal", "meetings"],
    queryFn: () => listPortalMeetings(),
  });
  return (
    <div className="mx-auto max-w-[1400px] p-4 sm:p-6 lg:p-8">
      <PortalPageHeader
        icon={<CalendarDays className="size-5" />}
        title={isAr ? "المواعيد" : "Appointments"}
        subtitle={isAr ? "اجتماعات ومواعيد حكومية" : "Meetings & gov appointments"}
      />
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-muted/40" />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="surface-card p-16 text-center text-sm text-muted-foreground">
          {isAr ? "لا مواعيد قادمة" : "No upcoming appointments"}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((m: any) => (
            <div key={m.id} className="surface-card p-4">
              <div className="flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/15 text-primary">
                  <CalendarDays className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{m.title}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {df.format(new Date(m.starts_at))}
                  </div>
                  {m.location && (
                    <div className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="size-3" /> {m.location}
                    </div>
                  )}
                  {m.link && (
                    <a
                      href={m.link}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                    >
                      <LinkIcon className="size-3" /> {isAr ? "انضمام" : "Join"}
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
