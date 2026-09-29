export const iconNames = [
  "utensils",
  "car",
  "house",
  "bag",
  "heart",
  "grid",
  "coffee",
  "plane",
  "game",
  "gift",
  "school",
  "gym",
  "pet",
  "shirt",
  "phone",
  "bolt",
  "film",
  "baby",
  "tool",
  "piggy",
] as const;
export type IconName = (typeof iconNames)[number];
export type Category = {
  id: string;
  name: string;
  color: string;
  icon: IconName;
};
export type CategoryId = string;

/** Categoría que no se puede borrar: recibe los gastos de las categorías eliminadas. */
export const FALLBACK_CATEGORY = "otros";
export const palette = [
  "#ee8664",
  "#8d9ed7",
  "#78b49a",
  "#d6a86c",
  "#b391c5",
  "#e87fa6",
  "#6fc3d6",
  "#c9c36b",
  "#f0a35e",
  "#a4aab4",
];
export const defaultCategories: Category[] = [
  { id: "comida", name: "Comida", color: "#ee8664", icon: "utensils" },
  { id: "transporte", name: "Transporte", color: "#8d9ed7", icon: "car" },
  { id: "hogar", name: "Hogar", color: "#78b49a", icon: "house" },
  { id: "compras", name: "Compras", color: "#d6a86c", icon: "bag" },
  { id: "salud", name: "Salud", color: "#b391c5", icon: "heart" },
  { id: FALLBACK_CATEGORY, name: "Otros", color: "#a4aab4", icon: "grid" },
];

export type Expense = {
  id: string;
  description: string;
  amountCents: number;
  category: CategoryId;
  date: string;
  note: string;
  // Marca heredada de versiones anteriores: no altera el ritmo de la proyección y
  // puede tener fecha futura. La interfaz ya no la ofrece al registrar.
  extraordinary?: boolean;
  /** Si el gasto es el pago automático de un gasto fijo, el id de ese fijo. */
  fixedId?: string | null;
};

/** Ingreso fuera del fijo (bono, venta, aguinaldo...). Puede tener fecha futura. */
export type Extra = {
  id: string;
  description: string;
  amountCents: number;
  date: string;
  note: string;
  /** Pago del ingreso fijo, registrado solo en su día de pago. */
  fixedIncome?: boolean;
};

export type Frequency = "mensual" | "quincenal" | "semanal";
/** Cuándo llega el ingreso fijo. En `days`, 0 significa "último día del mes". */
export type PaySchedule = {
  frequency: Frequency;
  days: number[];
  weekday: number;
};
export const defaultSchedule: PaySchedule = {
  frequency: "mensual",
  days: [1],
  weekday: 5,
};

/**
 * Saldo que el usuario declaró. `adjustCents` se calcula al guardarlo para que el saldo
 * de ese día coincida con lo escrito; desde ahí se suman pagos e ingresos y se restan gastos.
 */
export type BalanceAnchor = { date: string; adjustCents: number };

export type ChartType = "barras" | "linea";

/** Gasto que se paga cada mes (renta, internet, luz…). day 0 = último día del mes. */
export type FixedExpense = {
  id: string;
  name: string;
  amountCents: number;
  day: number;
  category: CategoryId;
  /** Fecha (AAAA-MM-DD) en que se agregó: solo se cobra en fechas de pago posteriores. */
  since: string;
};

export type Settings = {
  /** Monto de cada pago del ingreso fijo. */
  incomeCents: number;
  schedule: PaySchedule;
  balance: BalanceAnchor | null;
  chartType: ChartType;
  categories: Category[];
  fixed: FixedExpense[];
  /** Meses omitidos de gastos fijos, como "idDelFijo|AAAA-MM". */
  fixedSkips: string[];
  /** Fecha desde la que el ingreso fijo se registra solo como movimiento (pagos posteriores). */
  incomeSince: string | null;
};

type DesktopApi = {
  list_expenses(): Promise<Expense[]>;
  save_expense(expense: Expense): Promise<void>;
  update_expense(expense: Expense): Promise<void>;
  remove_expense(id: string): Promise<void>;
  get_settings(): Promise<Record<string, string>>;
  save_setting(key: string, value: string): Promise<void>;
  reassign_category(source: string, target: string): Promise<void>;
  list_extras(): Promise<Extra[]>;
  save_extra(extra: Extra): Promise<void>;
  update_extra(extra: Extra): Promise<void>;
  remove_extra(id: string): Promise<void>;
};

