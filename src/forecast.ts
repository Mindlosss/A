import {
  dateFromISO,
  localISODate,
  type Expense,
  type Extra,
  type FixedExpense,
  type PaySchedule,
} from "./data";
import {
  chargesOn,
  dueDate,
  paidIn,
  paysFixed,
  skipKey,
  validFixed,
} from "./fixed";
import { paydaysIn } from "./income";

const DAY = 86_400_000;
const WINDOW_DAYS = 90; // historial que se usa para estimar el ritmo
const HALF_LIFE_DAYS = 30; // un día de hace 30 días pesa la mitad que hoy
const Z80 = 1.2816; // intervalo del 80%

export type Band = { value: number; low: number; high: number };
/**
 * Dinero acumulado (con banda) al cierre de un mes: el saldo proyectado si se conoce,
 * o el ahorro desde este mes si no. Más el ingreso, el gasto y lo que queda en ese mes.
 */
export type MonthPoint = Band & {
  month: Date;
  income: number;
  spend: number;
  net: number;
};
export type Forecast = {
  /** Gasto diario habitual (sin gastos fijos), en centavos. */
  rate: number;
  /** Suma de los gastos fijos mensuales. */
  fixedMonthly: number;
  /** Gasto total proyectado al cierre del mes actual. */
  monthSpend: Band;
  /** Este mes y los siguientes. Sin ingreso ni saldo, es solo gasto en negativo. */
  savings: MonthPoint[];
  /** Gastos (heredados) con fecha futura. */
  upcoming: Expense[];
  /** Ingresos extra con fecha futura. */
  upcomingExtras: Extra[];
};

export type ForecastInput = {
  expenses: Expense[];
  extras: Extra[];
  /** Monto de cada pago del ingreso fijo. */
  incomeCents: number;
  schedule: PaySchedule;
  /** Saldo de hoy, si el usuario lo declaró. */
  balance: number | null;
  /** Gastos fijos mensuales definidos en Configuración. */
  fixed: FixedExpense[];
  /** Meses omitidos de gastos fijos ("idDelFijo|AAAA-MM"). */
  fixedSkips: string[];
};

const dayNumber = (iso: string) => Math.round(dateFromISO(iso).getTime() / DAY);
const sum = (items: { amountCents: number }[]) =>
  items.reduce((total, item) => total + item.amountCents, 0);

/**
 * Proyección sencilla, explicable y prudente:
 * - Ritmo diario = media ponderada (decaimiento exponencial) de los últimos 90 días del
 *   historial, sin gastos fijos (esos se cuentan aparte).
 * - Gastos fijos: se cuentan por adelantado, una vez al mes, desde su siguiente fecha de
 *   pago; no si ese mes ya se pagó (el historial manda) o se omitió.
 * - Ingreso fijo: cuenta en sus próximos días de pago. Lo ya cobrado está en el historial.
 * - Ingresos extra: cuentan en su fecha, también los programados a futuro. Si uno no
 *   llega, se borra de Movimientos y deja de contar.
 * - Incertidumbre = variación día a día + incertidumbre del propio ritmo, que crece con el
 *   horizonte y baja con más historial.
 */
