import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { listPublishedPosts } from "@/lib/marketing.functions";
import { Building2, ArrowRight } from "lucide-react";

const postsQuery = queryOptions({
  queryKey: ["blog", "list"],
  queryFn: () => listPublishedPosts(),
});

function formatStableDate(value: string | null | undefined) {
  if (!value) return "";

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";

  return parsed.toISOString().slice(0, 10);
}

export const Route = createFileRoute("/blog/")({
  head: () => ({
    meta: [
      { title: "المدونة — HBSpro | Blog" },
      {
        name: "description",
        content: "مقالات وأدلة حول إدارة العقارات، التقنية العقارية، والفوترة الإلكترونية في السعودية.",
      },
      { property: "og:title", content: "المدونة — HBSpro" },
      { property: "og:description", content: "أحدث المقالات من فريق HBSpro." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://hrhbs.com/blog" },
    ],
    links: [{ rel: "canonical", href: "https://hrhbs.com/blog" }],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(postsQuery),
  component: BlogIndex,
});

function BlogIndex() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const { data } = useSuspenseQuery(postsQuery);

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="theme-luxe min-h-app bg-background text-foreground">
      <header className="border-b border-border/60 bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2 font-bold">
            <Building2 className="h-5 w-5" />
            <span>HBSpro</span>
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="mb-10 text-center">
          <h1 className="text-display text-4xl sm:text-5xl">
            {isAr ? "المدونة" : "Blog"}
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            {isAr
              ? "أفكار، أدلة، وأخبار من فريق HBSpro."
              : "Ideas, guides, and updates from the HBSpro team."}
          </p>
        </div>

        {data.posts.length === 0 ? (
          <div className="rounded-xl border border-border/60 bg-card/40 p-12 text-center text-muted-foreground">
            {isAr
              ? "لا توجد مقالات منشورة بعد — تابعنا قريباً!"
              : "No posts published yet — check back soon!"}
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {data.posts.map((p) => (
              <Link
                key={p.id}
                to="/blog/$slug"
                params={{ slug: p.slug }}
                className="group flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card/40 transition hover:border-primary/50 hover:bg-card/70"
              >
                {p.cover_url ? (
                  <img
                    src={p.cover_url}
                    alt={isAr ? p.title_ar : p.title_en}
                    className="h-48 w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="h-48 w-full bg-gradient-to-br from-primary/20 to-primary/5" />
                )}
                <div className="flex flex-1 flex-col p-5">
                  <h2 className="text-lg font-semibold group-hover:text-primary">
                    {isAr ? p.title_ar : p.title_en}
                  </h2>
                  {(isAr ? p.excerpt_ar : p.excerpt_en) && (
                    <p className="mt-2 line-clamp-3 flex-1 text-sm text-muted-foreground">
                      {isAr ? p.excerpt_ar : p.excerpt_en}
                    </p>
                  )}
                  <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{formatStableDate(p.published_at)}</span>
                    <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
