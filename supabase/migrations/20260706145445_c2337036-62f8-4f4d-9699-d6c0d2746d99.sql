
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.notification_channel_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('whatsapp','sms','email')),
  enabled boolean NOT NULL DEFAULT true,
  sender_name text,
  reply_to text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, channel)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_channel_settings TO authenticated;
GRANT ALL ON public.notification_channel_settings TO service_role;

ALTER TABLE public.notification_channel_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "channel settings org read"
  ON public.notification_channel_settings FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));

CREATE POLICY "channel settings org write"
  ON public.notification_channel_settings FOR ALL TO authenticated
  USING (public.is_org_member(org_id, auth.uid()))
  WITH CHECK (public.is_org_member(org_id, auth.uid()));

CREATE TABLE public.notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  template_key text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('whatsapp','sms','email')),
  enabled boolean NOT NULL DEFAULT true,
  subject_ar text,
  subject_en text,
  body_ar text NOT NULL DEFAULT '',
  body_en text NOT NULL DEFAULT '',
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, template_key, channel)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_templates TO authenticated;
GRANT ALL ON public.notification_templates TO service_role;

ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif templates org read"
  ON public.notification_templates FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));

CREATE POLICY "notif templates org write"
  ON public.notification_templates FOR ALL TO authenticated
  USING (public.is_org_member(org_id, auth.uid()))
  WITH CHECK (public.is_org_member(org_id, auth.uid()));

CREATE TRIGGER trg_ncs_updated_at BEFORE UPDATE ON public.notification_channel_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_ntpl_updated_at BEFORE UPDATE ON public.notification_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.notification_channel_settings (org_id, channel, enabled)
SELECT o.id, c.ch, true
FROM public.organizations o
CROSS JOIN (VALUES ('whatsapp'), ('sms'), ('email')) AS c(ch)
ON CONFLICT (org_id, channel) DO NOTHING;

INSERT INTO public.notification_templates
  (org_id, template_key, channel, subject_ar, subject_en, body_ar, body_en, variables)
SELECT o.id, 'auction_winner', 'whatsapp', NULL, NULL,
  E'مبروك {{bidder_name}}! فزت بمزاد {{auction_title}} بمبلغ {{amount}} ر.س.\nيرجى إكمال الدفع قبل {{deadline}}.',
  E'Congratulations {{bidder_name}}! You won auction {{auction_title}} for {{amount}} SAR.\nPlease complete payment before {{deadline}}.',
  '["bidder_name","auction_title","amount","deadline"]'::jsonb
FROM public.organizations o
ON CONFLICT (org_id, template_key, channel) DO NOTHING;

INSERT INTO public.notification_templates
  (org_id, template_key, channel, subject_ar, subject_en, body_ar, body_en, variables)
SELECT o.id, 'auction_winner', 'sms', NULL, NULL,
  E'فزت بمزاد {{auction_title}} بمبلغ {{amount}} ر.س. الدفع قبل {{deadline}}.',
  E'You won {{auction_title}} for {{amount}} SAR. Pay before {{deadline}}.',
  '["auction_title","amount","deadline"]'::jsonb
FROM public.organizations o
ON CONFLICT (org_id, template_key, channel) DO NOTHING;

INSERT INTO public.notification_templates
  (org_id, template_key, channel, subject_ar, subject_en, body_ar, body_en, variables)
SELECT o.id, 'auction_winner', 'email',
  'تهانينا — فزت بالمزاد {{auction_title}}',
  'Congratulations — you won auction {{auction_title}}',
  E'<p>مرحبًا {{bidder_name}}،</p><p>يسعدنا إبلاغك بفوزك بمزاد <b>{{auction_title}}</b> بمبلغ <b>{{amount}} ر.س</b>.</p><p>يرجى إكمال الدفع قبل <b>{{deadline}}</b>.</p>',
  E'<p>Hello {{bidder_name}},</p><p>You won <b>{{auction_title}}</b> for <b>{{amount}} SAR</b>.</p><p>Pay before <b>{{deadline}}</b>.</p>',
  '["bidder_name","auction_title","amount","deadline"]'::jsonb
FROM public.organizations o
ON CONFLICT (org_id, template_key, channel) DO NOTHING;
