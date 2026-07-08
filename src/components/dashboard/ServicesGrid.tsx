import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import svcProperties from "@/assets/dashboard/svc-properties.png";
import svcContracts from "@/assets/dashboard/svc-contracts.png";
import svcPayments from "@/assets/dashboard/svc-payments.png";
import svcMaintenance from "@/assets/dashboard/svc-maintenance.png";
import svcReports from "@/assets/dashboard/svc-reports.png";
import svcAssistant from "@/assets/dashboard/svc-assistant.png";

type Service = {
  to: string;
  img: string;
  titleAr: string;
  titleEn: string;
  descAr: string;
  descEn: string;
};

const SERVICES: Service[] = [
  {
    to: "/dashboard/properties",
    img: svcProperties,
    titleAr: "العقارات",
    titleEn: "Properties",
    descAr: "إدارة العقارات والوحدات",
    descEn: "Manage properties & units",
  },
  {
    to: "/dashboard/contracts",
    img: svcContracts,
    titleAr: "العقود",
    titleEn: "Contracts",
    descAr: "إنشاء ومتابعة العقود",
    descEn: "Create & track contracts",
  },
  {
    to: "/dashboard/payments",
    img: svcPayments,
    titleAr: "المدفوعات",
    titleEn: "Payments",
    descAr: "الفواتير والسندات",
    descEn: "Invoices & vouchers",
  },
  {
    to: "/dashboard/maintenance",
    img: svcMaintenance,
    titleAr: "الصيانة",
    titleEn: "Maintenance",
    descAr: "طلبات وفنيّون",
    descEn: "Requests & technicians",
  },
  {
    to: "/dashboard/reports",
    img: svcReports,
    titleAr: "التقارير",
    titleEn: "Reports",
    descAr: "تحليلات ومؤشرات",
    descEn: "Analytics & KPIs",
  },
  {
    to: "/assistant",
    img: svcAssistant,
    titleAr: "المساعد الذكي",
    titleEn: "AI Assistant",
    descAr: "إجابات فورية بالذكاء الاصطناعي",
    descEn: "Instant AI answers",
  },
];

export function ServicesGrid({ isAr }: { isAr: boolean }) {
  const Arrow = isAr ? ArrowLeft : ArrowRight;
  return (
    <section aria-label={isAr ? "الخدمات" : "Services"}>
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight">
            {isAr ? "الخدمات" : "Services"}
          </h2>
          <p className="text-xs text-muted-foreground">
            {isAr ? "اختصارات لأكثر الأقسام استخدامًا" : "Shortcuts to your most-used sections"}
          </p>
        </div>
        <Link
          to="/dashboard/services-report"
          className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-primary transition hover:border-primary/40 hover:bg-primary/5"
        >
          {isAr ? "كل الخدمات" : "All services"}
          <Arrow className="size-3" />
        </Link>
      </div>
      <motion.div
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
        }}
      >
        {SERVICES.map((s, i) => (
          <motion.div
            key={s.to}
            variants={{
              hidden: { opacity: 0, y: 14, scale: 0.96 },
              show: {
                opacity: 1,
                y: 0,
                scale: 1,
                transition: { type: "spring", stiffness: 260, damping: 22 },
              },
            }}
            whileHover={{ y: -4, scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: "spring", stiffness: 400, damping: 24 }}
            className="touch-manipulation"
          >
            <Link
              to={s.to}
              className="group relative flex h-full flex-col items-center gap-2 overflow-hidden rounded-2xl border border-border bg-card p-4 text-center shadow-[0_4px_16px_-8px_hsl(var(--primary)/0.25)] transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:border-primary/60"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 -top-10 h-24 opacity-60 blur-2xl transition group-hover:opacity-90"
                style={{
                  background:
                    "radial-gradient(ellipse at center, hsl(var(--primary) / 0.25), transparent 70%)",
                }}
              />
              <motion.img
                src={s.img}
                alt=""
                width={72}
                height={72}
                loading="lazy"
                draggable={false}
                className="relative z-10 h-16 w-16 select-none object-contain"
                whileHover={{ rotate: [0, -6, 6, -3, 0], scale: 1.08 }}
                transition={{ duration: 0.6, ease: "easeInOut" }}
              />
              <div className="relative z-10">
                <div className="text-sm font-semibold text-foreground">
                  {isAr ? s.titleAr : s.titleEn}
                </div>
                <div className="mt-0.5 line-clamp-2 text-[11px] leading-tight text-muted-foreground">
                  {isAr ? s.descAr : s.descEn}
                </div>
              </div>
              <motion.span
                className="relative z-10 mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-primary"
                initial={{ opacity: 0, x: 0 }}
                whileHover={{ opacity: 1 }}
                animate={{ opacity: 0 }}
                variants={{
                  rest: { opacity: 0 },
                  hover: { opacity: 1 },
                }}
              >
                {isAr ? "فتح" : "Open"}
                <motion.span
                  animate={{ x: [0, isAr ? -3 : 3, 0] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                  className="inline-flex"
                >
                  <Arrow className="size-3" />
                </motion.span>
              </motion.span>
            </Link>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}

export default ServicesGrid;