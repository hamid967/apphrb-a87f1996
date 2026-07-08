export type DateRangeMessages = {
  fromRequired: string;
  toRequired: string;
  fromBelowMin: (min: string) => string;
  fromAboveMax: (max: string) => string;
  toBelowMin: (min: string) => string;
  toAboveMax: (max: string) => string;
  fromAfterTo: string;
};

export const DATE_RANGE_MESSAGES_AR: DateRangeMessages = {
  fromRequired: "حدد تاريخ البداية",
  toRequired: "حدد تاريخ النهاية",
  fromBelowMin: (m) => `تاريخ البداية يسبق أقدم بيانات متاحة (${m})`,
  fromAboveMax: (m) => `تاريخ البداية لا يمكن أن يكون في المستقبل (>${m})`,
  toBelowMin: (m) => `تاريخ النهاية يسبق أقدم بيانات متاحة (${m})`,
  toAboveMax: (m) => `تاريخ النهاية لا يمكن أن يكون في المستقبل (>${m})`,
  fromAfterTo: "تاريخ البداية يجب ألا يكون بعد تاريخ النهاية",
};

export const DATE_RANGE_MESSAGES_EN: DateRangeMessages = {
  fromRequired: "Pick a start date",
  toRequired: "Pick an end date",
  fromBelowMin: (m) => `Start date is earlier than the oldest available data (${m})`,
  fromAboveMax: (m) => `Start date cannot be in the future (>${m})`,
  toBelowMin: (m) => `End date is earlier than the oldest available data (${m})`,
  toAboveMax: (m) => `End date cannot be in the future (>${m})`,
  fromAfterTo: "Start date must not be after the end date",
};

export type DateRangeErrors = { fromError: string; toError: string; ok: boolean };

export function validateDateRange(
  nextFrom: string,
  nextTo: string,
  minISO: string,
  maxISO: string,
  messages: DateRangeMessages = DATE_RANGE_MESSAGES_AR,
): DateRangeErrors {
  let fromError = "";
  let toError = "";
  if (!nextFrom) fromError = messages.fromRequired;
  if (!nextTo) toError = messages.toRequired;
  if (!fromError && nextFrom < minISO) fromError = messages.fromBelowMin(minISO);
  if (!fromError && nextFrom > maxISO) fromError = messages.fromAboveMax(maxISO);
  if (!toError && nextTo < minISO) toError = messages.toBelowMin(minISO);
  if (!toError && nextTo > maxISO) toError = messages.toAboveMax(maxISO);
  if (!fromError && !toError && nextFrom > nextTo) fromError = messages.fromAfterTo;
  return { fromError, toError, ok: !fromError && !toError };
}
