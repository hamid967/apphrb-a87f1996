DROP POLICY IF EXISTS "profiles self update" ON public.profiles;

CREATE POLICY "profiles self update"
ON public.profiles
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND NOT (owner_id IS DISTINCT FROM (SELECT p.owner_id FROM public.profiles p WHERE p.id = auth.uid()))
  AND NOT (tenant_id IS DISTINCT FROM (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid()))
  AND NOT (approval_status IS DISTINCT FROM (SELECT p.approval_status FROM public.profiles p WHERE p.id = auth.uid()))
  AND NOT (permissions IS DISTINCT FROM (SELECT p.permissions FROM public.profiles p WHERE p.id = auth.uid()))
  AND NOT (approved_by IS DISTINCT FROM (SELECT p.approved_by FROM public.profiles p WHERE p.id = auth.uid()))
  AND NOT (approved_at IS DISTINCT FROM (SELECT p.approved_at FROM public.profiles p WHERE p.id = auth.uid()))
  AND NOT (trial_ends_at IS DISTINCT FROM (SELECT p.trial_ends_at FROM public.profiles p WHERE p.id = auth.uid()))
  AND NOT (manager_id IS DISTINCT FROM (SELECT p.manager_id FROM public.profiles p WHERE p.id = auth.uid()))
);