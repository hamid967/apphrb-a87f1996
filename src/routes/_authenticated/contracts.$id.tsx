import { createFileRoute, redirect } from "@tanstack/react-router";
import { detailHead } from "@/lib/detail-og-head";

export const Route = createFileRoute("/_authenticated/contracts/$id")({
  head: ({ params }) => detailHead({ entityAr: 'عقد', entityEn: 'Contract', id: String(params.id), path: `/contracts/${params.id}`, kind: 'article' }),
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/dashboard/contracts/$id",
      params: params as { id: string },
      replace: true,
    });
  },
});