declare global {
  interface Window {
    pywebview?: { api: DesktopApi };
  }
}

const storageKey = "gastos:expenses:v1";
const settingsKey = "gastos:settings:v1";
const extrasKey = "gastos:extras:v1";
let desktopPromise: Promise<DesktopApi | null> | null = null;

// Dentro de pywebview el puente se inyecta poco después de cargar la página y
// avisa con "pywebviewready". En un navegador normal nunca llega: usamos localStorage.
function desktop() {
  if (!desktopPromise)
    desktopPromise = new Promise((resolve) => {
      if (window.pywebview?.api?.list_expenses)
        return resolve(window.pywebview.api);
      const timer = setTimeout(() => resolve(null), 1500);
      window.addEventListener(
        "pywebviewready",
        () => {
          clearTimeout(timer);
          resolve(window.pywebview?.api ?? null);
        },
        { once: true },
      );
    });
  return desktopPromise;
}

function browserExpenses(): Expense[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    return Array.isArray(value) ? (value as Expense[]) : [];
  } catch {
    return [];
  }
}

export async function listExpenses(): Promise<Expense[]> {
  const api = await desktop();
  return api ? api.list_expenses() : browserExpenses();
}

export async function saveExpense(expense: Expense): Promise<void> {
  const api = await desktop();
  if (api) return api.save_expense(expense);
  const current = browserExpenses();
  // Igual que en SQLite (INSERT OR IGNORE): un id repetido no se vuelve a guardar.
  if (current.some((item) => item.id === expense.id)) return;
  localStorage.setItem(storageKey, JSON.stringify([expense, ...current]));
}

export async function updateExpense(expense: Expense): Promise<void> {
  const api = await desktop();
  if (api) return api.update_expense(expense);
  localStorage.setItem(
    storageKey,
    JSON.stringify(
      browserExpenses().map((item) =>
        item.id === expense.id
          ? { ...item, ...expense, fixedId: item.fixedId }
          : item,
      ),
    ),
  );
}

export async function removeExpense(id: string): Promise<void> {
  const api = await desktop();
  if (api) return api.remove_expense(id);
  localStorage.setItem(
    storageKey,
    JSON.stringify(browserExpenses().filter((item) => item.id !== id)),
  );
}

function browserExtras(): Extra[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(extrasKey) ?? "[]");
    return Array.isArray(value) ? (value as Extra[]) : [];
  } catch {
    return [];
  }
}

export async function listExtras(): Promise<Extra[]> {
  const api = await desktop();
  return api ? api.list_extras() : browserExtras();
}

export async function saveExtra(extra: Extra): Promise<void> {
  const api = await desktop();
  if (api) return api.save_extra(extra);
  const current = browserExtras();
  if (current.some((item) => item.id === extra.id)) return;
  localStorage.setItem(extrasKey, JSON.stringify([extra, ...current]));
}

export async function updateExtra(extra: Extra): Promise<void> {
  const api = await desktop();
  if (api) return api.update_extra(extra);
  localStorage.setItem(
    extrasKey,
    JSON.stringify(
      browserExtras().map((item) => (item.id === extra.id ? extra : item)),
    ),
  );
}

export async function removeExtra(id: string): Promise<void> {
  const api = await desktop();
  if (api) return api.remove_extra(id);
  localStorage.setItem(
    extrasKey,
    JSON.stringify(browserExtras().filter((item) => item.id !== id)),
  );
}

function browserSettings(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(settingsKey) ?? "{}");
  } catch {
    return {};
  }
}

function parseCategories(raw: string | undefined): Category[] {
  let list = defaultCategories;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed) && parsed.length)
      list = parsed.filter(
        (item): item is Category =>
          typeof item?.id === "string" &&
          typeof item?.name === "string" &&
          typeof item?.color === "string" &&
          iconNames.includes(item?.icon),
      );
  } catch {
    // Configuración corrupta: se usan las categorías de fábrica.
  }
  return list.some((item) => item.id === FALLBACK_CATEGORY)
    ? list
    : [...list, defaultCategories[defaultCategories.length - 1]];
}

