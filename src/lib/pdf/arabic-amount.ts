const ONES = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];

const TENS = ["", "عشرة", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];

const TEENS: Record<number, string> = {
  10: "عشرة",
  11: "أحد عشر",
  12: "اثنا عشر",
  13: "ثلاثة عشر",
  14: "أربعة عشر",
  15: "خمسة عشر",
  16: "ستة عشر",
  17: "سبعة عشر",
  18: "ثمانية عشر",
  19: "تسعة عشر",
};

const HUNDREDS = [
  "",
  "مئة",
  "مئتان",
  "ثلاثمئة",
  "أربعمئة",
  "خمسمئة",
  "ستمئة",
  "سبعمئة",
  "ثمانمئة",
  "تسعمئة",
];

function join(parts: string[]): string {
  return parts.filter(Boolean).join(" و");
}

function underThousand(value: number): string {
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  const parts: string[] = [];
  if (hundreds) parts.push(HUNDREDS[hundreds]);
  if (rest) {
    if (rest < 10) parts.push(ONES[rest]);
    else if (rest < 20) parts.push(TEENS[rest]);
    else {
      const ones = rest % 10;
      const tens = Math.floor(rest / 10);
      parts.push(join([ONES[ones], TENS[tens]]));
    }
  }
  return join(parts);
}

function scaleText(value: number, singular: string, dual: string, plural: string): string {
  if (value === 0) return "";
  if (value === 1) return singular;
  if (value === 2) return dual;
  if (value <= 10) return `${underThousand(value)} ${plural}`;
  return `${underThousand(value)} ${singular}`;
}

export function amountToArabicWords(amount: number, currency = "ريال سعودي"): string {
  const safe = Number.isFinite(amount) ? Math.max(amount, 0) : 0;
  const whole = Math.floor(safe);
  const fraction = Math.round((safe - whole) * 100);
  if (whole === 0 && fraction === 0) return `صفر ${currency} لا غير`;

  const millions = Math.floor(whole / 1_000_000);
  const thousands = Math.floor((whole % 1_000_000) / 1_000);
  const rest = whole % 1_000;
  const parts = [
    scaleText(millions, "مليون", "مليونان", "ملايين"),
    scaleText(thousands, "ألف", "ألفان", "آلاف"),
    rest ? underThousand(rest) : "",
  ].filter(Boolean);

  const wholeText = parts.length ? `${join(parts)} ${currency}` : "";
  const fractionText = fraction ? `${underThousand(fraction)} هللة` : "";
  return `${join([wholeText, fractionText])} لا غير`;
}
