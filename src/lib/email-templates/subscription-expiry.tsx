import * as React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

interface Props {
  siteName?: string;
  recipientName?: string;
  daysRemaining?: number;
  expiryDate?: string;
  actionUrl?: string;
}

const Email = ({
  siteName = "Aqari",
  recipientName = "",
  daysRemaining = 0,
  expiryDate = "",
  actionUrl = "#",
}: Props) => {
  const expired = daysRemaining <= 0;
  return (
    <Html lang="ar" dir="rtl">
      <Head />
      <Preview>
        {expired ? `انتهى اشتراكك في ${siteName}` : `اشتراكك في ${siteName} سينتهي قريبًا`}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{expired ? "انتهى اشتراكك" : "اشتراكك على وشك الانتهاء"}</Heading>
          <Text style={text}>مرحبًا {recipientName || "عميلنا العزيز"},</Text>
          <Text style={text}>
            {expired
              ? `انتهى اشتراكك${expiryDate ? ` بتاريخ ${expiryDate}` : ""}. لتفادي إيقاف الخدمات يرجى تجديد الاشتراك.`
              : `يتبقى ${daysRemaining} يوم على انتهاء اشتراكك${expiryDate ? ` في ${expiryDate}` : ""}. جدّد الآن لتفادي انقطاع الخدمة.`}
          </Text>
          <Button style={button} href={actionUrl}>
            تجديد الاشتراك
          </Button>
          <Text style={footer}>شكرًا لاختيارك {siteName}.</Text>
        </Container>
      </Body>
    </Html>
  );
};

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    (data?.daysRemaining ?? 0) <= 0 ? "انتهى اشتراكك" : "اشتراكك سينتهي قريبًا",
  displayName: "Subscription expiry",
  previewData: {
    siteName: "Aqari",
    recipientName: "حامد",
    daysRemaining: 5,
    expiryDate: "2026-07-15",
    actionUrl: "https://hrhbs.com/dashboard/subscription",
  },
} satisfies TemplateEntry;

const main = { backgroundColor: "#ffffff", fontFamily: "Arial, sans-serif" };
const container = { padding: "20px 25px" };
const h1 = { fontSize: "22px", fontWeight: "bold" as const, color: "#0a0a0a", margin: "0 0 20px" };
const text = { fontSize: "14px", color: "#55575d", lineHeight: "1.6", margin: "0 0 20px" };
const button = {
  backgroundColor: "#0a0a0a",
  color: "#ffffff",
  fontSize: "14px",
  borderRadius: "10px",
  padding: "12px 20px",
  textDecoration: "none",
};
const footer = { fontSize: "12px", color: "#999999", margin: "30px 0 0" };
