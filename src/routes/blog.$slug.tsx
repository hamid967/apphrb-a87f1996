import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { getPostBySlug } from "@/lib/marketing.functions";
import { Building2, ArrowLeft } from "lucide-react";

const postQuery = (slug: string) =>
  queryOptions({
    queryKey: ["blog", "post", slug],
    queryFn: () => getPostBySlug({ data: { slug } }),
  });

export const Route = createFileRoute("/blog/$slug")({
  loader: async ({ params, context }) => {
    const res = await context.queryClient.ensureQueryData(postQuery(params.slug));
    if (!res.post) throw notFound();
    return res.post;
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: "غير موجود — Aqari" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const title = loaderData.title_ar || loaderData.title_en;
    const desc = loaderData.excerpt_ar || loaderData.excerpt_en || title;
    const url = `https://apphrb.lovable.app/blog/${params.slug}`;
    return {
      meta: [
        { title: `${title} — Aqari` },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "article" },
        { property: "og:url", content: url },
        ...(loaderData.cover_url ? [{ property: "og:image", content: loaderData.cover_url }] : []),
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  notFoundComponent: PostNotFound,
  errorComponent: PostError,
  component: PostPage,
});

function PostPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const params = Route.useParams();
  const { data } = useSuspenseQuery(postQuery(params.slug));
  const post = data.post!;

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="theme-luxe min-h-app bg-background text-foreground">
      <header className="border-b border-border/60 bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2 font-bold">
            <Building2 className="h-5 w-5" />
            <span>Aqari</span>
          </Link>
          <Link to="/blog" className="text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="me-1 inline h-4 w-4 rtl:rotate-180" />
            {isAr ? "كل المقالات" : "All posts"}
          </Link>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-display text-3xl sm:text-4xl">
          {isAr ? post.title_ar : post.title_en}
        </h1>
        {post.published_at && (
          <div className="mt-3 text-sm text-muted-foreground">
            {new Date(post.published_at).toLocaleDateString(isAr ? "ar-SA" : "en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </div>
        )}
        {post.cover_url && (
          <img
            src={post.cover_url}
            alt={isAr ? post.title_ar : post.title_en}
            className="mt-8 w-full rounded-xl border border-border/60"
          />
        )}
        <div className="prose prose-invert mt-8 max-w-none whitespace-pre-wrap text-foreground/90">
          {isAr ? post.body_ar : post.body_en}
        </div>
      </article>
    </div>
  );
}

function PostNotFound() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  return (
    <div className="theme-luxe flex min-h-app items-center justify-center bg-background p-8 text-center">
      <div>
        <h1 className="mb-2 text-2xl font-semibold">{isAr ? "المقال غير موجود" : "Post not found"}</h1>
        <Link to="/blog" className="text-primary underline">
          {isAr ? "العودة للمدونة" : "Back to blog"}
        </Link>
      </div>
    </div>
  );
}

function PostError() {
  return (
    <div className="theme-luxe flex min-h-app items-center justify-center bg-background p-8 text-center">
      <div>
        <h1 className="mb-2 text-2xl font-semibold">Something went wrong</h1>
        <Link to="/blog" className="text-primary underline">Back to blog</Link>
      </div>
    </div>
  );
}
