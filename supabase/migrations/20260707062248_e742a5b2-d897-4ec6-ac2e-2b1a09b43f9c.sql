
-- Audit trigger for rental_applications and read policy for org members
CREATE OR REPLACE FUNCTION public.tg_audit_rental_applications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_diff jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_diff := jsonb_build_object(
      'org_id', NEW.org_id,
      'listing_id', NEW.listing_id,
      'status', NEW.status,
      'score', NEW.score
    );
    INSERT INTO public.audit_log(entity, entity_id, actor, action, diff)
    VALUES ('rental_applications', NEW.id, auth.uid(), 'insert', v_diff);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_diff := jsonb_build_object('org_id', NEW.org_id);
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      v_diff := v_diff || jsonb_build_object('status', jsonb_build_object('from', OLD.status, 'to', NEW.status));
    END IF;
    IF NEW.notes IS DISTINCT FROM OLD.notes THEN
      v_diff := v_diff || jsonb_build_object('notes_changed', true);
    END IF;
    IF NEW.score IS DISTINCT FROM OLD.score THEN
      v_diff := v_diff || jsonb_build_object('score', jsonb_build_object('from', OLD.score, 'to', NEW.score));
    END IF;
    IF NEW.converted_contract_id IS DISTINCT FROM OLD.converted_contract_id THEN
      v_diff := v_diff || jsonb_build_object('converted_contract_id', NEW.converted_contract_id);
    END IF;
    IF NEW.documents IS DISTINCT FROM OLD.documents THEN
      v_diff := v_diff || jsonb_build_object(
        'documents_count', jsonb_build_object(
          'from', COALESCE(jsonb_array_length(OLD.documents), 0),
          'to',   COALESCE(jsonb_array_length(NEW.documents), 0)
        )
      );
    END IF;
    -- Only log when a meaningful field changed (more than just org_id)
    IF jsonb_object_keys(v_diff) IS NOT NULL AND (SELECT count(*) FROM jsonb_object_keys(v_diff)) > 1 THEN
      INSERT INTO public.audit_log(entity, entity_id, actor, action, diff)
      VALUES ('rental_applications', NEW.id, auth.uid(), 'update', v_diff);
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_rental_applications ON public.rental_applications;
CREATE TRIGGER audit_rental_applications
  AFTER INSERT OR UPDATE ON public.rental_applications
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_rental_applications();

-- Allow org members to read audit rows for their org's rental applications
CREATE POLICY "audit rental_applications org members read"
ON public.audit_log
FOR SELECT
TO authenticated
USING (
  entity = 'rental_applications'
  AND (diff ->> 'org_id') IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.org_id = ((diff ->> 'org_id')::uuid)
      AND om.user_id = auth.uid()
  )
);
