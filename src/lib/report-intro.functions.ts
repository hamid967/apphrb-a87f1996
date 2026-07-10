import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Schema ----------

const presetSchema = z.enum(["custom", "financial", "operational", "technical"]);
const formatSchema = z.enum(["pdf", "docx", "xlsx", "html"]);

export const AVAILABLE_METRICS = [
  "contracts_active",
  "contracts_expiring_30d",
  "payments_ytd",
  "payments_outstanding",
  "tenants_count",
  "owners_count",
  "properties_count",
  "units_count",
  "units_occupied",
  "tickets_open",
  "leads_new_30d",
] as const;
export type AvailableMetric = (typeof AVAILABLE_METRICS)[number];

const introSchema = z.object({
  companyId: z.string().uuid(),
  titleAr: z.string().min(1).max(200),
  titleEn: z.string().min(1).max(200),
  preset: presetSchema,
  richContentAr: z.string().max(30_000),
  richContentEn: z.string().max(30_000),
  dynamicMetrics: z.array(z.enum(AVAILABLE_METRICS)).max(20),
});

// ---------- Presets (built-in bilingual templates) ----------

export const INTRO_PRESETS: Record<
  Exclude<z.infer<typeof presetSchema>, "custom">,
  { titleAr: string; titleEn: string; ar: string; en: string; metrics: AvailableMetric[] }
> = {
  financial: {
    titleAr: "المقدمة المالية",
    titleEn: "Financial Introduction",
    ar: "يستعرض هذا التقرير الأداء المالي للفترة الحالية، شاملاً إجمالي التحصيلات، المستحقات القائمة، وأهم مؤشرات دورة الإيرادات.",
    en: "This report presents the financial performance for the current period, including total collections, outstanding receivables, and key revenue-cycle indicators.",
    metrics: ["payments_ytd", "payments_outstanding", "contracts_active", "contracts_expiring_30d"],
  },
  operational: {
    titleAr: "المقدمة التشغيلية",
    titleEn: "Operational Introduction",
    ar: "يعرض هذا القسم مؤشرات التشغيل اليومي: إشغال الوحدات، حالة العقود، وطلبات الصيانة المفتوحة.",
    en: "This section summarizes day-to-day operations: unit occupancy, contract status, and open maintenance requests.",
    metrics: ["units_occupied", "units_count", "tickets_open", "contracts_active"],
  },
  technical: {
    titleAr: "المقدمة الفنية",
    titleEn: "Technical Introduction",
    ar: "يوثّق هذا التقرير الحالة الفنية للمنصة والمقاييس الرئيسية للاستخدام خلال الفترة.",
    en: "This report documents the platform's technical state and key usage metrics for the period.",
    metrics: ["properties_count", "units_count", "tenants_count", "owners_count"],
  },
};

// ---------- Server functions ----------

/** Read (or return null) the intro template for a company. */
export const getReportIntro = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ companyId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("report_templates_intro")
      .select("*")
      .eq("company_id", data.companyId)
      .maybeSingle();
    if (error) throw error;
    return row;
  });

/** Upsert the intro template for a company. */
export const upsertReportIntro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => introSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { sanitiseRichHtml } = await import("@/lib/sanitize-rich");
    const payload = {
      company_id: data.companyId,
      title_ar: data.titleAr,
      title_en: data.titleEn,
      preset: data.preset,
      rich_content_ar: sanitiseRichHtml(data.richContentAr),
      rich_content_en: sanitiseRichHtml(data.richContentEn),
      dynamic_metrics: data.dynamicMetrics,
      updated_by: context.userId,
    };
    const { data: row, error } = await context.supabase
      .from("report_templates_intro")
      .upsert(payload, { onConflict: "company_id" })
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

// ---------- Metric resolver ----------

