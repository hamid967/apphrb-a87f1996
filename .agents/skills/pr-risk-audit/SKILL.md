---
name: pr-risk-audit
description: Audit a GitHub Pull Request for schema, RLS, CI, and merge risks in this HBSpro repo. Trigger when the user asks to review, audit, check risks, or validate a PR before merging (Arabic keywords include مراجعة PR، تدقيق، مخاطر، قبل الدمج). Produces a structured report with a pre-merge checklist.
---

# PR Risk Audit

Systematic pre-merge review for Pull Requests in `hamid967/apphrb-a87f1996`. Runs read-only checks against GitHub + the current Supabase DB, then outputs a fixed report shape.

## Inputs

- `PR_NUMBER` — required
- `REPO` — defaults to `hamid967/apphrb-a87f1996`
- `BASE` — defaults to `hrbapp`

## Execution steps

Run steps 1-5 in order. Use parallel shell where independent.

### 1. Metadata & mergeability
```bash
curl -s "https://api.github.com/repos/$REPO/pulls/$PR_NUMBER" \
  | python3 -c "import json,sys;p=json.load(sys.stdin);print('TITLE:',p['title']);print('BRANCH:',p['head']['ref'],'->',p['base']['ref']);print('AUTHOR:',p['user']['login']);print('STATS:','+',p['additions'],'-',p['deletions'],'files:',p['changed_files']);print('MERGEABLE:',p.get('mergeable'),'STATE:',p.get('mergeable_state'));print('BODY:',(p['body'] or '(none)')[:1200])"
```

Flag if: `mergeable_state` is `unstable`/`dirty`/`blocked`, no description, base branch wrong, > 2000 lines changed.

### 2. Changed files & CI
```bash
curl -s "https://api.github.com/repos/$REPO/pulls/$PR_NUMBER/files?per_page=100" \
  | python3 -c "import json,sys;[print(f\"{f['status']:8s} +{f['additions']:4d} -{f['deletions']:4d}  {f['filename']}\") for f in json.load(sys.stdin)]"

SHA=$(curl -s "https://api.github.com/repos/$REPO/pulls/$PR_NUMBER" | python3 -c "import json,sys;print(json.load(sys.stdin)['head']['sha'])")
curl -s "https://api.github.com/repos/$REPO/commits/$SHA/check-runs" \
  | python3 -c "import json,sys;[print(r['conclusion'] or r['status'],'|',r['name']) for r in json.load(sys.stdin).get('check_runs',[])]"
```

Flag if: any check `failure` / `cancelled`; SQL migration file bundled with unrelated feature code; both migration + admin routes touched in same PR without justification.

### 3. Migration audit (per new/modified SQL file under `supabase/migrations/`)

Download each file, then for **every** `CREATE TABLE public.<name>` verify **in the same file, in this order**:
1. `GRANT` for `authenticated` and/or `anon` matching the policies
2. `GRANT ALL ... TO service_role`
3. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
4. `CREATE POLICY` for each of SELECT / INSERT / UPDATE / DELETE the app needs

Also check:
- **Missing helper functions:** for every `public.<fn>(...)` call in a policy or SECURITY DEFINER body, verify it exists in DB:
  ```bash
  psql -tAc "select proname from pg_proc where proname = '<fn>'"
  ```
- **super_admin bypass:** for tables the `/admin` surface reads, policies must include `OR public.has_role(auth.uid(),'super_admin')` — otherwise super_admin loses access.
- **FKs to `auth.users`:** forbidden by project convention — must reference `public.profiles` instead.
- **SECURITY DEFINER functions:** must `SET search_path = public` and check `auth.uid()` / role before privileged writes.
- **DELETE policies:** if a table has INSERT/UPDATE but no DELETE, confirm this is intentional (financial records) — otherwise flag.
- **CHECK constraints with `now()` or other volatile fns:** must be triggers, not CHECKs.

### 4. Code-side sanity
- New `createServerFn` files: verify `.middleware([requireSupabaseAuth])` for anything not explicitly public.
- New public routes (not under `_authenticated/`): confirm they don't call protected server fns from a loader.
- `supabaseAdmin` imports: must be inside handlers via `await import(...)`, never module-scope in `*.functions.ts`.

### 5. Branch hygiene
```bash
curl -s "https://api.github.com/repos/$REPO/compare/$BASE...<branch>" \
  | python3 -c "import json,sys;d=json.load(sys.stdin);print('ahead:',d['ahead_by'],'behind:',d['behind_by'],'status:',d['status'])"
```
Flag if: behind by many commits, diverged, title doesn't match commits.

## Output shape (required)

Produce the report using **exactly** these sections in Arabic:

```
## مراجعة PR #<N> — <title>

**الفرع:** <head> → <base> · **الإحصائيات:** +X / −Y · <F> ملف · **الدمج:** <state>

### 🚨 Blockers (يمنع الدمج)
- <بند مع اقتباس ملف:سطر>

### ⚠️ ملاحظات مهمة
- <بند>

### ✅ ما هو صحيح
- <بند>

### قائمة تحقق قبل الدمج
- [ ] CI أخضر بالكامل
- [ ] كل جدول جديد لديه GRANT + RLS + POLICIES بالترتيب الصحيح
- [ ] لا توجد دوال مرجعية مفقودة في السياسات
- [ ] super_admin يملك وصولاً حيث يحتاج
- [ ] لا FKs إلى auth.users
- [ ] SECURITY DEFINER تضبط search_path وتفحص الصلاحيات
- [ ] createServerFn المحمية تستخدم requireSupabaseAuth
- [ ] لا استيراد لـ supabaseAdmin على مستوى الوحدة في *.functions.ts
- [ ] وصف PR يشرح النطاق والمخاطر
- [ ] الفرع متزامن مع <base>

### التوصية
<merge / fix-then-merge / close>
```

## Rules

- **Read-only.** لا تُعدّل الكود أو تدمج PR — فقط اعرض التقرير.
- **اقتبس دائماً `ملف:رقم_سطر`** لكل نقطة بلوكر.
- **افصل** بين البلوكر (يمنع الدمج) والملاحظة (يمكن دمجها لاحقاً).
- إن كان الـ PR كبيراً (>15 ملفاً)، لخّص الملفات حسب المجلد بدل ذكرها كلها.
- اسأل المستخدم قبل تشغيل أي اختبار E2E عبر Playwright.
