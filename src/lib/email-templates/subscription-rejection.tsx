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
  reason?: string;
  actionUrl?: string;
}

const Email = ({ siteName = "Aqari", recipientName = "", reason = "", actionUrl = "#" }: Props) => (
  <Html lang="ar" dir="rtl">
    <Head />
    <Preview>تعذّر اعتماد إيصال اشتراكك في {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>تعذّر اعتماد إيصال الدفع</Heading>
        <Text style={text}>مرحبًا {recipientName || "عميلنا العزيز"},</Text>
        <Text style={text}>
          للأسف لم نتمكن من اعتماد إيصال الدفع الخاص باشتراكك.
          {reason ? ` السبب: ${reason}.` : ""} يمكنك رفع إيصال جديد من صفحة الاشتراك.
        </Text>
        <Button style={button} href={actionUrl}>
          رفع إيصال جديد
        </Button>
        <Text style={footer}>إذا كنت تعتقد أن هناك خطأ، تواصل مع الدعم.</Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: Email,
  subject: "لم يتم اعتماد إيصال الاشتراك",
  displayName: "Subscription rejected",
  previewData: {
    siteName: "Aqari",
    recipientName: "حامد",
    reason: "المبلغ لا يطابق قيمة الباقة",
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
