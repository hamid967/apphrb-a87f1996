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
  planName?: string;
  amount?: string;
  actionUrl?: string;
}

const Email = ({
  siteName = "HBSpro",
  recipientName = "",
  planName = "",
  amount = "",
  actionUrl = "#",
}: Props) => (
  <Html lang="ar" dir="rtl">
    <Head />
    <Preview>تم اعتماد اشتراكك في {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>تم اعتماد اشتراكك ✅</Heading>
        <Text style={text}>مرحبًا {recipientName || "عميلنا العزيز"},</Text>
        <Text style={text}>
          تم اعتماد إيصال الدفع الخاص باشتراكك{planName ? ` في باقة ${planName}` : ""}
          {amount ? ` بمبلغ ${amount}` : ""}. أصبحت جميع مزايا الباقة مفعّلة الآن.
        </Text>
        <Button style={button} href={actionUrl}>
          الانتقال إلى لوحة التحكم
        </Button>
        <Text style={footer}>شكرًا لثقتك بـ {siteName}.</Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: Email,
  subject: "تم اعتماد اشتراكك",
  displayName: "Subscription approved",
  previewData: {
    siteName: "HBSpro",
    recipientName: "حامد",
    planName: "الاحترافية",
    amount: "499 SAR",
    actionUrl: "https://hrhbs.com/dashboard",
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