export function forecast(
  {
    expenses,
    extras,
    incomeCents,
    schedule,
    balance,
    fixed: fixedInput,
    fixedSkips,
  }: ForecastInput,
  now = new Date(),
  months = 6,
): Forecast | null {
  const todayKey = localISODate(now);
  const today = dayNumber(todayKey);
  const past = expenses.filter((item) => item.date <= todayKey);
  const fixed = validFixed(fixedInput);
  // Sin gastos todavía se puede proyectar si hay ingresos o saldo: el ritmo es cero.
  if (
    !past.length &&
    !extras.length &&
    !incomeCents &&
    balance === null &&
    !fixed.length
  )
    return null;

  const first = past.length
    ? Math.min(...past.map((item) => dayNumber(item.date)))
    : today;
  const days = Math.min(WINDOW_DAYS, today - first + 1);
  const daily = new Array<number>(days).fill(0);
  for (const item of past) {
    const age = today - dayNumber(item.date);
    if (!item.extraordinary && !paysFixed(item, fixed) && age < days)
      daily[age] += item.amountCents;
  }

  let weights = 0;
  let weightsSquared = 0;
  let weighted = 0;
  daily.forEach((amount, age) => {
    const weight = 0.5 ** (age / HALF_LIFE_DAYS);
    weights += weight;
    weightsSquared += weight * weight;
    weighted += weight * amount;
  });
  const rate = past.length ? weighted / weights : 0;
  const variance =
    daily.reduce(
      (total, amount, age) =>
        total + 0.5 ** (age / HALF_LIFE_DAYS) * (amount - rate) ** 2,
      0,
    ) / weights;
  const effectiveDays = (weights * weights) / weightsSquared;
  const spread = (horizon: number) =>
    Z80 *
    Math.sqrt(
      horizon * variance + (horizon * horizon * variance) / effectiveDays,
    );

  const upcoming = expenses
    .filter((item) => item.date > todayKey)
    .sort((a, b) => a.date.localeCompare(b.date));
  const upcomingExtras = extras
    .filter((item) => item.date > todayKey)
    .sort((a, b) => a.date.localeCompare(b.date));
  const prefixOf = (month: Date) => localISODate(month).slice(0, 7);
  const plannedIn = (month: Date) =>
    sum(upcoming.filter((item) => item.date.startsWith(prefixOf(month))));
  // Cada fijo cuenta una vez al mes desde su siguiente fecha de pago, salvo que ese mes
  // ya esté pagado (automático o a mano, con su monto real) u omitido.
  const fixedIn = (month: Date) => {
    const prefix = prefixOf(month);
    const skipped = new Set(fixedSkips);
    return fixed.reduce((total, item) => {
      if (
        !chargesOn(item, dueDate(item, prefix)) ||
        paidIn(item, prefix, past) ||
        skipped.has(skipKey(item.id, prefix))
      )
        return total;
      return total + item.amountCents;
    }, 0);
  };
  // Pagos del ingreso fijo que aún no llegan (los que ya llegaron están en el historial).
  const paydaysAhead = (month: Date) =>
    incomeCents
      ? paydaysIn(schedule, month).filter((date) => date > todayKey)
      : [];
  // Ingresos del mes: sueldo ya cobrado e ingresos extra (también los programados) + sueldos por venir.
  const incomeIn = (month: Date) =>
    sum(extras.filter((item) => item.date.startsWith(prefixOf(month)))) +
    paydaysAhead(month).length * incomeCents;

  const year = now.getFullYear();
  const month = now.getMonth();
  const thisMonth = new Date(year, month, 1);
  const remaining = new Date(year, month + 1, 0).getDate() - now.getDate();
  const spent = sum(
    past.filter((item) => item.date.startsWith(todayKey.slice(0, 7))),
  );
  const floor = spent + plannedIn(thisMonth) + fixedIn(thisMonth);
  const projected = floor + rate * remaining;
  const monthSpend = {
    value: Math.round(projected),
    low: Math.round(Math.max(floor, projected - spread(remaining))),
    high: Math.round(projected + spread(remaining)),
  };

  const savings: MonthPoint[] = [];
  let saved = 0;
  let horizon = remaining; // días proyectados acumulados: la incertidumbre crece con ellos
  for (let k = 0; k < months; k++) {
    const start = new Date(year, month + k, 1);
    const income = incomeIn(start);
    let spend = projected;
    if (k > 0) {
      const length = new Date(year, month + k + 1, 0).getDate();
      spend = rate * length + plannedIn(start) + fixedIn(start);
      horizon += length;
    }
    if (k === 0 && balance !== null) {
      // El saldo ya incluye lo cobrado y gastado hasta hoy: solo falta lo que viene.
      saved =
        balance +
        paydaysAhead(start).length * incomeCents +
        sum(
          upcomingExtras.filter((item) =>
            item.date.startsWith(prefixOf(start)),
          ),
        ) -
        (projected - spent);
    } else {
      saved += income - spend;
    }
    savings.push({
      month: start,
      income: Math.round(income),
      spend: Math.round(spend),
      net: Math.round(income - spend),
      value: Math.round(saved),
      low: Math.round(saved - spread(horizon)),
      high: Math.round(saved + spread(horizon)),
    });
  }

  return {
    rate: Math.round(rate),
    fixedMonthly: fixed.reduce((total, item) => total + item.amountCents, 0),
    monthSpend,
    savings,
    upcoming,
    upcomingExtras,
  };
}
