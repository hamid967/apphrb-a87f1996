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

export type ApplicationUpdateEvent =
  | "status_changed"
  | "note_added"
  | "approved"
  | "rejected";

export interface ApplicationUpdateProps {
  siteName?: string;
  applicantName?: string;
  listingTitle?: string | null;
  event?: ApplicationUpdateEvent;
  newStatus?: string | null;
  oldStatus?: string | null;
  note?: string | null;
  actorName?: string | null;
  eventTime?: string;
  applicationUrl?: string;
}

const STATUS_AR: Record<string, string> = {
  new: "جديد",
  reviewing: "قيد المراجعة",
  approved: "مقبول",
  rejected: "مرفوض",
};

const EVENT_TITLE: Record<ApplicationUpdateEvent, string> = {
  status_changed: "تحديث حالة طلبك",
  note_added: "ملاحظة جديدة على طلبك",
  approved: "تم قبول طلبك",
  rejected: "تم رفض طلبك",
};

const EVENT_COLOR: Record<ApplicationUpdateEvent, string> = {
  status_changed: "#2563eb",
  note_added: "#334155",
  approved: "#059669",
  rejected: "#dc2626",
};

const Email = ({
  siteName = "HBSpro",
  applicantName = "",
  listingTitle = null,
  event = "status_changed",
  newStatus = null,
  oldStatus = null,
  note = null,
  actorName = null,
  eventTime = new Date().toISOString(),
  applicationUrl,
}: ApplicationUpdateProps) => {
  const title = EVENT_TITLE[event] ?? EVENT_TITLE.status_changed;
  const color = EVENT_COLOR[event] ?? "#334155";
  const statusLabel = newStatus ? STATUS_AR[newStatus] ?? newStatus : null;
  const prevLabel = oldStatus ? STATUS_AR[oldStatus] ?? oldStatus : null;
  return (
    <Html lang="ar" dir="rtl">
      <Head />
      <Preview>{`[${siteName}] ${title}${listingTitle ? ` — ${listingTitle}` : ""}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={{ ...badgeWrap, backgroundColor: color }}>
            <Text style={badgeText}>{title}</Text>
          </Section>
          <Heading style={h1}>
            {applicantName ? `مرحبًا ${applicantName}،` : "مرحبًا،"}
          </Heading>
          <Text style={lead}>
            {listingTitle
              ? `طلبك على العقار "${listingTitle}" قد تم تحديثه.`
              : "طلبك قد تم تحديثه."}
          </Text>

          <Section style={detailsBox}>
            {statusLabel && <Row label="الحالة الحالية" value={statusLabel} />}
            {prevLabel && prevLabel !== statusLabel && (
              <Row label="الحالة السابقة" value={prevLabel} />
            )}
            {actorName && <Row label="بواسطة" value={actorName} />}
            <Row label="الوقت" value={eventTime} mono />
          </Section>

          {note && (
            <>
              <Text style={sectionTitle}>ملاحظة الفريق</Text>
              <Section style={quoteBox}>
                <Text style={quoteText}>{note.slice(0, 2000)}</Text>
              </Section>
            </>
          )}

          {applicationUrl && (
            <>
              <Hr style={hr} />
              <Text style={text}>
                يمكنك متابعة طلبك من الرابط:{" "}
                <Link href={applicationUrl} style={link}>
                  {applicationUrl}
                </Link>
              </Text>
            </>
          )}
          <Text style={footer}>
            هذه رسالة تلقائية من {siteName}. لا حاجة للرد على هذا البريد.
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
    const event = String(data.event ?? "status_changed") as ApplicationUpdateEvent;
    const site = String(data.siteName ?? "HBSpro");
    const listing = data.listingTitle ? ` — ${String(data.listingTitle)}` : "";
    return `[${site}] ${EVENT_TITLE[event] ?? EVENT_TITLE.status_changed}${listing}`;
  },
  displayName: "Rental application update",
  previewData: {
    siteName: "HBSpro",
    applicantName: "أحمد المطيري",
    listingTitle: "شقة بحي الياسمين",
    event: "status_changed",
    newStatus: "reviewing",
    oldStatus: "new",
    actorName: "فريق المراجعة",
    eventTime: new Date().toISOString(),
    applicationUrl: "https://hrhbs.com/listings/abc/apply",
  },
} satisfies TemplateEntry;

const main = {
  backgroundColor: "#ffffff",
  fontFamily: 'Almarai, "IBM Plex Sans Arabic", Arial, sans-serif',
};
const container = { padding: "24px 28px", maxWidth: "620px" };
const badgeWrap = {
  display: "inline-block",
  padding: "4px 12px",
  borderRadius: "999px",
  marginBottom: "12px",
};
const badgeText = {
  color: "#ffffff",
  fontSize: "12px",
  fontWeight: "bold" as const,
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
const quoteBox = {
  backgroundColor: "#fffbeb",
  border: "1px solid #fde68a",
  borderRight: "3px solid #d4af37",
  borderRadius: "8px",
  padding: "12px 14px",
  margin: "0 0 18px",
};
const quoteText = {
  fontSize: "13px",
  color: "#0b1220",
  lineHeight: "1.6",
  margin: 0,
  whiteSpace: "pre-wrap" as const,
};
const text = { fontSize: "13px", color: "#475569", lineHeight: "1.6", margin: "0 0 12px" };
const link = { color: "#2563eb", textDecoration: "underline" };
const hr = { border: "none", borderTop: "1px solid #e2e8f0", margin: "16px 0" };
const footer = { fontSize: "11px", color: "#94a3b8", margin: "10px 0 0" };