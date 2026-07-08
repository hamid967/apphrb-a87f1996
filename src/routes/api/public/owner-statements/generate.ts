import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { PDFDocument, StandardFonts } from "pdf-lib";

/**
 * Monthly owner-statement PDF generator.
 *
 * Called by pg_cron. Auth is a shared secret sent in the `x-cron-secret`
 * header (compared in constant time). Bypasses auth at the edge (under
 * /api/public/*) so this header check is the only gate.
 *
 * Body: { period_start: "YYYY-MM-DD", period_end: "YYYY-MM-DD", org_id?: string }
 * - When `org_id` is provided, only that org is processed.
 * - Otherwise every org with owners is processed.
 *
 * The handler:
 * 1. Aggregates income/expenses per owner for the given period.
 * 2. Inserts (or updates) a row in public.owner_statements.
 * 3. Renders a bilingual PDF and uploads it to the private
 *    `owner-statements` bucket at `{org_id}/{owner_id}/{period}.pdf`.
 * 4. Updates owner_statements.pdf_url with a long-lived signed URL.
 */

export const Route = createFileRoute("/api/public/owner-statements/generate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // 1) Shared-secret verification (constant-time). Accepts either the
        // env secret (for manual triggers) or the DB-stored cron token (used
        // by pg_cron, which can read from app_settings but not from env).
        const envSecret = process.env.OWNER_STATEMENTS_CRON_SECRET ?? "";
        const { data: settingRow } = await supabaseAdmin
          .from("app_settings")
          .select("value")
          .eq("key", "owner_statements_cron_secret")
          .maybeSingle();
        const dbSecret = (settingRow?.value as string | null) ?? "";

        const provided = request.headers.get("x-cron-secret") ?? "";
        const a = Buffer.from(provided);
        const okEnv =
          envSecret && a.length === envSecret.length && timingSafeEqual(a, Buffer.from(envSecret));
        const okDb =
          dbSecret && a.length === dbSecret.length && timingSafeEqual(a, Buffer.from(dbSecret));
        if (!okEnv && !okDb) {
          return json({ error: "unauthorized" }, 401);
        }

        const raw = await request.text();

        let body: { period_start?: string; period_end?: string; org_id?: string } = {};
        try {
          body = raw ? (JSON.parse(raw) as typeof body) : {};
        } catch {
          return json({ error: "invalid body" }, 400);
        }
        const periodStart = body.period_start ?? defaultPeriodStart();
        const periodEnd = body.period_end ?? defaultPeriodEnd();

        // 2) Find owners to process.
        let ownersQ = supabaseAdmin
          .from("owners")
          .select("id, org_id, full_name, email, phone")
          .is("deleted_at", null);
        if (body.org_id) ownersQ = ownersQ.eq("org_id", body.org_id);
        const { data: owners, error: ownersErr } = await ownersQ;
        if (ownersErr) return json({ error: ownersErr.message }, 500);

        const results: Array<{ owner_id: string; status: string; error?: string }> = [];

        for (const owner of owners ?? []) {
          try {
            const totals = await aggregateOwnerTotals(supabaseAdmin, owner, periodStart, periodEnd);

            // 3) Upsert statement row.
            const { data: stmt, error: stmtErr } = await supabaseAdmin
              .from("owner_statements")
              .upsert(
                {
                  org_id: owner.org_id,
                  owner_id: owner.id,
                  period_start: periodStart,
                  period_end: periodEnd,
                  gross_income: totals.gross_income,
                  expenses_total: totals.expenses_total,
                  management_fee: totals.management_fee,
                  net_payout: totals.net_payout,
                  currency: "SAR",
                  status: "issued",
                  issued_at: new Date().toISOString(),
                } as never,
                { onConflict: "owner_id,period_start" },
              )
              .select("id")
              .single();
            if (stmtErr) throw stmtErr;

            // 4) Render PDF.
            const pdfBytes = await renderStatementPdf({
              owner_name: owner.full_name ?? "",
              period_start: periodStart,
              period_end: periodEnd,
              ...totals,
            });

            // 5) Upload to storage.
            const path = `${owner.org_id}/${owner.id}/${periodStart}_${periodEnd}.pdf`;
            const { error: upErr } = await supabaseAdmin.storage
              .from("owner-statements")
              .upload(path, pdfBytes, { contentType: "application/pdf", upsert: true });
            if (upErr) throw upErr;

            // 6) Long-lived signed URL (30 days) and record it.
            const { data: signed } = await supabaseAdmin.storage
              .from("owner-statements")
              .createSignedUrl(path, 60 * 60 * 24 * 30);

            await supabaseAdmin
              .from("owner_statements")
              .update({ pdf_url: signed?.signedUrl ?? null } as never)
              .eq("id", stmt!.id);

            results.push({ owner_id: owner.id, status: "ok" });
          } catch (err) {
            results.push({ owner_id: owner.id, status: "error", error: (err as Error).message });
          }
        }

        return json({ processed: results.length, results });
      },
    },
  },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function defaultPeriodStart() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth(); // 0-based; previous month
  const first = new Date(Date.UTC(y, m - 1, 1));
  return first.toISOString().slice(0, 10);
}

