import { createFileRoute, redirect } from "@tanstack/react-router";
import { detailHead } from "@/lib/detail-og-head";

export const Route = createFileRoute("/_authenticated/properties/$id")({
  head: ({ params }) => detailHead({ entityAr: 'عقار', entityEn: 'Property', id: String(params.id), path: `/properties/${params.id}`, kind: 'listing' }),
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/dashboard/properties/$id",
      params: params as { id: string },
      replace: true,
    });
  },
});
