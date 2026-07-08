import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();

export const listAuctions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { scope?: "mine" | "public"; orgId?: string; status?: string }) =>
    z
      .object({
        scope: z.enum(["mine", "public"]).optional(),
        orgId: uuid.optional(),
        status: z.string().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("auctions")
      .select(
        "id,org_id,property_id,title_ar,title_en,starting_price,current_high,min_increment,currency,start_at,end_at,status,winner_user_id,created_by,created_at",
      )
      .order("start_at", { ascending: false })
      .limit(200);
    if (data.scope === "mine" && data.orgId) q = q.eq("org_id", data.orgId);
    else q = q.in("status", ["scheduled", "live", "ended"]);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getAuction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: auction, error } = await supabase
      .from("auctions")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!auction) throw new Error("Auction not found");
    const { data: bids } = await supabase
      .from("auction_bids")
      .select("id,amount,placed_at,bidder_id")
      .eq("auction_id", data.id)
      .order("amount", { ascending: false })
      .limit(50);
    return { auction, bids: bids ?? [] };
  });

export const listAuctionBids = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { auctionId: string; limit?: number }) =>
    z.object({ auctionId: uuid, limit: z.number().int().min(1).max(1000).optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("auction_bids")
      .select("id,amount,placed_at,bidder_id")
      .eq("auction_id", data.auctionId)
      .order("placed_at", { ascending: true })
      .limit(data.limit ?? 500);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createAuction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      orgId: string;
      propertyId?: string | null;
      title_ar: string;
      title_en: string;
      description?: string | null;
      starting_price: number;
      reserve_price?: number | null;
      min_increment: number;
      start_at: string;
      end_at: string;
    }) =>
      z
        .object({
          orgId: uuid,
          propertyId: uuid.nullable().optional(),
          title_ar: z.string().min(2).max(200),
          title_en: z.string().min(2).max(200),
          description: z.string().max(2000).nullable().optional(),
          starting_price: z.number().nonnegative(),
          reserve_price: z.number().nonnegative().nullable().optional(),
          min_increment: z.number().positive(),
          start_at: z.string(),
          end_at: z.string(),
        })
        .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (new Date(data.end_at) <= new Date(data.start_at))
      throw new Error("End must be after start");
    const { data: row, error } = await supabase
      .from("auctions")
      .insert({
        org_id: data.orgId,
        property_id: data.propertyId ?? null,
        title_ar: data.title_ar,
        title_en: data.title_en,
        description: data.description ?? null,
        starting_price: data.starting_price,
        reserve_price: data.reserve_price ?? null,
        min_increment: data.min_increment,
        start_at: data.start_at,
        end_at: data.end_at,
        status: "draft",
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const publishAuction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const nowIso = new Date().toISOString();
    // If start_at is already in the past, mark live directly.
    const { data: a, error: e1 } = await supabase
      .from("auctions")
      .select("start_at,end_at,status")
      .eq("id", data.id)
      .single();
    if (e1) throw new Error(e1.message);
    if (a.status !== "draft") throw new Error("Only drafts can be published");
    const next = new Date(a.start_at) <= new Date() ? "live" : "scheduled";
    const { error } = await supabase.from("auctions").update({ status: next }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { status: next, at: nowIso };
  });

export const cancelAuction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("auctions")
      .update({ status: "cancelled" })
      .eq("id", data.id)
      .in("status", ["draft", "scheduled", "live"]);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateAuctionRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      id: string;
      reserve_price?: number | null;
      min_increment?: number;
      start_at?: string;
      end_at?: string;
      title_ar?: string;
      title_en?: string;
      description?: string | null;
    }) =>
      z
        .object({
          id: uuid,
          reserve_price: z.number().nonnegative().nullable().optional(),
          min_increment: z.number().positive().optional(),
          start_at: z.string().optional(),
          end_at: z.string().optional(),
          title_ar: z.string().min(2).max(200).optional(),
          title_en: z.string().min(2).max(200).optional(),
          description: z.string().max(2000).nullable().optional(),
        })
        .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: cur, error: e0 } = await supabase
      .from("auctions")
      .select("status,start_at,end_at")
      .eq("id", data.id)
      .single();
    if (e0) throw new Error(e0.message);
    if (!["draft", "scheduled"].includes(cur.status)) {
      throw new Error("لا يمكن تعديل مزاد بعد بدايته");
    }
    const patch: Partial<{
      reserve_price: number | null;
      min_increment: number;
      start_at: string;
      end_at: string;
      title_ar: string;
      title_en: string;
      description: string | null;
    }> = {};
    if (data.reserve_price !== undefined) patch.reserve_price = data.reserve_price;
    if (data.min_increment !== undefined) patch.min_increment = data.min_increment;
    if (data.start_at !== undefined) patch.start_at = data.start_at;
    if (data.end_at !== undefined) patch.end_at = data.end_at;
    if (data.title_ar !== undefined) patch.title_ar = data.title_ar;
    if (data.title_en !== undefined) patch.title_en = data.title_en;
    if (data.description !== undefined) patch.description = data.description;
    const startAt = patch.start_at ?? cur.start_at;
    const endAt = patch.end_at ?? cur.end_at;
    if (new Date(endAt) <= new Date(startAt)) throw new Error("End must be after start");
    const { error } = await supabase.from("auctions").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const placeBid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { auctionId: string; amount: number }) =>
    z.object({ auctionId: uuid, amount: z.number().positive() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("auction_bids")
      .insert({ auction_id: data.auctionId, bidder_id: userId, amount: data.amount })
      .select("id,amount,placed_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// ─────────────────────────────────────────────────────────────────────
// Analytics
// ─────────────────────────────────────────────────────────────────────

type AuctionAnalytics = {
  filters: {
    orgId: string;
    from: string | null;
    to: string | null;
    status: string | null;
    bidderId: string | null;
  };
  totals: {
    total: number;
    draft: number;
    scheduled: number;
    live: number;
    ended: number;
    finalized: number;
    cancelled: number;
    total_bids: number;
    avg_final_price: number;
    success_rate: number; // finalized / (finalized+cancelled+ended)
  };
  by_day: { day: string; count: number; bids: number; max_amount: number; total_amount: number }[];
  by_status: { status: string; count: number }[];
  top_bidders: { bidder_id: string; bids: number; total_amount: number }[];
};

export const getAuctionsAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      orgId: string;
      from?: string | null;
      to?: string | null;
      status?: string | null;
      bidderId?: string | null;
    }) =>
      z
        .object({
          orgId: uuid,
          from: z.string().nullable().optional(),
          to: z.string().nullable().optional(),
          status: z.string().nullable().optional(),
          bidderId: z.string().uuid().nullable().optional(),
        })
        .parse(i),
  )
  .handler(async ({ data, context }): Promise<AuctionAnalytics> => {
    const { supabase } = context;

    let aq = supabase
      .from("auctions")
      .select("id,status,starting_price,current_high,winner_user_id,start_at,end_at,created_at")
      .eq("org_id", data.orgId)
      .limit(5000);
    if (data.from) aq = aq.gte("start_at", data.from);
    if (data.to) aq = aq.lte("start_at", data.to);
    if (data.status) aq = aq.eq("status", data.status);

    const { data: auctions, error: e1 } = await aq;
    if (e1) throw new Error(e1.message);
    let rows = auctions ?? [];
    let ids = rows.map((r) => r.id);

    let bq = ids.length
      ? supabase
          .from("auction_bids")
          .select("id,amount,placed_at,bidder_id,auction_id")
          .in("auction_id", ids)
          .limit(50000)
      : null;
    if (bq && data.bidderId) bq = bq.eq("bidder_id", data.bidderId);
    const { data: bids, error: e2 } = bq ? await bq : { data: [], error: null as null };
    if (e2) throw new Error(e2.message);
    const bidRows = bids ?? [];

    // When filtering by bidder, narrow auctions to only those the bidder participated in.
    if (data.bidderId) {
      const touched = new Set(bidRows.map((b) => b.auction_id));
      rows = rows.filter((r) => touched.has(r.id));
      ids = rows.map((r) => r.id);
    }

    const totals = {
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
      const s = r.status as keyof typeof totals;
      if (s in totals) (totals as unknown as Record<string, number>)[s]++;
      if (r.status === "finalized" && r.current_high != null) {
        finalSum += Number(r.current_high);
        finalCount++;
      }
    }
    totals.avg_final_price = finalCount ? Math.round(finalSum / finalCount) : 0;
    const decided = totals.finalized + totals.cancelled + totals.ended;
    totals.success_rate = decided ? Math.round((totals.finalized / decided) * 100) : 0;

    // by_day (based on start_at date)
    const dayMap = new Map<
      string,
      { count: number; bids: number; max_amount: number; total_amount: number }
    >();
    for (const r of rows) {
      const day = String(r.start_at ?? r.created_at ?? "").slice(0, 10);
      if (!day) continue;
      const cur = dayMap.get(day) ?? { count: 0, bids: 0, max_amount: 0, total_amount: 0 };
      cur.count++;
      dayMap.set(day, cur);
    }
    const auctionDay = new Map(
      rows.map((r) => [r.id, String(r.start_at ?? r.created_at ?? "").slice(0, 10)]),
    );
    for (const b of bidRows) {
      const day = auctionDay.get(b.auction_id);
      if (!day) continue;
      const cur = dayMap.get(day) ?? { count: 0, bids: 0, max_amount: 0, total_amount: 0 };
      cur.bids++;
      const amt = Number(b.amount ?? 0);
      cur.total_amount += amt;
      if (amt > cur.max_amount) cur.max_amount = amt;
      dayMap.set(day, cur);
    }
    const by_day = Array.from(dayMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, v]) => ({
        day,
        count: v.count,
        bids: v.bids,
        max_amount: v.max_amount,
        total_amount: v.total_amount,
      }));

    const by_status = (["draft", "scheduled", "live", "ended", "finalized", "cancelled"] as const)
      .map((s) => ({ status: s, count: (totals as unknown as Record<string, number>)[s] ?? 0 }))
      .filter((x) => x.count > 0);

    // Top bidders
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

    return {
      filters: {
        orgId: data.orgId,
        from: data.from ?? null,
        to: data.to ?? null,
        status: data.status ?? null,
        bidderId: data.bidderId ?? null,
      },
      totals,
      by_day,
      by_status,
      top_bidders,
    };
  });
