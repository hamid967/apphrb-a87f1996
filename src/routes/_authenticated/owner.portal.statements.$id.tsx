import { createFileRoute, redirect } from "@tanstack/react-router";
import { detailHead } from "@/lib/detail-og-head";

export const Route = createFileRoute("/_authenticated/owner/portal/statements/$id")({
  head: ({ params }) => detailHead({ entityAr: 'كشف مالك', entityEn: 'Owner Statement', id: String(params.id), path: `/owner/portal/statements/${params.id}`, kind: 'article' }),
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/portal/owner/statements/$id",
      params: params as { id: string },
      replace: true,
    });
  },
});