function defaultPeriodEnd() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const last = new Date(Date.UTC(y, m, 0));
  return last.toISOString().slice(0, 10);
}

// ---------------- Aggregation ----------------

type Totals = {
  gross_income: number;
  expenses_total: number;
  management_fee: number;
  net_payout: number;
};

async function aggregateOwnerTotals(
  admin: any,
  owner: { id: string; org_id: string },
  periodStart: string,
  periodEnd: string,
): Promise<Totals> {
  // Contracts belonging to this owner
  const { data: contracts } = await admin
    .from("contracts")
    .select("id")
    .eq("owner_id", owner.id)
    .is("deleted_at", null);
  const contractIds = ((contracts ?? []) as Array<{ id: string }>).map((c) => c.id);

  let gross_income = 0;
  if (contractIds.length > 0) {
    const { data: payments } = await admin
      .from("payments")
      .select("amount, paid_at, status")
      .in("contract_id", contractIds)
      .gte("paid_at", periodStart)
      .lte("paid_at", periodEnd)
      .is("deleted_at", null);
    gross_income = ((payments ?? []) as Array<{ amount: number; status: string }>)
      .filter((p) => p.status === "paid" || p.status === "completed")
      .reduce((s: number, p) => s + Number(p.amount ?? 0), 0);
  }

  // Expenses tied to the owner
  const { data: expenses } = await admin
    .from("expenses")
    .select("amount, expense_date")
    .eq("owner_id", owner.id)
    .gte("expense_date", periodStart)
    .lte("expense_date", periodEnd)
    .is("deleted_at", null);
  const expenses_total = ((expenses ?? []) as Array<{ amount: number }>).reduce(
    (s: number, e) => s + Number(e.amount ?? 0),
    0,
  );

  // Simple 5% management fee on gross (can be moved to owner settings later).
  const management_fee = Math.round(gross_income * 0.05 * 100) / 100;
  const net_payout = Math.round((gross_income - expenses_total - management_fee) * 100) / 100;

  return { gross_income, expenses_total, management_fee, net_payout };
}

// ---------------- PDF rendering ----------------

async function renderStatementPdf(input: {
  owner_name: string;
  period_start: string;
  period_end: string;
  gross_income: number;
  expenses_total: number;
  management_fee: number;
  net_payout: number;
}) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const draw = (text: string, x: number, y: number, size = 12, f = font) =>
    page.drawText(text, { x, y, size, font: f });

  draw("HBSpro — Owner Statement", 50, 780, 20, bold);
  draw(`Owner: ${input.owner_name}`, 50, 745, 12);
  draw(`Period: ${input.period_start}  to  ${input.period_end}`, 50, 728, 12);

  const rows: Array<[string, number]> = [
    ["Gross income", input.gross_income],
    ["Expenses", -input.expenses_total],
    ["Management fee (5%)", -input.management_fee],
    ["Net payout", input.net_payout],
  ];
  let y = 680;
  for (const [label, value] of rows) {
    draw(label, 60, y, 12);
    draw(`${value.toLocaleString("en")} SAR`, 400, y, 12, bold);
    y -= 24;
  }

  draw(
    "This statement was generated automatically. Contact the property manager for questions.",
    50,
    100,
    9,
  );
  draw(`Issued: ${new Date().toISOString().slice(0, 19).replace("T", " ")} UTC`, 50, 85, 9);

  return await pdf.save();
}
