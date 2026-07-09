import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

function publicClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ------------ Blog ------------
export const listPublishedPosts = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = publicClient();
  const { data, error } = await supabase
    .from("blog_posts")
    .select("id, slug, title_ar, title_en, excerpt_ar, excerpt_en, cover_url, published_at")
    .not("published_at", "is", null)
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false })
    .limit(50);
  if (error) return { posts: [], error: error.message };
  return { posts: data ?? [], error: null };
});

export const getPostBySlug = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ slug: z.string().min(1).max(200) }).parse(input))
  .handler(async ({ data }) => {
    const supabase = publicClient();
    const { data: post, error } = await supabase
      .from("blog_posts")
      .select("*")
      .eq("slug", data.slug)
      .not("published_at", "is", null)
      .lte("published_at", new Date().toISOString())
      .maybeSingle();
    if (error) return { post: null, error: error.message };
    return { post, error: null };
  });

// ------------ FAQ ------------
export const listFaqEntries = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = publicClient();
  const { data, error } = await supabase
    .from("faq_entries")
    .select("id, category, question_ar, question_en, answer_ar, answer_en, order_index")
    .eq("is_published", true)
    .order("category", { ascending: true })
    .order("order_index", { ascending: true });
  if (error) return { entries: [], error: error.message };
  return { entries: data ?? [], error: null };
});

// ------------ Contact ------------
const contactSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().regex(emailRegex).max(320),
  phone: z.string().trim().max(40).optional().default(""),
  company: z.string().trim().max(200).optional().default(""),
  units: z.string().trim().max(100).optional().default(""),
  message: z.string().trim().max(4000).optional().default(""),
});

export const submitContact = createServerFn({ method: "POST" })
  .inputValidator((input) => contactSchema.parse(input))
  .handler(async ({ data }) => {
    const supabase = publicClient();
    const { error } = await supabase.from("demo_requests").insert({
      name: data.name,
      email: data.email,
      phone: data.phone || null,
      company: data.company || null,
      units: data.units || null,
      message: data.message || null,
      source: "contact_page",
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, error: null };
  });
