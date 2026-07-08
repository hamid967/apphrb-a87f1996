CREATE OR REPLACE FUNCTION public.submit_rental_application(
  _listing_id uuid,
  _applicant_name text,
  _email text,
  _phone text,
  _monthly_income numeric DEFAULT NULL,
  _employer text DEFAULT NULL,
  _move_in_date date DEFAULT NULL,
  _credit_check_consent boolean DEFAULT false,
  _national_id text DEFAULT NULL,
  _id_type text DEFAULT NULL,
  _employment_type text DEFAULT NULL,
  _dependents smallint DEFAULT NULL,
  _current_rent numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  listing_row public.listings%ROWTYPE;
  new_id uuid;
BEGIN
  SELECT * INTO listing_row FROM public.listings
    WHERE id = _listing_id AND published = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing not found or not published';
  END IF;

  IF _id_type IS NOT NULL AND _id_type NOT IN ('national','iqama','passport') THEN
    RAISE EXCEPTION 'Invalid id_type';
  END IF;
  IF _employment_type IS NOT NULL AND _employment_type NOT IN ('private','government','self','student','unemployed') THEN
    RAISE EXCEPTION 'Invalid employment_type';
  END IF;

  INSERT INTO public.rental_applications (
    org_id, listing_id, applicant_name, email, phone,
    monthly_income, employer, move_in_date, credit_check_consent,
    national_id, id_type, employment_type, dependents, current_rent,
    status
  ) VALUES (
    listing_row.org_id, _listing_id, trim(_applicant_name), lower(trim(_email)), _phone,
    _monthly_income, _employer, _move_in_date, COALESCE(_credit_check_consent, false),
    _national_id, _id_type, _employment_type, _dependents, _current_rent,
    'new'
  ) RETURNING id INTO new_id;

  RETURN jsonb_build_object('id', new_id);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_rental_application(uuid,text,text,text,numeric,text,date,boolean,text,text,text,smallint,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_rental_application(uuid,text,text,text,numeric,text,date,boolean,text,text,text,smallint,numeric) TO anon, authenticated;