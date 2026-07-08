CREATE POLICY "audit expense owner read"
ON public.audit_log
FOR SELECT
TO authenticated
USING (
  entity = 'expense'
  AND EXISTS (
    SELECT 1 FROM public.expenses e
    WHERE e.id = audit_log.entity_id AND e.user_id = auth.uid()
  )
);