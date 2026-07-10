UPDATE public.blog_posts SET
  title_ar   = regexp_replace(title_ar,   'HBSpro\s*\(\s*HBSpro\s*\)', 'HBSpro', 'g'),
  title_en   = regexp_replace(title_en,   'HBSpro\s*\(\s*HBSpro\s*\)', 'HBSpro', 'g'),
  excerpt_ar = regexp_replace(excerpt_ar, 'HBSpro\s*\(\s*HBSpro\s*\)', 'HBSpro', 'g'),
  excerpt_en = regexp_replace(excerpt_en, 'HBSpro\s*\(\s*HBSpro\s*\)', 'HBSpro', 'g'),
  body_ar    = regexp_replace(body_ar,    'HBSpro\s*\(\s*HBSpro\s*\)', 'HBSpro', 'g'),
  body_en    = regexp_replace(body_en,    'HBSpro\s*\(\s*HBSpro\s*\)', 'HBSpro', 'g');