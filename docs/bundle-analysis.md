# Bundle Analysis & Code-Splitting (1.5)

## تشغيل المحلل

```bash
bun run build:analyze
open dist/bundle-stats.html
```

يولّد `dist/bundle-stats.html` (treemap مع gzip + brotli).

## Manual Chunks

تم فصل الحزم الثقيلة عبر `vite.config.ts → build.rollupOptions.output.manualChunks`:

| Chunk | يحتوي |
|---|---|
| `vendor-three` | `three`, `@react-three/*` (خريطة SR 3D) |
| `vendor-charts` | `recharts`, `d3-*` (لوحات admin) |
| `vendor-editor` | `@tiptap/*`, `prosemirror` (assistant/report editor) |
| `vendor-pdf` | `pdf-lib`, `@pdf-lib/fontkit` (تصدير الفواتير/العقود) |
| `vendor-radix` | جميع `@radix-ui/*` |
| `vendor-tanstack` | router + query + start |
| `vendor-supabase` | `@supabase/supabase-js` |
| `vendor-forms` | `react-hook-form`, `zod`, `@hookform/*` |

## Route-level splitting

TanStack Start يفعّل `autoCodeSplitting: true` افتراضياً — كل `component` في ملف مسار
يُنقل إلى chunk منفصل تلقائياً. **قاعدة صارمة**: لا تُصدِّر (`export`) دالة المكوّن
من ملف المسار وإلا يُدمج في bundle الرئيسي.

الملفات التي تحتوي `export function` مساعدة (لا تخصّ Route.component):
- `dashboard.expenses.batches.tsx` → `StatusBadge`
- `portal.billing.tsx` → `StatusBadge`

يُفضَّل نقلها إلى `src/components/shared/status-badge.tsx` مستقبلاً.

## معايير المراقبة

- `chunkSizeWarningLimit: 900` KB
- أي chunk > 900 KB يظهر تحذير في build → يجب مراجعته وتقسيمه.
- الهدف: initial JS < 250 KB gzip على landing، < 400 KB على dashboard.