function parseJSON(raw: string | undefined): unknown {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function parseSchedule(raw: string | undefined): PaySchedule {
  const value = parseJSON(raw) as Partial<PaySchedule> | null;
  const frequency = value?.frequency;
  if (
    frequency !== "mensual" &&
    frequency !== "quincenal" &&
    frequency !== "semanal"
  )
    return defaultSchedule;
  const days = Array.isArray(value?.days)
    ? value.days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 31)
    : [];
  const weekday = Number(value?.weekday);
  return {
    frequency,
    days: days.length ? days : frequency === "quincenal" ? [15, 0] : [1],
    weekday:
      Number.isInteger(weekday) && weekday >= 0 && weekday <= 6 ? weekday : 5,
  };
}

function parseBalance(raw: string | undefined): BalanceAnchor | null {
  const value = parseJSON(raw) as Partial<BalanceAnchor> | null;
  return typeof value?.date === "string" && Number.isFinite(value?.adjustCents)
    ? { date: value.date, adjustCents: Number(value.adjustCents) }
    : null;
}

export async function loadSettings(): Promise<Settings> {
  const api = await desktop();
  const raw = api ? await api.get_settings() : browserSettings();
  const fixed = parseFixed(raw.fixed);
  // Si hubo que completar datos (fecha de alta con el formato anterior, categoría), se
  // guardan ya: la fecha de alta no debe recalcularse en cada apertura.
  if (raw.fixed && JSON.stringify(fixed) !== raw.fixed)
    void saveSetting("fixed", JSON.stringify(fixed));
  return {
    incomeCents: Number(raw.incomeCents) || 0,
    schedule: parseSchedule(raw.schedule),
    balance: parseBalance(raw.balance),
    chartType: raw.chartType === "linea" ? "linea" : "barras",
    categories: parseCategories(raw.categories),
    fixed,
    fixedSkips: parseSkips(raw.fixedSkips),
    incomeSince: /^\d{4}-\d{2}-\d{2}$/.test(raw.incomeSince ?? "")
      ? raw.incomeSince
      : null,
  };
}

async function saveSetting(key: string, value: string): Promise<void> {
  const api = await desktop();
  if (api) return api.save_setting(key, value);
  localStorage.setItem(
    settingsKey,
    JSON.stringify({ ...browserSettings(), [key]: value }),
  );
}

export const saveIncome = (cents: number) =>
  saveSetting("incomeCents", String(cents));
export const saveSchedule = (schedule: PaySchedule) =>
  saveSetting("schedule", JSON.stringify(schedule));
// Sin saldo se guarda "null": parseBalance lo lee como "no declarado".
export const saveBalance = (anchor: BalanceAnchor | null) =>
  saveSetting("balance", JSON.stringify(anchor));
export const saveChartType = (type: ChartType) =>
  saveSetting("chartType", type);
export const saveFixed = (list: FixedExpense[]) =>
  saveSetting("fixed", JSON.stringify(list));

function parseFixed(raw: string | undefined): FixedExpense[] {
  const value = parseJSON(raw);
  if (!Array.isArray(value)) return [];
  return (
    value
      .filter(
        (item): item is FixedExpense =>
          typeof item?.id === "string" &&
          typeof item?.name === "string" &&
          Number.isFinite(item?.amountCents) &&
          Number.isInteger(item?.day) &&
          item.day >= 0 &&
          item.day <= 31,
      )
      // Los fijos guardados antes de tener categoría van a "Otros".
      .map((item) => ({
        ...item,
        category:
          typeof item.category === "string" ? item.category : FALLBACK_CATEGORY,
        // Sin fecha válida (o con el formato anterior, solo mes): cuenta desde hoy, así
        // no se cobra hacia atrás.
        since:
          typeof item.since === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(item.since)
            ? item.since
            : localISODate(),
      }))
  );
}

function parseSkips(raw: string | undefined): string[] {
  const value = parseJSON(raw);
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
export const saveIncomeSince = (date: string) =>
  saveSetting("incomeSince", date);
export const saveFixedSkips = (skips: string[]) =>
  saveSetting("fixedSkips", JSON.stringify(skips));
export const saveCategories = (list: Category[]) =>
  saveSetting("categories", JSON.stringify(list));

export async function reassignCategory(
  source: string,
  target: string,
): Promise<void> {
  const api = await desktop();
  if (api) return api.reassign_category(source, target);
  localStorage.setItem(
    storageKey,
    JSON.stringify(
      browserExpenses().map((item) =>
        item.category === source ? { ...item, category: target } : item,
      ),
    ),
  );
}

export function formatMoney(cents: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function localISODate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateFromISO(value: string) {
  return new Date(`${value}T12:00:00`);
}
