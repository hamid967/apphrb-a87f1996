CREATE TABLE public.blog_posts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title_ar text NOT NULL,
  title_en text NOT NULL,
  excerpt_ar text,
  excerpt_en text,
  body_ar text NOT NULL,
  body_en text NOT NULL,
  cover_url text,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.blog_posts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blog_posts TO authenticated;
GRANT ALL ON public.blog_posts TO service_role;
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published posts are public"
  ON public.blog_posts FOR SELECT
  USING (published_at IS NOT NULL AND published_at <= now());

CREATE POLICY "Super admins manage all posts"
  ON public.blog_posts FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Authors read own drafts"
  ON public.blog_posts FOR SELECT
  TO authenticated
  USING (author_id = auth.uid());

CREATE INDEX blog_posts_published_at_idx ON public.blog_posts (published_at DESC) WHERE published_at IS NOT NULL;

CREATE TRIGGER update_blog_posts_updated_at
  BEFORE UPDATE ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE TABLE public.faq_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category text NOT NULL DEFAULT 'general',
  question_ar text NOT NULL,
  question_en text NOT NULL,
  answer_ar text NOT NULL,
  answer_en text NOT NULL,
  order_index integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.faq_entries TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.faq_entries TO authenticated;
GRANT ALL ON public.faq_entries TO service_role;
ALTER TABLE public.faq_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published FAQ entries are public"
  ON public.faq_entries FOR SELECT
  USING (is_published = true);

CREATE POLICY "Super admins manage FAQ"
  ON public.faq_entries FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX faq_entries_category_idx ON public.faq_entries (category, order_index);

CREATE TRIGGER update_faq_entries_updated_at
  BEFORE UPDATE ON public.faq_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();