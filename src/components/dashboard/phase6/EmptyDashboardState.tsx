import { Link } from "@tanstack/react-router";
import { Building2, Receipt, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmptyDashboardState({ isAr }: { isAr: boolean }) {
  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="max-w-2xl">
        <div className="inline-flex rounded-md bg-primary/10 p-2 text-primary">
          <Building2 className="size-5" />
        </div>
        <h2 className="mt-4 text-xl font-semibold">
          {isAr ? "ابدأ ببناء لوحة أملاكك" : "Start building your property dashboard"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {isAr
            ? "أضف أول عقار ووحداته، ثم سجّل عقداً أو مصروفاً لتظهر المؤشرات تلقائياً هنا."
            : "Add your first property and units, then record a lease or expense to populate these metrics."}
        </p>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button asChild>
          <Link to="/dashboard/properties/new">
            <Building2 className="me-2 size-4" />
            {isAr ? "أضف أول عقار" : "Add first property"}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/dashboard/expenses">
            <Receipt className="me-2 size-4" />
            {isAr ? "أضف مصروفاً" : "Add expense"}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/dashboard/maintenance">
            <Wrench className="me-2 size-4" />
            {isAr ? "طلب صيانة" : "Maintenance request"}
          </Link>
        </Button>
      </div>
    </div>
  );
}
