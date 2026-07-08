import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyApiKey, logUsage, jsonResponse, requireScope } from "./api-auth.server";
import { z } from "zod";

type ListOpts = {
  table: string;
  select: string;
  orderCol?: string;
  filterDeleted?: boolean;
};

export async function apiList(request: Request, opts: ListOpts) {
  const { table, select, orderCol = "created_at", filterDeleted = false } = opts;
  const endpoint = `/api/public/v1/${table}`;
  const auth = await verifyApiKey(request, endpoint);
  if (!auth.ok) return jsonResponse({ error: auth.message }, auth.status);
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50), 1), 200);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);
  let q = supabaseAdmin
    .from(table as never)
    .select(select, { count: "exact" })
    .eq("org_id", auth.orgId)
    .order(orderCol, { ascending: false })
    .range(offset, offset + limit - 1);
  if (filterDeleted) q = q.is("deleted_at", null);
  const { data, error, count } = await q;
  if (error) {
    await logUsage(auth.keyId, auth.orgId, endpoint, 500, request);
    return jsonResponse({ error: error.message }, 500);
  }
  await logUsage(auth.keyId, auth.orgId, endpoint, 200, request);
  return jsonResponse({ data, limit, offset, total: count ?? 0 });
}

export async function apiGetById(request: Request, opts: ListOpts, id: string) {
  const { table, select, filterDeleted = false } = opts;
  const endpoint = `/api/public/v1/${table}/${id}`;
  const auth = await verifyApiKey(request, endpoint);
  if (!auth.ok) return jsonResponse({ error: auth.message }, auth.status);
  let q = supabaseAdmin
    .from(table as never)
    .select(select)
    .eq("org_id", auth.orgId)
    .eq("id", id);
  if (filterDeleted) q = q.is("deleted_at", null);
  const { data, error } = await q.maybeSingle();
  if (error) {
    await logUsage(auth.keyId, auth.orgId, endpoint, 500, request);
    return jsonResponse({ error: error.message }, 500);
  }
  if (!data) {
    await logUsage(auth.keyId, auth.orgId, endpoint, 404, request);
    return jsonResponse({ error: "Not found" }, 404);
  }
  await logUsage(auth.keyId, auth.orgId, endpoint, 200, request);
  return jsonResponse({ data });
}

export const RESOURCE = {
  properties: {
    table: "properties",
    select:
      "id,title_ar,title_en,property_type,listing_type,status,price,currency,city,address,bedrooms,bathrooms,area_sqm,is_public,created_at,updated_at",
  },
  units: {
    table: "units",
    select:
      "id,building_id,floor_id,code,type,status,rent_amount,sale_price,currency_code,bedrooms,bathrooms,area,created_at,updated_at",
    filterDeleted: true,
  },
  contracts: {
    table: "contracts",
    select:
      "id,contract_number,tenant_id,unit_id,owner_id,type,status,start_date,end_date,amount,deposit,currency_code,payment_frequency,ejar_reference,ejar_sent_at,created_at,updated_at",
    filterDeleted: true,
  },
  invoices: {
    table: "invoices",
    select:
      "id,number,contact_id,property_id,issue_date,due_date,status,subtotal,vat_rate,vat_amount,total,currency,paid_at,created_at,updated_at",
  },
  payments: {
    table: "payments",
    select:
      "id,invoice_id,contract_id,tenant_id,method_id,bank_id,amount,currency_code,status,paid_at,reference,created_at,updated_at",
    filterDeleted: true,
  },
  auctions: {
    table: "auctions",
    select:
      "id,property_id,title_ar,title_en,description,starting_price,reserve_price,min_increment,current_high,currency,start_at,end_at,status,winner_user_id,winner_bid_id,created_at,updated_at",
  },
} as const;

export type ResourceKey = keyof typeof RESOURCE;

// Bids don't carry org_id; scope through parent auction.
export async function apiListAuctionBids(request: Request, auctionId: string) {
  const endpoint = `/api/public/v1/auctions/${auctionId}/bids`;
  const auth = await verifyApiKey(request, endpoint);
  if (!auth.ok) return jsonResponse({ error: auth.message }, auth.status);
  const { data: parent, error: eP } = await supabaseAdmin
    .from("auctions")
    .select("id")
    .eq("org_id", auth.orgId)
    .eq("id", auctionId)
    .maybeSingle();
  if (eP) {
    await logUsage(auth.keyId, auth.orgId, endpoint, 500, request);
    return jsonResponse({ error: eP.message }, 500);
  }
  if (!parent) {
    await logUsage(auth.keyId, auth.orgId, endpoint, 404, request);
    return jsonResponse({ error: "Not found" }, 404);
  }
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50), 1), 200);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);
  const { data, error, count } = await supabaseAdmin
    .from("auction_bids")
    .select("id,auction_id,amount,placed_at", { count: "exact" })
    .eq("auction_id", auctionId)
    .order("placed_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) {
    await logUsage(auth.keyId, auth.orgId, endpoint, 500, request);
    return jsonResponse({ error: error.message }, 500);
  }
  await logUsage(auth.keyId, auth.orgId, endpoint, 200, request);
  return jsonResponse({ data, limit, offset, total: count ?? 0 });
}

