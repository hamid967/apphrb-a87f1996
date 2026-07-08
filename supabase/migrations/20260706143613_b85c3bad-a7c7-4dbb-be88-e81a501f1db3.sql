
CREATE TABLE IF NOT EXISTS public.auctions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  title_ar text NOT NULL,
  title_en text NOT NULL,
  description text,
  starting_price numeric(14,2) NOT NULL CHECK (starting_price >= 0),
  reserve_price numeric(14,2),
  min_increment numeric(14,2) NOT NULL DEFAULT 1000 CHECK (min_increment > 0),
  currency text NOT NULL DEFAULT 'SAR',
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','live','ended','cancelled')),
  current_high numeric(14,2),
  winner_bid_id uuid,
  winner_user_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auctions_time_valid CHECK (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS idx_auctions_org_status ON public.auctions(org_id, status);
CREATE INDEX IF NOT EXISTS idx_auctions_status_end_at ON public.auctions(status, end_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.auctions TO authenticated;
GRANT ALL ON public.auctions TO service_role;

ALTER TABLE public.auctions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auctions public read" ON public.auctions;
CREATE POLICY "auctions public read" ON public.auctions FOR SELECT TO authenticated
  USING (status IN ('scheduled','live','ended'));

DROP POLICY IF EXISTS "auctions org manage" ON public.auctions;
CREATE POLICY "auctions org manage" ON public.auctions FOR ALL TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']::org_role[]))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), ARRAY['owner','admin']::org_role[]));

CREATE TABLE IF NOT EXISTS public.auction_bids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id uuid NOT NULL REFERENCES public.auctions(id) ON DELETE CASCADE,
  bidder_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  placed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auction_bids_auction_amount ON public.auction_bids(auction_id, amount DESC);
CREATE INDEX IF NOT EXISTS idx_auction_bids_bidder ON public.auction_bids(bidder_id, placed_at DESC);

GRANT SELECT, INSERT ON public.auction_bids TO authenticated;
GRANT ALL ON public.auction_bids TO service_role;

ALTER TABLE public.auction_bids ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bids read on published" ON public.auction_bids;
CREATE POLICY "bids read on published" ON public.auction_bids FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.auctions a WHERE a.id = auction_id AND a.status IN ('scheduled','live','ended'))
  );

DROP POLICY IF EXISTS "bids org read" ON public.auction_bids;
CREATE POLICY "bids org read" ON public.auction_bids FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.auctions a WHERE a.id = auction_id
      AND public.has_org_role(a.org_id, auth.uid(), ARRAY['owner','admin']::org_role[]))
  );

DROP POLICY IF EXISTS "bids self insert" ON public.auction_bids;
CREATE POLICY "bids self insert" ON public.auction_bids FOR INSERT TO authenticated
  WITH CHECK (bidder_id = auth.uid());

CREATE OR REPLACE FUNCTION public.validate_and_apply_bid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE a public.auctions%ROWTYPE; min_next numeric(14,2);
BEGIN
  SELECT * INTO a FROM public.auctions WHERE id = NEW.auction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Auction not found'; END IF;
  IF a.status = 'scheduled' AND now() >= a.start_at AND now() < a.end_at THEN
    UPDATE public.auctions SET status = 'live', updated_at = now() WHERE id = a.id;
    a.status := 'live';
  END IF;
  IF a.status <> 'live' THEN RAISE EXCEPTION 'Auction is not live (status=%)', a.status; END IF;
  IF now() >= a.end_at THEN RAISE EXCEPTION 'Auction has ended'; END IF;
  IF NEW.bidder_id = a.created_by THEN RAISE EXCEPTION 'Owner cannot bid on their own auction'; END IF;
  min_next := COALESCE(a.current_high, a.starting_price - a.min_increment) + a.min_increment;
  IF NEW.amount < min_next THEN RAISE EXCEPTION 'Bid must be at least %', min_next; END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_validate_bid ON public.auction_bids;
CREATE TRIGGER trg_validate_bid BEFORE INSERT ON public.auction_bids
  FOR EACH ROW EXECUTE FUNCTION public.validate_and_apply_bid();

CREATE OR REPLACE FUNCTION public.update_auction_high()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.auctions SET current_high = NEW.amount, updated_at = now()
   WHERE id = NEW.auction_id AND (current_high IS NULL OR NEW.amount > current_high);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_update_auction_high ON public.auction_bids;
CREATE TRIGGER trg_update_auction_high AFTER INSERT ON public.auction_bids
  FOR EACH ROW EXECUTE FUNCTION public.update_auction_high();

CREATE OR REPLACE FUNCTION public.finalize_expired_auctions()
RETURNS TABLE(auction_id uuid, winner_user_id uuid, winning_amount numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE rec record; top_bid public.auction_bids%ROWTYPE;
BEGIN
  FOR rec IN SELECT * FROM public.auctions WHERE status IN ('scheduled','live') AND end_at <= now() LOOP
    SELECT * INTO top_bid FROM public.auction_bids
     WHERE auction_bids.auction_id = rec.id ORDER BY amount DESC, placed_at ASC LIMIT 1;
    IF FOUND AND (rec.reserve_price IS NULL OR top_bid.amount >= rec.reserve_price) THEN
      UPDATE public.auctions SET status='ended', winner_bid_id=top_bid.id,
        winner_user_id=top_bid.bidder_id, current_high=top_bid.amount, updated_at=now()
       WHERE id = rec.id;
      auction_id := rec.id; winner_user_id := top_bid.bidder_id; winning_amount := top_bid.amount;
      RETURN NEXT;
    ELSE
      UPDATE public.auctions SET status='ended', updated_at=now() WHERE id = rec.id;
    END IF;
  END LOOP;
END; $$;

REVOKE EXECUTE ON FUNCTION public.finalize_expired_auctions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_expired_auctions() TO service_role;

CREATE OR REPLACE FUNCTION public.activate_scheduled_auctions()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  UPDATE public.auctions SET status='live', updated_at=now()
   WHERE status='scheduled' AND start_at <= now() AND end_at > now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END; $$;

REVOKE EXECUTE ON FUNCTION public.activate_scheduled_auctions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_scheduled_auctions() TO service_role;

DROP TRIGGER IF EXISTS trg_auctions_updated ON public.auctions;
CREATE TRIGGER trg_auctions_updated BEFORE UPDATE ON public.auctions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.auction_bids REPLICA IDENTITY FULL;
ALTER TABLE public.auctions REPLICA IDENTITY FULL;

DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.auction_bids;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.auctions;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
