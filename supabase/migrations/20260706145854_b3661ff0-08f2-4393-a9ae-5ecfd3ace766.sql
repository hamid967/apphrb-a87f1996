
-- Helper: SECURITY DEFINER writer so triggers can insert into audit_log
CREATE OR REPLACE FUNCTION public.log_audit(
  _entity text,
  _entity_id uuid,
  _action text,
  _diff jsonb DEFAULT NULL,
  _actor uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_log(entity, entity_id, actor, action, diff)
  VALUES (_entity, _entity_id, COALESCE(_actor, auth.uid()), _action, _diff);
END;
$$;

REVOKE ALL ON FUNCTION public.log_audit(text, uuid, text, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_audit(text, uuid, text, jsonb, uuid) TO authenticated, service_role;

-- Trigger: auctions lifecycle
CREATE OR REPLACE FUNCTION public.tg_audit_auctions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_diff jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_diff := jsonb_build_object(
      'org_id', NEW.org_id,
      'title_ar', NEW.title_ar,
      'title_en', NEW.title_en,
      'starting_price', NEW.starting_price,
      'reserve_price', NEW.reserve_price,
      'min_increment', NEW.min_increment,
      'start_at', NEW.start_at,
      'end_at', NEW.end_at,
      'status', NEW.status
    );
    PERFORM public.log_audit('auctions', NEW.id, v_action, v_diff, NEW.created_by);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- status transition
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      v_action := CASE NEW.status
        WHEN 'scheduled' THEN 'publish'
        WHEN 'live' THEN 'activate'
        WHEN 'ended' THEN 'finalize'
        WHEN 'cancelled' THEN 'cancel'
        ELSE 'status_change'
      END;
      v_diff := jsonb_build_object(
        'org_id', NEW.org_id,
        'from', OLD.status,
        'to', NEW.status,
        'winner_user_id', NEW.winner_user_id,
        'current_high', NEW.current_high
      );
      PERFORM public.log_audit('auctions', NEW.id, v_action, v_diff);
    END IF;
    -- winner assigned separately
    IF NEW.winner_user_id IS DISTINCT FROM OLD.winner_user_id AND NEW.winner_user_id IS NOT NULL THEN
      PERFORM public.log_audit(
        'auctions', NEW.id, 'win',
        jsonb_build_object(
          'org_id', NEW.org_id,
          'winner_user_id', NEW.winner_user_id,
          'winning_amount', NEW.current_high
        )
      );
    END IF;
    -- rules edit (price/increment/time/title)
    IF NEW.status IN ('draft','scheduled') AND (
      NEW.reserve_price IS DISTINCT FROM OLD.reserve_price OR
      NEW.min_increment IS DISTINCT FROM OLD.min_increment OR
      NEW.start_at IS DISTINCT FROM OLD.start_at OR
      NEW.end_at IS DISTINCT FROM OLD.end_at OR
      NEW.title_ar IS DISTINCT FROM OLD.title_ar OR
      NEW.title_en IS DISTINCT FROM OLD.title_en
    ) THEN
      PERFORM public.log_audit(
        'auctions', NEW.id, 'update',
        jsonb_build_object(
          'org_id', NEW.org_id,
          'before', jsonb_build_object(
            'reserve_price', OLD.reserve_price,
            'min_increment', OLD.min_increment,
            'start_at', OLD.start_at,
            'end_at', OLD.end_at,
            'title_ar', OLD.title_ar,
            'title_en', OLD.title_en
          ),
          'after', jsonb_build_object(
            'reserve_price', NEW.reserve_price,
            'min_increment', NEW.min_increment,
            'start_at', NEW.start_at,
            'end_at', NEW.end_at,
            'title_ar', NEW.title_ar,
            'title_en', NEW.title_en
          )
        )
      );
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS audit_auctions_trg ON public.auctions;
CREATE TRIGGER audit_auctions_trg
AFTER INSERT OR UPDATE ON public.auctions
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_auctions();

-- Trigger: bids
CREATE OR REPLACE FUNCTION public.tg_audit_auction_bids()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT org_id INTO v_org FROM public.auctions WHERE id = NEW.auction_id;
  PERFORM public.log_audit(
    'auction_bids', NEW.id, 'bid',
    jsonb_build_object(
      'org_id', v_org,
      'auction_id', NEW.auction_id,
      'bidder_id', NEW.bidder_id,
      'amount', NEW.amount,
      'placed_at', NEW.placed_at
    ),
    NEW.bidder_id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_auction_bids_trg ON public.auction_bids;
CREATE TRIGGER audit_auction_bids_trg
AFTER INSERT ON public.auction_bids
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_auction_bids();

-- Allow org members to read their org's auction-related audit entries
CREATE POLICY "audit auctions org members read"
ON public.audit_log
FOR SELECT
TO authenticated
USING (
  entity IN ('auctions', 'auction_bids')
  AND (diff ->> 'org_id') IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.org_id = ((diff ->> 'org_id')::uuid)
      AND om.user_id = auth.uid()
  )
);
