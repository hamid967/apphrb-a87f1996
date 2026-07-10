
CREATE TYPE public.invoice_note_type AS ENUM ('credit', 'debit');

CREATE TABLE public.invoice_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  number text NOT NULL,
  note_type public.invoice_note_type NOT NULL,
  reason text NOT NULL,
  issue_date date NOT NULL DEFAULT (now())::date,
  subtotal numeric NOT NULL DEFAULT 0,
  vat_rate numeric NOT NULL DEFAULT 15,
  vat_amount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'SAR',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, number)
);

CREATE INDEX idx_invoice_notes_invoice ON public.invoice_notes(invoice_id);
CREATE INDEX idx_invoice_notes_org ON public.invoice_notes(org_id, issue_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_notes TO authenticated;
GRANT ALL ON public.invoice_notes TO service_role;

ALTER TABLE public.invoice_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_notes: members read" ON public.invoice_notes
  FOR SELECT USING (is_org_member(org_id, auth.uid()));
CREATE POLICY "invoice_notes: staff insert" ON public.invoice_notes
  FOR INSERT WITH CHECK (has_org_role(org_id, auth.uid(), ARRAY['owner'::org_role,'admin'::org_role,'agent'::org_role]));
CREATE POLICY "invoice_notes: staff update" ON public.invoice_notes
  FOR UPDATE USING (has_org_role(org_id, auth.uid(), ARRAY['owner'::org_role,'admin'::org_role,'agent'::org_role]))
  WITH CHECK (has_org_role(org_id, auth.uid(), ARRAY['owner'::org_role,'admin'::org_role,'agent'::org_role]));
CREATE POLICY "invoice_notes: admin delete" ON public.invoice_notes
  FOR DELETE USING (has_org_role(org_id, auth.uid(), ARRAY['owner'::org_role,'admin'::org_role]));

CREATE TRIGGER trg_invoice_notes_updated_at
  BEFORE UPDATE ON public.invoice_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_audit_invoice_notes
  AFTER INSERT OR UPDATE OR DELETE ON public.invoice_notes
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_row();