// ─────────────────────────────────────────────────────────────────────
// Write helpers (POST/PATCH)
// ─────────────────────────────────────────────────────────────────────

async function auditFromApi(
  entity: string,
  entityId: string,
  action: string,
  diff: Record<string, unknown>,
  keyId: string,
  orgId: string,
) {
  await supabaseAdmin.from("audit_log").insert({
    entity,
    entity_id: entityId,
    action,
    actor: null,
    diff: { ...diff, via: "api", api_key_id: keyId, org_id: orgId },
  });
}

const createAuctionSchema = z.object({
  property_id: z.string().uuid().nullable().optional(),
  title_ar: z.string().min(2).max(200),
  title_en: z.string().min(2).max(200),
  description: z.string().max(2000).nullable().optional(),
  starting_price: z.number().nonnegative(),
  reserve_price: z.number().nonnegative().nullable().optional(),
  min_increment: z.number().positive(),
  start_at: z.string().datetime(),
  end_at: z.string().datetime(),
});

export async function apiCreateAuction(request: Request) {
  const endpoint = "/api/public/v1/auctions";
  const auth = await verifyApiKey(request, endpoint);
  if (!auth.ok) return jsonResponse({ error: auth.message }, auth.status);
  if (!requireScope(auth.scopes, "auctions:write")) {
    await logUsage(auth.keyId, auth.orgId, endpoint, 403, request);
    return jsonResponse({ error: "Missing scope: auctions:write" }, 403);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }
  const parsed = createAuctionSchema.safeParse(body);
  if (!parsed.success) {
    await logUsage(auth.keyId, auth.orgId, endpoint, 400, request);
    return jsonResponse({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  }
  const d = parsed.data;
  if (new Date(d.end_at) <= new Date(d.start_at)) {
    return jsonResponse({ error: "end_at must be after start_at" }, 400);
  }
  const { data: row, error } = await supabaseAdmin
    .from("auctions")
    .insert({
      org_id: auth.orgId,
      property_id: d.property_id ?? null,
      title_ar: d.title_ar,
      title_en: d.title_en,
      description: d.description ?? null,
      starting_price: d.starting_price,
      reserve_price: d.reserve_price ?? null,
      min_increment: d.min_increment,
      start_at: d.start_at,
      end_at: d.end_at,
      status: "draft",
    })
    .select("id,status,starting_price,min_increment,start_at,end_at")
    .single();
  if (error) {
    await logUsage(auth.keyId, auth.orgId, endpoint, 500, request);
    return jsonResponse({ error: error.message }, 500);
  }
  await auditFromApi("auctions", row.id, "create", { ...d, source: "api" }, auth.keyId, auth.orgId);
  await logUsage(auth.keyId, auth.orgId, endpoint, 201, request);
  return jsonResponse({ data: row }, 201);
}

const updateAuctionSchema = z
  .object({
    reserve_price: z.number().nonnegative().nullable().optional(),
    min_increment: z.number().positive().optional(),
    start_at: z.string().datetime().optional(),
    end_at: z.string().datetime().optional(),
    title_ar: z.string().min(2).max(200).optional(),
    title_en: z.string().min(2).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Empty patch" });

export async function apiUpdateAuction(request: Request, id: string) {
  const endpoint = `/api/public/v1/auctions/${id}`;
  const auth = await verifyApiKey(request, endpoint);
  if (!auth.ok) return jsonResponse({ error: auth.message }, auth.status);
  if (!requireScope(auth.scopes, "auctions:write")) {
    await logUsage(auth.keyId, auth.orgId, endpoint, 403, request);
    return jsonResponse({ error: "Missing scope: auctions:write" }, 403);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }
  const parsed = updateAuctionSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  }
  const { data: cur, error: e0 } = await supabaseAdmin
    .from("auctions")
    .select("id,status,start_at,end_at")
    .eq("org_id", auth.orgId)
    .eq("id", id)
    .maybeSingle();
  if (e0) return jsonResponse({ error: e0.message }, 500);
  if (!cur) return jsonResponse({ error: "Not found" }, 404);
  if (!["draft", "scheduled"].includes(cur.status)) {
    return jsonResponse({ error: "Cannot update auction after it starts" }, 409);
  }
  const patch = parsed.data;
  const startAt = patch.start_at ?? cur.start_at;
  const endAt = patch.end_at ?? cur.end_at;
  if (new Date(endAt) <= new Date(startAt)) {
    return jsonResponse({ error: "end_at must be after start_at" }, 400);
  }
  const { data: updated, error } = await supabaseAdmin
    .from("auctions")
    .update(patch)
    .eq("id", id)
    .eq("org_id", auth.orgId)
    .select(
      "id,status,starting_price,reserve_price,min_increment,start_at,end_at,title_ar,title_en",
    )
    .single();
  if (error) return jsonResponse({ error: error.message }, 500);
  await auditFromApi(
    "auctions",
    id,
    "update",
    { patch: patch as Record<string, unknown>, source: "api" },
    auth.keyId,
    auth.orgId,
  );
  await logUsage(auth.keyId, auth.orgId, endpoint, 200, request);
  return jsonResponse({ data: updated });
}

const placeBidSchema = z.object({
  amount: z.number().positive(),
  bidder_id: z.string().uuid(),
});

export async function apiPlaceBid(request: Request, auctionId: string) {
  const endpoint = `/api/public/v1/auctions/${auctionId}/bids`;
  const auth = await verifyApiKey(request, endpoint);
  if (!auth.ok) return jsonResponse({ error: auth.message }, auth.status);
  if (!requireScope(auth.scopes, "auctions:bid")) {
    await logUsage(auth.keyId, auth.orgId, endpoint, 403, request);
    return jsonResponse({ error: "Missing scope: auctions:bid" }, 403);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }
  const parsed = placeBidSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  }
  const { data: parent, error: eP } = await supabaseAdmin
    .from("auctions")
    .select("id,status,current_high,starting_price,min_increment,end_at")
    .eq("org_id", auth.orgId)
    .eq("id", auctionId)
    .maybeSingle();
  if (eP) return jsonResponse({ error: eP.message }, 500);
  if (!parent) return jsonResponse({ error: "Not found" }, 404);
  if (parent.status !== "live") return jsonResponse({ error: "Auction is not live" }, 409);
  if (new Date(parent.end_at) <= new Date()) return jsonResponse({ error: "Auction ended" }, 409);
  const minNext =
    Number(parent.current_high ?? parent.starting_price) + Number(parent.min_increment);
  if (parsed.data.amount < minNext) {
    return jsonResponse({ error: `Amount must be >= ${minNext}` }, 400);
  }
  const { data: bid, error } = await supabaseAdmin
    .from("auction_bids")
    .insert({ auction_id: auctionId, bidder_id: parsed.data.bidder_id, amount: parsed.data.amount })
    .select("id,auction_id,amount,placed_at,bidder_id")
    .single();
  if (error) return jsonResponse({ error: error.message }, 500);
  await auditFromApi(
    "auction_bids",
    bid.id,
    "bid",
    {
      auction_id: auctionId,
      amount: parsed.data.amount,
      bidder_id: parsed.data.bidder_id,
      source: "api",
    },
    auth.keyId,
    auth.orgId,
  );
  await logUsage(auth.keyId, auth.orgId, endpoint, 201, request);
  return jsonResponse({ data: bid }, 201);
}

// ─────────────────────────────────────────────────────────────────────
// Analytics
// ─────────────────────────────────────────────────────────────────────

const STATUSES = ["draft", "scheduled", "live", "ended", "finalized", "cancelled"] as const;

export async function apiAuctionsAnalytics(request: Request) {
  const endpoint = "/api/public/v1/auctions/analytics";
  const auth = await verifyApiKey(request, endpoint);
  if (!auth.ok) return jsonResponse({ error: auth.message }, auth.status);
  if (!requireScope(auth.scopes, "auctions:read") && !requireScope(auth.scopes, "auctions:write")) {
    await logUsage(auth.keyId, auth.orgId, endpoint, 403, request);
    return jsonResponse({ error: "Missing scope: auctions:read" }, 403);
  }

  const url = new URL(request.url);
  const qp = url.searchParams;
  const from = qp.get("from");
  const to = qp.get("to");
  const status = qp.get("status");
  const bidderId = qp.get("bidder_id");

  const filterSchema = z.object({
    from: z.string().datetime().nullable(),
    to: z.string().datetime().nullable(),
    status: z.enum(STATUSES).nullable(),
    bidder_id: z.string().uuid().nullable(),
  });
  const parsed = filterSchema.safeParse({
    from: from || null,
    to: to || null,
    status: status || null,
    bidder_id: bidderId || null,
  });
  if (!parsed.success) {
    await logUsage(auth.keyId, auth.orgId, endpoint, 400, request);
    return jsonResponse({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  }
  const f = parsed.data;

  let aq = supabaseAdmin
    .from("auctions")
    .select("id,status,starting_price,current_high,start_at,end_at,created_at")
    .eq("org_id", auth.orgId)
    .limit(5000);
  if (f.from) aq = aq.gte("start_at", f.from);
  if (f.to) aq = aq.lte("start_at", f.to);
  if (f.status) aq = aq.eq("status", f.status);
  const { data: auctions, error: e1 } = await aq;
  if (e1) {
    await logUsage(auth.keyId, auth.orgId, endpoint, 500, request);
    return jsonResponse({ error: e1.message }, 500);
  }
  let rows = auctions ?? [];
  let ids = rows.map((r) => r.id);

  let bq = ids.length
    ? supabaseAdmin
        .from("auction_bids")
        .select("id,amount,placed_at,bidder_id,auction_id")
        .in("auction_id", ids)
        .limit(50000)
    : null;
  if (bq && f.bidder_id) bq = bq.eq("bidder_id", f.bidder_id);
  const { data: bids, error: e2 } = bq ? await bq : { data: [], error: null as null };
  if (e2) {
    await logUsage(auth.keyId, auth.orgId, endpoint, 500, request);
    return jsonResponse({ error: e2.message }, 500);
  }
  const bidRows = bids ?? [];

  if (f.bidder_id) {
    const touched = new Set(bidRows.map((b) => b.auction_id));
    rows = rows.filter((r) => touched.has(r.id));
    ids = rows.map((r) => r.id);
  }

  const totals: Record<string, number> = {
    total: rows.length,
    draft: 0,
    scheduled: 0,
    live: 0,
    ended: 0,
    finalized: 0,
    cancelled: 0,
    total_bids: bidRows.length,
    avg_final_price: 0,
    success_rate: 0,
  };
  let finalSum = 0,
    finalCount = 0;
  for (const r of rows) {
    if (r.status in totals) totals[r.status]++;
    if (r.status === "finalized" && r.current_high != null) {
      finalSum += Number(r.current_high);
      finalCount++;
    }
  }
  totals.avg_final_price = finalCount ? Math.round(finalSum / finalCount) : 0;
  const decided = totals.finalized + totals.cancelled + totals.ended;
  totals.success_rate = decided ? Math.round((totals.finalized / decided) * 100) : 0;

  const dayMap = new Map<string, { count: number; bids: number }>();
  for (const r of rows) {
    const day = String(r.start_at ?? r.created_at ?? "").slice(0, 10);
    if (!day) continue;
    const cur = dayMap.get(day) ?? { count: 0, bids: 0 };
    cur.count++;
    dayMap.set(day, cur);
  }
  const auctionDay = new Map(
    rows.map((r) => [r.id, String(r.start_at ?? r.created_at ?? "").slice(0, 10)]),
  );
  for (const b of bidRows) {
    const day = auctionDay.get(b.auction_id);
    if (!day) continue;
    const cur = dayMap.get(day) ?? { count: 0, bids: 0 };
    cur.bids++;
    dayMap.set(day, cur);
  }
  const by_day = Array.from(dayMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, v]) => ({ day, count: v.count, bids: v.bids }));

  const by_status = STATUSES.map((s) => ({ status: s, count: totals[s] ?? 0 })).filter(
    (x) => x.count > 0,
  );

  const bidderMap = new Map<string, { bids: number; total_amount: number }>();
  for (const b of bidRows) {
    if (!b.bidder_id) continue;
    const cur = bidderMap.get(b.bidder_id) ?? { bids: 0, total_amount: 0 };
    cur.bids++;
    cur.total_amount += Number(b.amount ?? 0);
    bidderMap.set(b.bidder_id, cur);
  }
  const top_bidders = Array.from(bidderMap.entries())
    .map(([bidder_id, v]) => ({ bidder_id, bids: v.bids, total_amount: v.total_amount }))
    .sort((a, b) => b.bids - a.bids)
    .slice(0, 10);

  await logUsage(auth.keyId, auth.orgId, endpoint, 200, request);
  return jsonResponse({
    filters: { from: f.from, to: f.to, status: f.status, bidder_id: f.bidder_id },
    totals,
    by_status,
    by_day,
    top_bidders,
  });
}
