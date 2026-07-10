import { Link, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import {
  Building2,
  Menu,
  ChevronDown,
  Home,
  Store,
  Building,
  Users,
  Briefcase,
  UserCircle2,
  Wrench,
  FileText,
  BookOpen,
  HelpCircle,
  MessageSquare,
  Rss,
  ScrollText,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

type NavLink = {
  to: string;
  icon: LucideIcon;
  labelAr: string;
  labelEn: string;
  descAr: string;
  descEn: string;
};

type NavGroup = {
  headerAr: string;
  headerEn: string;
  links: NavLink[];
};

const SOLUTIONS_GROUPS: NavGroup[] = [
  {
    headerAr: "حسب نوع العميل",
    headerEn: "By customer type",
    links: [
      {
        to: "/solutions/owners",
        icon: UserCircle2,
        labelAr: "الملاك",
        labelEn: "Owners",
        descAr: "بوابة الملاك وكشوف الحساب.",
        descEn: "Owner portal and statements.",
      },
      {
        to: "/solutions/property-managers",
        icon: Briefcase,
        labelAr: "مدراء العقارات",
        labelEn: "Property managers",
        descAr: "أدوات إدارة المحفظة اليومية.",
        descEn: "Day-to-day portfolio tools.",
      },
      {
        to: "/solutions/brokers",
        icon: Users,
        labelAr: "الوسطاء",
        labelEn: "Brokers",
        descAr: "إدارة القوائم والصفقات.",
        descEn: "Listings and deal management.",
      },
      {
        to: "/solutions/enterprises",
        icon: Building,
        labelAr: "الشركات",
        labelEn: "Enterprises",
        descAr: "حلول متعددة الفروع والصلاحيات.",
        descEn: "Multi-branch and role solutions.",
      },
    ],
  },
  {
    headerAr: "حسب نوع العقار",
    headerEn: "By property type",
    links: [
      {
        to: "/solutions/residential",
        icon: Home,
        labelAr: "سكني",
        labelEn: "Residential",
        descAr: "شقق، فلل، ومجمعات سكنية.",
        descEn: "Apartments, villas, complexes.",
      },
      {
        to: "/solutions/commercial",
        icon: Store,
        labelAr: "تجاري",
        labelEn: "Commercial",
        descAr: "محلات، مكاتب، ومجمعات.",
        descEn: "Shops, offices, complexes.",
      },
    ],
  },
];

const PLATFORM_GROUPS: NavGroup[] = [
  {
    headerAr: "الإدارة",
    headerEn: "Management",
    links: [
      {
        to: "/features",
        icon: Building2,
        labelAr: "العقارات والوحدات",
        labelEn: "Properties & units",
        descAr: "تنظيم كل أصولك في مكان واحد.",
        descEn: "Organize all your assets in one place.",
      },
      {
        to: "/features",
        icon: FileText,
        labelAr: "العقود",
        labelEn: "Contracts",
        descAr: "إنشاء وتجديد آلي.",
        descEn: "Auto-create and renew.",
      },
    ],
  },
  {
    headerAr: "المالية",
    headerEn: "Finance",
    links: [
      {
        to: "/features",
        icon: FileText,
        labelAr: "الفوترة و ZATCA",
        labelEn: "Invoicing & ZATCA",
        descAr: "فوترة إلكترونية ممتثلة للمرحلة الثانية.",
        descEn: "Phase-2 compliant e-invoicing.",
      },
      {
        to: "/pricing",
        icon: ScrollText,
        labelAr: "الأسعار",
        labelEn: "Pricing",
        descAr: "الاشتراك بالتحويل البنكي.",
        descEn: "Bank-transfer subscriptions.",
      },
    ],
  },
  {
    headerAr: "العمليات",
    headerEn: "Operations",
    links: [
      {
        to: "/features",
        icon: Wrench,
        labelAr: "الصيانة",
        labelEn: "Maintenance",
        descAr: "طلبات وتعيين فنيين.",
        descEn: "Tickets and technician dispatch.",
      },
      {
        to: "/platform",
        icon: MessageSquare,
        labelAr: "الإشعارات",
        labelEn: "Notifications",
        descAr: "SMS وواتساب وبريد آلي.",
        descEn: "Automated SMS, WhatsApp, email.",
      },
    ],
  },
  {
    headerAr: "البوابات",
    headerEn: "Portals",
    links: [
      {
        to: "/solutions/owners",
        icon: UserCircle2,
        labelAr: "بوابة الملاك",
        labelEn: "Owner portal",
        descAr: "رؤية كاملة لأداء العقارات.",
        descEn: "Full property performance visibility.",
      },
      {
        to: "/solutions/residential",
        icon: Home,
        labelAr: "بوابة المستأجرين",
        labelEn: "Tenant portal",
        descAr: "الفواتير والصيانة من الهاتف.",
        descEn: "Invoices and maintenance from mobile.",
      },
    ],
  },
];

const RESOURCES_LINKS: NavLink[] = [
  {
    to: "/blog",
    icon: Rss,
    labelAr: "المدونة",
    labelEn: "Blog",
    descAr: "مقالات وإرشادات لقطاع العقار.",
    descEn: "Articles and guides for real estate.",
  },
  {
    to: "/help",
    icon: BookOpen,
    labelAr: "مركز المساعدة",
    labelEn: "Help Center",
    descAr: "أدلة سريعة للبداية.",
    descEn: "Quick start guides.",
  },
  {
    to: "/faq",
    icon: HelpCircle,
    labelAr: "الأسئلة الشائعة",
    labelEn: "FAQ",
    descAr: "أجوبة على أكثر الأسئلة تكراراً.",
    descEn: "Answers to common questions.",
  },
  {
    to: "/contact",
    icon: MessageSquare,
    labelAr: "تواصل معنا",
    labelEn: "Contact",
    descAr: "فريقنا جاهز للرد.",
    descEn: "Our team is ready to help.",
  },
];

function MegaPanel({ groups, isAr }: { groups: NavGroup[]; isAr: boolean }) {
  return (
    <div className="grid w-[640px] gap-6 p-6 md:grid-cols-2">
      {groups.map((g) => (
        <div key={g.headerEn}>
          <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {isAr ? g.headerAr : g.headerEn}
          </div>
          <ul className="space-y-1">
            {g.links.map((l) => (
              <li key={l.labelEn + l.to}>
                <Link
                  to={l.to}
                  className="flex items-start gap-3 rounded-md p-2 hover:bg-muted/60"
                >
                  <l.icon className="mt-0.5 h-4 w-4 text-primary" />
                  <div>
                    <div className="text-sm font-medium">{isAr ? l.labelAr : l.labelEn}</div>
                    <div className="text-xs text-muted-foreground">
                      {isAr ? l.descAr : l.descEn}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ResourcesPanel({ isAr }: { isAr: boolean }) {
  return (
    <ul className="grid w-[360px] gap-1 p-4">
      {RESOURCES_LINKS.map((l) => (
        <li key={l.labelEn}>
          <Link to={l.to} className="flex items-start gap-3 rounded-md p-2 hover:bg-muted/60">
            <l.icon className="mt-0.5 h-4 w-4 text-primary" />
            <div>
              <div className="text-sm font-medium">{isAr ? l.labelAr : l.labelEn}</div>
              <div className="text-xs text-muted-foreground">{isAr ? l.descAr : l.descEn}</div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function PublicNav() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        <Link to="/" className="flex items-center gap-2 font-bold" aria-label="HBSpro">
          <Building2 className="h-5 w-5 text-primary" />
          <span>HBSpro</span>
        </Link>

        {/* Desktop mega-menu */}
        <NavigationMenu className="hidden lg:flex" dir={isAr ? "rtl" : "ltr"}>
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuTrigger>{isAr ? "المنصة" : "Platform"}</NavigationMenuTrigger>
              <NavigationMenuContent>
                <MegaPanel groups={PLATFORM_GROUPS} isAr={!!isAr} />
              </NavigationMenuContent>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuTrigger>{isAr ? "الحلول" : "Solutions"}</NavigationMenuTrigger>
              <NavigationMenuContent>
                <MegaPanel groups={SOLUTIONS_GROUPS} isAr={!!isAr} />
              </NavigationMenuContent>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuTrigger>{isAr ? "المصادر" : "Resources"}</NavigationMenuTrigger>
              <NavigationMenuContent>
                <ResourcesPanel isAr={!!isAr} />
              </NavigationMenuContent>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>

        <div className="hidden items-center gap-3 lg:flex">
          <Link
            to="/pricing"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            {isAr ? "الأسعار" : "Pricing"}
          </Link>
          <LanguageSwitcher />
          <Button asChild variant="ghost" size="sm">
            <Link to="/auth">{isAr ? "دخول" : "Sign in"}</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/request-demo">
              {isAr ? "اطلب عرضاً" : "Request demo"}
            </Link>
          </Button>
        </div>

        {/* Mobile */}
        <div className="flex items-center gap-2 lg:hidden">
          <LanguageSwitcher />
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={isAr ? "القائمة" : "Menu"}
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side={isAr ? "right" : "left"} className="w-[86vw] max-w-sm overflow-y-auto">
              <SheetTitle className="mb-4 flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                HBSpro
              </SheetTitle>
              <MobileGroups isAr={!!isAr} onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

function MobileGroups({ isAr, onNavigate }: { isAr: boolean; onNavigate: () => void }) {
  return (
    <div className="space-y-6 pb-8">
      <MobileSection
        title={isAr ? "المنصة" : "Platform"}
        groups={PLATFORM_GROUPS}
        isAr={isAr}
        onNavigate={onNavigate}
      />
      <MobileSection
        title={isAr ? "الحلول" : "Solutions"}
        groups={SOLUTIONS_GROUPS}
        isAr={isAr}
        onNavigate={onNavigate}
      />
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {isAr ? "المصادر" : "Resources"}
        </div>
        <ul className="space-y-1">
          {RESOURCES_LINKS.map((l) => (
            <li key={l.labelEn}>
              <Link
                to={l.to}
                onClick={onNavigate}
                className="flex items-center gap-2 rounded-md p-2 text-sm hover:bg-muted/60"
              >
                <l.icon className="h-4 w-4 text-primary" />
                {isAr ? l.labelAr : l.labelEn}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div className="border-t border-border/60 pt-4">
        <ul className="space-y-1">
          <li>
            <Link
              to="/pricing"
              onClick={onNavigate}
              className="block rounded-md p-2 text-sm hover:bg-muted/60"
            >
              {isAr ? "الأسعار" : "Pricing"}
            </Link>
          </li>
        </ul>
        <div className="mt-4 flex flex-col gap-2">
          <Button asChild variant="outline" onClick={onNavigate}>
            <Link to="/auth">{isAr ? "دخول" : "Sign in"}</Link>
          </Button>
          <Button asChild onClick={onNavigate}>
            <Link to="/request-demo">{isAr ? "اطلب عرضاً" : "Request demo"}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function MobileSection({
  title,
  groups,
  isAr,
  onNavigate,
}: {
  title: string;
  groups: NavGroup[];
  isAr: boolean;
  onNavigate: () => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        {title}
        <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-3 space-y-4">
          {groups.map((g) => (
            <div key={g.headerEn}>
              <div className="mb-1 text-[11px] font-medium text-muted-foreground/80">
                {isAr ? g.headerAr : g.headerEn}
              </div>
              <ul className="space-y-1">
                {g.links.map((l) => (
                  <li key={l.labelEn + l.to}>
                    <Link
                      to={l.to}
                      onClick={onNavigate}
                      className="flex items-center gap-2 rounded-md p-2 text-sm hover:bg-muted/60"
                    >
                      <l.icon className="h-4 w-4 text-primary" />
                      {isAr ? l.labelAr : l.labelEn}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
