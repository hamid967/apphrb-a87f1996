// HBSpro — Navy Trust palette (finance/real-estate authority)
// Deep navy #0f1b3d · mid navy #1e3a5f · signal blue #3b6fa0 · paper #e8edf3
// `gold`/`goldSoft` keys are kept for compatibility with existing components;
// values are now Navy Trust signal blues that read on both dark and light.
export const HBS = {
  bg: "#0f1b3d",
  bgAlt: "#1e3a5f",
  /* `gold` here drives CTA fills + accent chips: needs dark text to read on it → keep light */
  gold: "#7aa7d6",
  /* `goldSoft` drives gradient highlights on dark surfaces → paper white for pop */
  goldSoft: "#e8edf3",
  blue: "#3b6fa0",
  blueSoft: "#7aa7d6",
  white: "#e8edf3",
  gray: "#94a3b8",
  border: "rgba(232,237,243,0.14)",
  glass: "rgba(255,255,255,0.05)",
};

export const CITIES = [
  { name: "Riyadh", ar: "الرياض", x: 560, y: 360, hub: true },
  { name: "Jeddah", ar: "جدة", x: 260, y: 430, hub: true },
  { name: "Makkah", ar: "مكة", x: 300, y: 460 },
  { name: "Madinah", ar: "المدينة", x: 320, y: 340 },
  { name: "Dammam", ar: "الدمام", x: 720, y: 300, hub: true },
  { name: "Khobar", ar: "الخبر", x: 735, y: 315 },
  { name: "Abha", ar: "أبها", x: 410, y: 580 },
  { name: "Jazan", ar: "جازان", x: 370, y: 640 },
  { name: "Najran", ar: "نجران", x: 500, y: 620 },
  { name: "Tabuk", ar: "تبوك", x: 220, y: 210 },
  { name: "Taif", ar: "الطائف", x: 340, y: 470 },
  { name: "Hail", ar: "حائل", x: 440, y: 260 },
  { name: "Yanbu", ar: "ينبع", x: 260, y: 320 },
  { name: "Al Ahsa", ar: "الأحساء", x: 690, y: 360 },
  { name: "Al Jouf", ar: "الجوف", x: 330, y: 190 },
  { name: "Buraidah", ar: "بريدة", x: 490, y: 305 },
  { name: "Unaizah", ar: "عنيزة", x: 478, y: 318 },
  { name: "Jubail", ar: "الجبيل", x: 710, y: 278 },
  { name: "Khamis Mushait", ar: "خميس مشيط", x: 425, y: 585 },
  { name: "Al Baha", ar: "الباحة", x: 395, y: 545 },
  { name: "Arar", ar: "عرعر", x: 410, y: 195 },
  { name: "Sakaka", ar: "سكاكا", x: 350, y: 200 },
  { name: "Qatif", ar: "القطيف", x: 698, y: 292 },
  { name: "Hafr Al-Batin", ar: "حفر الباطن", x: 580, y: 245 },
  { name: "NEOM", ar: "نيوم", x: 180, y: 178, hub: true },
];
