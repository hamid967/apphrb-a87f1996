UPDATE public.blog_posts SET
  title_ar   = regexp_replace(regexp_replace(title_ar,   'عقاري\s+Aqari', 'HBSpro', 'gi'), '(Aqari|Aqary)', 'HBSpro', 'g'),
  title_en   = regexp_replace(title_en,   '(Aqari|Aqary)', 'HBSpro', 'g'),
  excerpt_ar = regexp_replace(regexp_replace(excerpt_ar, 'عقاري\s+Aqari', 'HBSpro', 'gi'), '(Aqari|Aqary)', 'HBSpro', 'g'),
  excerpt_en = regexp_replace(excerpt_en, '(Aqari|Aqary)', 'HBSpro', 'g'),
  body_ar    = regexp_replace(regexp_replace(body_ar,    'عقاري\s+Aqari', 'HBSpro', 'gi'), '(Aqari|Aqary)', 'HBSpro', 'g'),
  body_en    = regexp_replace(body_en,    '(Aqari|Aqary)', 'HBSpro', 'g')
WHERE title_ar ~* '(Aqari|Aqary)' OR title_en ~* '(Aqari|Aqary)'
   OR excerpt_ar ~* '(Aqari|Aqary)' OR excerpt_en ~* '(Aqari|Aqary)'
   OR body_ar ~* '(Aqari|Aqary)'    OR body_en ~* '(Aqari|Aqary)';

UPDATE public.faq_entries SET
  question_ar = regexp_replace(regexp_replace(question_ar, 'عقاري\s+Aqari', 'HBSpro', 'gi'), '(Aqari|Aqary)', 'HBSpro', 'g'),
  question_en = regexp_replace(question_en, '(Aqari|Aqary)', 'HBSpro', 'g'),
  answer_ar   = regexp_replace(regexp_replace(answer_ar,   'عقاري\s+Aqari', 'HBSpro', 'gi'), '(Aqari|Aqary)', 'HBSpro', 'g'),
  answer_en   = regexp_replace(answer_en,   '(Aqari|Aqary)', 'HBSpro', 'g')
WHERE question_ar ~* '(Aqari|Aqary)' OR question_en ~* '(Aqari|Aqary)'
   OR answer_ar ~* '(Aqari|Aqary)'   OR answer_en ~* '(Aqari|Aqary)';