import * as React from "react";
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
  Hr,
  Link,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

export interface AdminAlertProps {
  siteName?: string;
  kind?: string;
  path?: string | null;
  message?: string | null;
  actorId?: string | null;
  eventTime?: string;
  telemetryUrl?: string;
  extraJson?: string | null;
}

const KIND_LABEL: Record<string, { title: string; badge: string; color: string }> = {
  render_error: { title: "خطأ عرض في لوحة الإدارة", badge: "RENDER ERROR", color: "#dc2626" },
  window_error: { title: "خطأ JavaScript في المتصفح", badge: "WINDOW ERROR", color: "#dc2626" },
  unhandled_rejection: { title: "Promise غير معالج", badge: "UNHANDLED", color: "#dc2626" },
  route_error: { title: "خطأ في مسار المسؤول", badge: "ROUTE ERROR", color: "#dc2626" },
  aal2_bypass: { title: "تم تفعيل تجاوز AAL2", badge: "AAL2 BYPASS", color: "#f59e0b" },
};

const Email = ({
  siteName = "HBSpro",
  kind = "render_error",
  path = null,
  message = null,
  actorId = null,
  eventTime = new Date().toISOString(),
  telemetryUrl = "https://hrhbs.com/admin/telemetry",
  extraJson = null,
}: AdminAlertProps) => {
  const meta = KIND_LABEL[kind] ?? {
    title: `حدث إداري: ${kind}`,
    badge: kind.toUpperCase(),
    color: "#334155",
  };
  return (
    <Html lang="ar" dir="rtl">
      <Head />
      <Preview>{`[${siteName}] ${meta.title}${path ? ` — ${path}` : ""}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={{ ...badgeWrap, backgroundColor: meta.color }}>
            <Text style={badgeText}>{meta.badge}</Text>
          </Section>
          <Heading style={h1}>{meta.title}</Heading>
          <Text style={lead}>
            تنبيه من نظام {siteName} — حدث جديد في لوحة الإدارة يستدعي مراجعتك.
          </Text>

          <Section style={detailsBox}>
            <Row label="النوع" value={kind} mono />
            <Row label="المسار" value={path ?? "—"} mono />
            <Row label="الجهة" value={actorId ?? "—"} mono />
            <Row label="الوقت" value={eventTime} mono />
          </Section>

          {message && (
            <>
              <Text style={sectionTitle}>الرسالة</Text>
              <Section style={codeBox}>
                <Text style={codeText}>{message.slice(0, 2000)}</Text>
              </Section>
            </>
          )}

          {extraJson && (
            <>
              <Text style={sectionTitle}>حمولة إضافية</Text>
              <Section style={codeBox}>
                <Text style={codeText}>{extraJson.slice(0, 2000)}</Text>
              </Section>
            </>
          )}

          <Hr style={hr} />
          <Text style={text}>
            افتح لوحة التليمتري لمزيد من السياق:{" "}
            <Link href={telemetryUrl} style={link}>
              {telemetryUrl}
            </Link>
          </Text>
          <Text style={footer}>
            هذه رسالة تلقائية من {siteName}. للتحكم في التنبيهات، فعّل/عطّل من إعدادات لوحة الإدارة.
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <Section style={rowWrap}>
      <Text style={rowLabel}>{label}</Text>
      <Text style={mono ? rowValueMono : rowValue}>{value}</Text>
    </Section>
  );
}

export const template = {
  component: Email,
  subject: (data: Record<string, unknown>) => {
    const kind = String(data.kind ?? "event");
    const path = data.path ? ` — ${String(data.path)}` : "";
    const site = String(data.siteName ?? "HBSpro");
    return `[${site}] Admin alert: ${kind}${path}`;
  },
  displayName: "Admin telemetry alert",
  previewData: {
    siteName: "HBSpro",
    kind: "render_error",
    path: "/admin/telemetry",
    message: 'TypeError: Cannot read properties of undefined (reading "map")',
    actorId: "00000000-0000-0000-0000-000000000000",
    eventTime: new Date().toISOString(),
    telemetryUrl: "https://hrhbs.com/admin/telemetry",
    extraJson: '{"stack":"at Component (App.tsx:42)"}',
  },
} satisfies TemplateEntry;

const main = {
  backgroundColor: "#ffffff",
  fontFamily: 'Almarai, "IBM Plex Sans Arabic", Arial, sans-serif',
};
const container = { padding: "24px 28px", maxWidth: "620px" };
const badgeWrap = {
  display: "inline-block",
  padding: "4px 10px",
  borderRadius: "999px",
  marginBottom: "12px",
};
const badgeText = {
  color: "#ffffff",
  fontSize: "11px",
  fontWeight: "bold" as const,
  letterSpacing: "0.06em",
  margin: 0,
};
const h1 = { fontSize: "20px", fontWeight: "bold" as const, color: "#0b1220", margin: "0 0 8px" };
const lead = { fontSize: "14px", color: "#475569", lineHeight: "1.6", margin: "0 0 20px" };
const detailsBox = {
  backgroundColor: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: "10px",
  padding: "10px 14px",
  margin: "0 0 18px",
};
const rowWrap = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  padding: "6px 0",
  borderBottom: "1px solid #eef2f7",
};
const rowLabel = { fontSize: "12px", color: "#64748b", margin: 0 };
const rowValue = { fontSize: "13px", color: "#0b1220", margin: 0 };
const rowValueMono = {
  fontSize: "12px",
  color: "#0b1220",
  margin: 0,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
};
const sectionTitle = {
  fontSize: "12px",
  fontWeight: "bold" as const,
  color: "#475569",
  margin: "12px 0 6px",
};
const codeBox = {
  backgroundColor: "#0b1220",
  borderRadius: "8px",
  padding: "12px 14px",
  margin: "0 0 18px",
};
const codeText = {
  color: "#e2e8f0",
  fontSize: "12px",
  lineHeight: "1.5",
  margin: 0,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  whiteSpace: "pre-wrap" as const,
};
const text = { fontSize: "13px", color: "#475569", lineHeight: "1.6", margin: "0 0 12px" };
const link = { color: "#2563eb", textDecoration: "underline" };
const hr = { border: "none", borderTop: "1px solid #e2e8f0", margin: "16px 0" };
const footer = { fontSize: "11px", color: "#94a3b8", margin: "10px 0 0" };
