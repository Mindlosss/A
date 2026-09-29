import {
  dateFromISO,
  localISODate,
  type BalanceAnchor,
  type Expense,
  type Extra,
  type PaySchedule,
} from "./data";

const lastDayOf = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();

export function isPayday(date: Date, schedule: PaySchedule) {
  if (schedule.frequency === "semanal")
    return date.getDay() === schedule.weekday;
  // Un día 31 cae en el último día de los meses más cortos.
  const last = lastDayOf(date);
  return schedule.days.some(
    (day) => Math.min(day || last, last) === date.getDate(),
  );
}

/** Días de pago después de `after` (sin incluirlo) y hasta `until` (incluido), en ISO. */
export function paydaysBetween(
  schedule: PaySchedule,
  after: string,
  until: string,
) {
  const result: string[] = [];
  const end = dateFromISO(until);
  const day = dateFromISO(after);
  for (
    day.setDate(day.getDate() + 1);
    day <= end;
    day.setDate(day.getDate() + 1)
  )
    if (isPayday(day, schedule)) result.push(localISODate(day));
  return result;
}

/** Días de pago de un mes completo. */
export function paydaysIn(schedule: PaySchedule, month: Date) {
  const before = new Date(month.getFullYear(), month.getMonth(), 0);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  return paydaysBetween(schedule, localISODate(before), localISODate(last));
}

/** Pagos al mes en promedio, para mostrar el equivalente mensual. */
export function paymentsPerMonth(schedule: PaySchedule) {
  if (schedule.frequency === "semanal") return 52 / 12;
  return new Set(schedule.days).size;
}

export function nextPayday(schedule: PaySchedule, today = localISODate()) {
  const limit = new Date(dateFromISO(today));
  limit.setDate(limit.getDate() + 62);
  return paydaysBetween(schedule, today, localISODate(limit))[0] ?? null;
}

/** Ingresos extra menos gastos registrados hasta `until`, incluido. */
function recordsNet(expenses: Expense[], extras: Extra[], until: string) {
  let total = 0;
  for (const item of extras) if (item.date <= until) total += item.amountCents;
  for (const item of expenses)
    if (item.date <= until) total -= item.amountCents;
  return total;
}

/**
 * Ancla el saldo declarado hoy. Lo ya registrado queda "absorbido" en el ajuste, así que
 * solo lo que se registre o se cobre después lo mueve. Los pagos de hoy se asumen cobrados.
 */
export function anchorBalance(
  cents: number,
  expenses: Expense[],
  extras: Extra[],
  today = localISODate(),
): BalanceAnchor {
  return {
    date: today,
    adjustCents: cents - recordsNet(expenses, extras, today),
  };
}

/** Saldo de hoy: el declarado más los ingresos (sueldo incluido) y menos los gastos
 * registrados después. El sueldo ya no se suma aparte: es un movimiento más. */
export function currentBalance(
  anchor: BalanceAnchor | null,
  expenses: Expense[],
  extras: Extra[],
  today = localISODate(),
) {
  if (!anchor) return null;
  return anchor.adjustCents + recordsNet(expenses, extras, today);
}

export const paycheckId = (date: string) => `sueldo-${date}`;
export const paycheckSkip = (date: string) => `ingreso|${date}`;

/**
 * Pagos del ingreso fijo que faltan registrar: días de pago después de `since` que ya
 * llegaron, salvo los ya registrados u omitidos (un pago borrado = no llegó).
 */
export function pendingPaychecks(
  incomeCents: number,
  schedule: PaySchedule,
  since: string | null,
  extras: Extra[],
  skips: string[],
  today = localISODate(),
): Extra[] {
  if (!incomeCents || !since) return [];
  const skipped = new Set(skips);
  const registered = new Set(
    extras.filter((item) => item.fixedIncome).map((item) => item.date),
  );
  return paydaysBetween(schedule, since, today)
    .filter((date) => !registered.has(date) && !skipped.has(paycheckSkip(date)))
    .map((date) => ({
      id: paycheckId(date),
      description: "Ingreso fijo",
      amountCents: incomeCents,
      date,
      note: "",
      fixedIncome: true,
    }));
}
