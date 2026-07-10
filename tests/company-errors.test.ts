import { describe, it, expect } from "vitest";
import { describeCompanyCreateError } from "@/lib/company-errors";

describe("describeCompanyCreateError", () => {
  const cases: Array<[string, unknown, string]> = [
    ["missing GRANT on the RPC", new Error("permission denied for function register_company"), "لا تملك صلاحية"],
    ["generic RPC permission", new Error("permission denied for function foo"), "صلاحية غير مفعّلة"],
    ["RLS block on tables", new Error("new row violates row-level security policy for table \"organizations\""), "قواعد الحماية"],
    ["table permission denied", new Error("permission denied for table organizations"), "الصلاحيات على الجداول"],
    ["function: already belong", new Error("You already belong to a company"), "لديك شركة"],
    ["function: invalid name", new Error("Invalid company name"), "اسم الشركة"],
    ["function: not authenticated", new Error("Not authenticated"), "انتهت الجلسة"],
    ["duplicate key", new Error("duplicate key value violates unique constraint"), "الاسم مستخدم"],
    ["network", new Error("Failed to fetch"), "تعذّر الاتصال"],
    ["unknown", new Error("something exploded"), "تعذّر إنشاء الشركة"],
    ["plain string", "boom", "تعذّر إنشاء الشركة"],
    ["null", null, "تعذّر إنشاء الشركة"],
  ];

  for (const [label, input, expectedFragment] of cases) {
    it(label, () => {
      const hint = describeCompanyCreateError(input);
      expect(hint.title + " " + hint.description).toContain(expectedFragment);
      expect(hint.title.length).toBeGreaterThan(0);
      expect(hint.description.length).toBeGreaterThan(0);
    });
  }
});