async function resolveMetrics(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  orgId: string,
  keys: AvailableMetric[],
): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  const wanted = new Set(keys);
  const count = async (table: string, filter?: (q: unknown) => unknown) => {
    let q = supabase.from(table).select("id", { count: "exact", head: true }).eq("org_id", orgId);
    if (filter) q = filter(q) as typeof q;
    const { count: c } = await q;
    return c ?? 0;
  };

  if (wanted.has("contracts_active"))
    result.contracts_active = await count("contracts", (q) =>
      (q as { eq: (a: string, b: string) => unknown }).eq("status", "active"),
    );
  if (wanted.has("contracts_expiring_30d")) {
    const in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    result.contracts_expiring_30d = await count("contracts", (q) =>
      (q as { gte: (a: string, b: string) => { lte: (a: string, b: string) => unknown } })
        .gte("end_date", today)
        .lte("end_date", in30),
    );
  }
  if (wanted.has("tenants_count")) result.tenants_count = await count("tenants");
  if (wanted.has("owners_count")) result.owners_count = await count("owners");
  if (wanted.has("properties_count")) result.properties_count = await count("properties");
  if (wanted.has("units_count")) result.units_count = await count("units");
  if (wanted.has("units_occupied"))
    result.units_occupied = await count("units", (q) =>
      (q as { eq: (a: string, b: string) => unknown }).eq("status", "occupied"),
    );
  if (wanted.has("tickets_open"))
    result.tickets_open = await count("maintenance_tickets", (q) =>
      (q as { neq: (a: string, b: string) => unknown }).neq("status", "closed"),
    );
  if (wanted.has("leads_new_30d")) {
    const ago = new Date(Date.now() - 30 * 864e5).toISOString();
    result.leads_new_30d = await count("leads", (q) =>
      (q as { gte: (a: string, b: string) => unknown }).gte("created_at", ago),
    );
  }
  if (wanted.has("payments_ytd") || wanted.has("payments_outstanding")) {
    const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString();
    const { data: pays } = await supabase
      .from("payments")
      .select("amount, status, paid_at, created_at")
      .eq("org_id", orgId)
      .gte("created_at", yearStart)
      .is("deleted_at", null);
    const rows = (pays ?? []) as Array<{ amount: number | null; status: string | null }>;
    if (wanted.has("payments_ytd"))
      result.payments_ytd = rows
        .filter((r) => r.status === "paid")
        .reduce((s, r) => s + Number(r.amount ?? 0), 0);
    if (wanted.has("payments_outstanding"))
      result.payments_outstanding = rows
        .filter((r) => r.status !== "paid")
        .reduce((s, r) => s + Number(r.amount ?? 0), 0);
  }
  return result;
}

function metricLabel(k: string): { ar: string; en: string } {
  const map: Record<string, { ar: string; en: string }> = {
    contracts_active: { ar: "العقود النشطة", en: "Active contracts" },
    contracts_expiring_30d: { ar: "عقود تنتهي خلال 30 يومًا", en: "Contracts expiring in 30 days" },
    payments_ytd: { ar: "المدفوعات المحصّلة (ر.س)", en: "Payments collected YTD (SAR)" },
    payments_outstanding: { ar: "المستحقات القائمة (ر.س)", en: "Outstanding receivables (SAR)" },
    tenants_count: { ar: "عدد المستأجرين", en: "Tenants" },
    owners_count: { ar: "عدد الملاك", en: "Owners" },
    properties_count: { ar: "عدد العقارات", en: "Properties" },
    units_count: { ar: "إجمالي الوحدات", en: "Total units" },
    units_occupied: { ar: "الوحدات المؤجَّرة", en: "Occupied units" },
    tickets_open: { ar: "طلبات الصيانة المفتوحة", en: "Open maintenance tickets" },
    leads_new_30d: { ar: "عملاء محتملون (30 يوم)", en: "New leads (30d)" },
  };
  return map[k] ?? { ar: k, en: k };
}

