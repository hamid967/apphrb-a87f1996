import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { submitContact } from "@/lib/marketing.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Building2, Mail, Phone, MessageCircle, MapPin } from "lucide-react";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "تواصل معنا — عقاري Aqari | Contact" },
      {
        name: "description",
        content:
          "تواصل مع فريق عقاري Aqari عبر النموذج، البريد، أو واتساب. نرد خلال ساعات العمل الرسمية.",
      },
      { property: "og:title", content: "تواصل معنا — عقاري Aqari" },
      { property: "og:description", content: "نموذج تواصل مباشر مع فريق مبيعات ودعم عقاري Aqari." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://apphrb.lovable.app/contact" },
    ],
    links: [{ rel: "canonical", href: "https://apphrb.lovable.app/contact" }],
  }),
  component: ContactPage,
});

function ContactPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const submit = useServerFn(submitContact);

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    units: "",
    message: "",
  });
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof typeof form>(k: K, v: string) => setForm((s) => ({ ...s, [k]: v }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await submit({ data: form });
      if (res.ok) {
        toast.success(isAr ? "تم إرسال رسالتك بنجاح" : "Message sent successfully");
        setForm({ name: "", email: "", phone: "", company: "", units: "", message: "" });
      } else {
        toast.error(res.error ?? (isAr ? "تعذّر الإرسال" : "Failed to send"));
      }
    } catch (err) {
      toast.error(isAr ? "حدث خطأ" : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="theme-luxe min-h-app bg-background text-foreground">
      <header className="border-b border-border/60 bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2 font-bold">
            <Building2 className="h-5 w-5" />
            <span>Aqari</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link to="/about" className="text-muted-foreground hover:text-foreground">
              {isAr ? "من نحن" : "About"}
            </Link>
            <Link to="/pricing" className="text-muted-foreground hover:text-foreground">
              {isAr ? "الأسعار" : "Pricing"}
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="mb-12 text-center">
          <h1 className="text-display text-4xl sm:text-5xl">
            {isAr ? "لنتحدث" : "Let's talk"}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            {isAr
              ? "املأ النموذج وسيتواصل معك فريقنا خلال 24 ساعة عمل، أو تواصل مباشرة عبر البريد أو الواتساب."
              : "Fill out the form and our team will get back to you within one business day, or reach us directly by email or WhatsApp."}
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          <form
            onSubmit={onSubmit}
            className="rounded-2xl border border-border/60 bg-card/50 p-6 sm:p-8"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="name">{isAr ? "الاسم *" : "Name *"}</Label>
                <Input
                  id="name"
                  required
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="email">{isAr ? "البريد الإلكتروني *" : "Email *"}</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="phone">{isAr ? "رقم الجوال" : "Phone"}</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="company">{isAr ? "اسم الشركة" : "Company"}</Label>
                <Input
                  id="company"
                  value={form.company}
                  onChange={(e) => set("company", e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="units">{isAr ? "عدد الوحدات (تقريبي)" : "Approximate units"}</Label>
                <Input
                  id="units"
                  placeholder={isAr ? "مثال: 50-100" : "e.g. 50-100"}
                  value={form.units}
                  onChange={(e) => set("units", e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="message">{isAr ? "الرسالة" : "Message"}</Label>
                <Textarea
                  id="message"
                  rows={4}
                  value={form.message}
                  onChange={(e) => set("message", e.target.value)}
                />
              </div>
            </div>
            <Button type="submit" size="lg" className="mt-6 w-full sm:w-auto" disabled={busy}>
              {busy ? (isAr ? "جارٍ الإرسال..." : "Sending...") : isAr ? "إرسال" : "Send message"}
            </Button>
          </form>

          <aside className="space-y-4">
            <a
              href="mailto:sales@hrhbs.com"
              className="flex items-start gap-3 rounded-xl border border-border/60 bg-card/40 p-4 transition hover:bg-card/70"
            >
              <Mail className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <div className="text-sm font-semibold">{isAr ? "البريد" : "Email"}</div>
                <div className="text-sm text-muted-foreground">sales@hrhbs.com</div>
              </div>
            </a>
            <a
              href="https://wa.me/966500000000"
              target="_blank"
              rel="noreferrer"
              className="flex items-start gap-3 rounded-xl border border-border/60 bg-card/40 p-4 transition hover:bg-card/70"
            >
              <MessageCircle className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <div className="text-sm font-semibold">WhatsApp</div>
                <div className="text-sm text-muted-foreground" dir="ltr">+966 50 000 0000</div>
              </div>
            </a>
            <a
              href="tel:+966500000000"
              className="flex items-start gap-3 rounded-xl border border-border/60 bg-card/40 p-4 transition hover:bg-card/70"
            >
              <Phone className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <div className="text-sm font-semibold">{isAr ? "الهاتف" : "Phone"}</div>
                <div className="text-sm text-muted-foreground" dir="ltr">+966 50 000 0000</div>
              </div>
            </a>
            <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-card/40 p-4">
              <MapPin className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <div className="text-sm font-semibold">{isAr ? "المقر" : "Office"}</div>
                <div className="text-sm text-muted-foreground">
                  {isAr ? "الرياض، المملكة العربية السعودية" : "Riyadh, Saudi Arabia"}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
