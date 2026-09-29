import { localISODate, type Expense, type FixedExpense } from "./data";

const normalize = (value: string) => value.trim().toLowerCase();
const monthOf = (iso: string) => iso.slice(0, 7);

/** Un gasto registrado con el mismo nombre que un gasto fijo es el pago de ese fijo. */
export const paysFixed = (expense: Expense, fixed: FixedExpense[]) =>
  fixed.some(
    (item) =>
      expense.fixedId === item.id ||
      normalize(item.name) === normalize(expense.description),
  );

/** El gasto fijo que se llama así, si hay uno. */
export const findFixed = (name: string, fixed: FixedExpense[]) =>
  name.trim()
    ? fixed.find((item) => normalize(item.name) === normalize(name))
    : undefined;

/** Los fijos que cuentan: con nombre y monto. */
export const validFixed = (fixed: FixedExpense[]) =>
  fixed.filter((item) => item.name.trim() !== "" && item.amountCents > 0);

export const skipKey = (fixedId: string, month: string) =>
  `${fixedId}|${month}`;

/** Fecha de pago de un fijo en un mes (AAAA-MM); el día 0 y los que no existen son el último. */
export function dueDate(item: FixedExpense, month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  const last = new Date(year, monthIndex, 0).getDate();
  const day = item.day === 0 ? last : Math.min(item.day, last);
  return `${month}-${String(day).padStart(2, "0")}`;
}

/** Si ese mes ya hay un pago del fijo: el automático o uno registrado a mano con su nombre. */
export const paidIn = (
  item: FixedExpense,
  month: string,
  expenses: Expense[],
) =>
  expenses.some(
    (expense) => monthOf(expense.date) === month && paysFixed(expense, [item]),
  );

/** Un fijo solo se cobra en fechas de pago posteriores al día en que se agregó. */
export const chargesOn = (item: FixedExpense, date: string) =>
  date > item.since;

/**
 * Pagos automáticos que faltan: por cada fijo, cada fecha de pago posterior a cuando se
 * agregó que ya llegó, si ese mes no está pagado ni omitido. El id es fijo por mes para
 * que nunca se duplique.
 */
export function pendingFixedPayments(
  fixed: FixedExpense[],
  expenses: Expense[],
  skips: string[],
  now = new Date(),
): Expense[] {
  const today = localISODate(now);
  const skipped = new Set(skips);
  const pending: Expense[] = [];
  for (const item of validFixed(fixed)) {
    const cursor = new Date(
      Number(item.since.slice(0, 4)),
      Number(item.since.slice(5, 7)) - 1,
      1,
    );
    while (monthOf(localISODate(cursor)) <= monthOf(today)) {
      const month = monthOf(localISODate(cursor));
      const date = dueDate(item, month);
      if (
        chargesOn(item, date) &&
        date <= today &&
        !skipped.has(skipKey(item.id, month)) &&
        !paidIn(item, month, expenses)
      )
        pending.push({
          id: `fijo-${item.id}-${month}`,
          description: item.name.trim(),
          amountCents: item.amountCents,
          category: item.category,
          date,
          note: "",
          fixedId: item.id,
        });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }
  return pending;
}