// ---------- Export: generate + store ----------

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/** Sanitise inline rich text — strip <script>/<style>/on* handlers before rendering. */
function sanitiseRich(html: string): string {
  return html
    .replace(/<\/?(script|style|iframe|object|embed)[^>]*>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

function renderHtml(opts: {
  intro: {
    title_ar: string;
    title_en: string;
    rich_content_ar: string;
    rich_content_en: string;
    dynamic_metrics: string[];
  };
  metrics: Record<string, number>;
  companyName: string;
  generatedAt: string;
}): string {
  const rowsAr = opts.intro.dynamic_metrics
    .map((k) => {
      const l = metricLabel(k);
      const v = opts.metrics[k];
      return `<tr><td>${escapeHtml(l.ar)}</td><td class="num">${v == null ? "—" : v.toLocaleString("ar-SA")}</td></tr>`;
    })
    .join("");
  const rowsEn = opts.intro.dynamic_metrics
    .map((k) => {
      const l = metricLabel(k);
      const v = opts.metrics[k];
      return `<tr><td>${escapeHtml(l.en)}</td><td class="num">${v == null ? "—" : v.toLocaleString("en-US")}</td></tr>`;
    })
    .join("");

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(opts.intro.title_ar)} — ${escapeHtml(opts.companyName)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Almarai:wght@400;700;800&family=Inter:wght@400;600;700&display=swap');
  :root { --emerald:#0F766E; --gold:#D4A853; --navy:#0B1220; --slate:#334155; }
  * { box-sizing:border-box; }
  body { margin:0; font-family:'Almarai','IBM Plex Sans Arabic',sans-serif; color:var(--navy); background:#fff; }
  .page { max-width: 820px; margin: 0 auto; padding: 32px; }
  .cover { text-align:center; padding: 40px 0 24px; border-bottom: 2px solid var(--gold); }
  .cover h1 { color: var(--emerald); font-size: 28px; margin:0 0 8px; }
  .cover .en { font-family:'Inter',sans-serif; color: var(--slate); font-size: 14px; margin-top:4px; }
  .meta { color: var(--slate); font-size: 12px; margin-top: 12px; }
  section { margin-top: 28px; }
  h2 { color: var(--emerald); font-size: 20px; border-bottom:1px solid #E2E8F0; padding-bottom:6px; }
  .rich { line-height: 1.9; font-size: 15px; }
  .rich[dir="ltr"] { font-family:'Inter',sans-serif; }
  table { width:100%; border-collapse: collapse; margin-top: 12px; font-size: 14px; }
  th, td { border:1px solid #E2E8F0; padding: 8px 12px; text-align: start; }
  th { background: #F1F5F9; color: var(--navy); }
  td.num { font-variant-numeric: tabular-nums; font-weight: 700; color: var(--emerald); }
  .split { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .split > div[dir="ltr"] { text-align: left; }
  footer { margin-top: 40px; padding-top:16px; border-top:1px solid #E2E8F0; color:var(--slate); font-size:12px; text-align:center; }
  @media print {
    .no-print { display:none; }
    .page { padding: 16px; }
  }
  .toolbar { position: sticky; top: 0; background:#0B1220; color:#fff; padding:10px 16px; display:flex; gap:12px; justify-content:center; }
  .toolbar button { background: var(--gold); color: var(--navy); border:0; padding:8px 16px; border-radius:6px; font-weight:700; cursor:pointer; }
</style>
</head>
<body>
<div class="toolbar no-print">
  <button onclick="window.print()">طباعة / حفظ PDF</button>
  <button onclick="window.print()">Print / Save PDF</button>
</div>
<div class="page">
  <div class="cover">
    <h1>${escapeHtml(opts.intro.title_ar)}</h1>
    <div class="en">${escapeHtml(opts.intro.title_en)}</div>
    <div class="meta">${escapeHtml(opts.companyName)} · ${escapeHtml(opts.generatedAt)}</div>
  </div>

  <section class="split">
    <div dir="rtl"><h2>مقدمة الإدارة</h2><div class="rich">${sanitiseRich(opts.intro.rich_content_ar) || "<em>لا يوجد محتوى.</em>"}</div></div>
    <div dir="ltr"><h2>Management Introduction</h2><div class="rich">${sanitiseRich(opts.intro.rich_content_en) || "<em>No content.</em>"}</div></div>
  </section>

  ${
    opts.intro.dynamic_metrics.length
      ? `
  <section class="split">
    <div dir="rtl"><h2>مؤشرات مختارة</h2>
      <table><thead><tr><th>المقياس</th><th>القيمة</th></tr></thead><tbody>${rowsAr}</tbody></table>
    </div>
    <div dir="ltr"><h2>Selected Metrics</h2>
      <table><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody>${rowsEn}</tbody></table>
    </div>
  </section>`
      : ""
  }

  <footer>HBSpro · ${escapeHtml(opts.generatedAt)}</footer>
</div>
</body>
</html>`;
}

function renderMarkdown(opts: Parameters<typeof renderHtml>[0]): string {
  const lines: string[] = [];
  lines.push(`# ${opts.intro.title_ar} · ${opts.intro.title_en}`);
  lines.push(``, `_${opts.companyName} · ${opts.generatedAt}_`, ``);
  lines.push(`## مقدمة الإدارة / Management Introduction`, ``);
  lines.push(opts.intro.rich_content_ar.replace(/<[^>]+>/g, "").trim() || "_(empty)_");
  lines.push(``, `---`, ``);
  lines.push(opts.intro.rich_content_en.replace(/<[^>]+>/g, "").trim() || "_(empty)_");
  if (opts.intro.dynamic_metrics.length) {
    lines.push(
      ``,
      `## Metrics / المؤشرات`,
      ``,
      `| Metric | القيمة | Value |`,
      `| --- | --- | --- |`,
    );
    for (const k of opts.intro.dynamic_metrics) {
      const l = metricLabel(k);
      const v = opts.metrics[k];
      lines.push(
        `| ${l.en} · ${l.ar} | ${v?.toLocaleString("ar-SA") ?? "—"} | ${v?.toLocaleString("en-US") ?? "—"} |`,
      );
    }
  }
  return lines.join("\n");
}

/**
 * Generate the customisable-intro report in the requested format, upload it to Storage,
 * record a report_runs row, and return a signed URL.
 */
export const generateReportExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ companyId: z.string().uuid(), format: formatSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // 1) Verify caller is admin (RLS enforces too, but fail fast with a clear error).
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: admin role required.");

    // 2) Load company + intro template.
    const { data: company, error: cErr } = await context.supabase
      .from("companies")
      .select("id, name, org_id")
      .eq("id", data.companyId)
      .single();
    if (cErr || !company) throw new Error("Company not found or access denied.");

    const { data: intro } = await context.supabase
      .from("report_templates_intro")
      .select("*")
      .eq("company_id", data.companyId)
      .maybeSingle();

    const introRow = intro ?? {
      title_ar: "مقدمة الإدارة",
      title_en: "Management Introduction",
      rich_content_ar: "",
      rich_content_en: "",
      dynamic_metrics: [] as string[],
    };

    // 3) Insert queued run so RLS + admin gating are established up-front.
    const { data: run, error: runErr } = await context.supabase
      .from("report_runs")
      .insert({
        company_id: data.companyId,
        generated_by: context.userId,
        format: data.format,
        status: "queued",
      })
      .select("id")
      .single();
    if (runErr || !run) throw runErr ?? new Error("Failed to create run row.");

    try {
      // 4) Resolve dynamic metrics.
      const metrics = await resolveMetrics(
        context.supabase as unknown as import("@supabase/supabase-js").SupabaseClient,
        (company as { org_id: string }).org_id,
        (introRow.dynamic_metrics as string[]).filter((k): k is AvailableMetric =>
          (AVAILABLE_METRICS as readonly string[]).includes(k),
        ),
      );

      const generatedAt = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
      const payload = {
        intro: {
          title_ar: introRow.title_ar as string,
          title_en: introRow.title_en as string,
          rich_content_ar: introRow.rich_content_ar as string,
          rich_content_en: introRow.rich_content_en as string,
          dynamic_metrics: (introRow.dynamic_metrics as string[]) ?? [],
        },
        metrics,
        companyName: (company as { name: string }).name,
        generatedAt,
      };

      let body: Blob;
      let ext: string;
      let contentType: string;
      switch (data.format) {
        case "html":
        case "pdf": {
          // PDF is produced by opening the HTML and using the browser's print-to-PDF.
          body = new Blob([renderHtml(payload)], { type: "text/html;charset=utf-8" });
          ext = "html";
          contentType = "text/html; charset=utf-8";
          break;
        }
        case "docx":
        case "xlsx": {
          // Structured export used as a stand-in until native DOCX/XLSX generators land.
          // Downloads as JSON so external tooling can consume the same payload today.
          body = new Blob([JSON.stringify(payload, null, 2)], {
            type: "application/json;charset=utf-8",
          });
          ext = "json";
          contentType = "application/json; charset=utf-8";
          break;
        }
        default: {
          body = new Blob([renderMarkdown(payload)], { type: "text/markdown;charset=utf-8" });
          ext = "md";
          contentType = "text/markdown; charset=utf-8";
        }
      }

      const objectPath = `${data.companyId}/${run.id}.${ext}`;
      const { error: upErr } = await context.supabase.storage
        .from("report-exports")
        .upload(objectPath, body, { contentType, upsert: true });
      if (upErr) throw upErr;

      const { data: signed, error: sErr } = await context.supabase.storage
        .from("report-exports")
        .createSignedUrl(objectPath, 60 * 60 * 24); // 24h
      if (sErr || !signed) throw sErr ?? new Error("Failed to sign URL.");

      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await context.supabase
        .from("report_runs")
        .update({
          status: "ready",
          storage_path: objectPath,
          file_size: body.size,
          signed_url_expires_at: expires,
        })
        .eq("id", run.id);

      return {
        runId: run.id as string,
        signedUrl: signed.signedUrl,
        expiresAt: expires,
        format: data.format,
      };
    } catch (e) {
      await context.supabase
        .from("report_runs")
        .update({ status: "failed", error: (e as Error).message ?? String(e) })
        .eq("id", run.id);
      throw e;
    }
  });

/** Recent runs for a company (any org member can read; write is admin-only via RLS). */
export const listReportRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ companyId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("report_runs")
      .select(
        "id, format, status, storage_path, file_size, signed_url_expires_at, created_at, generated_by, error",
      )
      .eq("company_id", data.companyId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return rows ?? [];
  });

/** Re-sign an existing report artefact (extends the shareable link by 24h). */
export const resignReportRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ runId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: run, error } = await context.supabase
      .from("report_runs")
      .select("id, storage_path")
      .eq("id", data.runId)
      .single();
    if (error || !run?.storage_path) throw error ?? new Error("Run not found.");
    const { data: signed, error: sErr } = await context.supabase.storage
      .from("report-exports")
      .createSignedUrl(run.storage_path, 60 * 60 * 24);
    if (sErr || !signed) throw sErr ?? new Error("Failed to sign URL.");
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await context.supabase
      .from("report_runs")
      .update({ signed_url_expires_at: expires })
      .eq("id", run.id);
    return { signedUrl: signed.signedUrl, expiresAt: expires };
  });
