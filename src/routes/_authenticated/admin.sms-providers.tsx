import { t } from "@/lib/i18n";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { ProvidersPage } from "@/components/admin/ProvidersPage";
import {
  listSmsProviders,
  upsertSmsProvider,
  toggleSmsProvider,
} from "@/lib/admin-platform.functions";
import { sectionHead } from "@/lib/section-og-head";

export const Route = createFileRoute("/_authenticated/admin/sms-providers")({
  head: () =>
    sectionHead({
      section: "admin",
      entityAr: "مزودو الرسائل",
      entityEn: "SMS Providers",
      path: "/admin/sms-providers",
    }),
  component: AdminSmsProvidersPage,
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
          Retry
        </Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-6">{t("common.notFound")}</div>,
});

function AdminSmsProvidersPage() {
  const listFn = useServerFn(listSmsProviders);
  const upsertFn = useServerFn(upsertSmsProvider);
  const toggleFn = useServerFn(toggleSmsProvider);
  return (
    <ProvidersPage
      titleAr="مزودو الرسائل النصية"
      titleEn="SMS Providers"
      descAr="إعداد مزودي الرسائل النصية والواتساب."
      descEn="Configure SMS and WhatsApp providers."
      queryKey="admin-sms-providers"
      listFn={listFn}
      upsertFn={upsertFn}
      toggleFn={toggleFn}
    />
  );
}
