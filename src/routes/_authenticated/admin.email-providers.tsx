import { t } from "@/lib/i18n";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { ProvidersPage } from "@/components/admin/ProvidersPage";
import {
  listEmailProviders,
  upsertEmailProvider,
  toggleEmailProvider,
} from "@/lib/admin-platform.functions";
import { sectionHead } from "@/lib/section-og-head";

export const Route = createFileRoute("/_authenticated/admin/email-providers")({
  head: () =>
    sectionHead({
      section: "admin",
      entityAr: "مزودو البريد",
      entityEn: "Email Providers",
      path: "/admin/email-providers",
    }),
  component: AdminEmailProvidersPage,
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

function AdminEmailProvidersPage() {
  const listFn = useServerFn(listEmailProviders);
  const upsertFn = useServerFn(upsertEmailProvider);
  const toggleFn = useServerFn(toggleEmailProvider);
  return (
    <ProvidersPage
      titleAr="مزودو البريد الإلكتروني"
      titleEn="Email Providers"
      descAr="إعداد مزودي البريد لإرسال الرسائل من المنصة."
      descEn="Configure email providers used to send messages from the platform."
      queryKey="admin-email-providers"
      listFn={listFn}
      upsertFn={upsertFn}
      toggleFn={toggleFn}
    />
  );
}
