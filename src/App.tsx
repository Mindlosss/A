import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  AnimatePresence,
  MotionConfig,
  motion,
  type Variants,
} from "motion/react";
import NumberFlow from "@number-flow/react";
import { Toaster, toast } from "sonner";
import {
  ArrowDownLeft,
  ArrowDownRight,
  ArrowUpRight,
  ChartColumn,
  ChartLine,
  Check,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Repeat,
  Search,
  Settings,
  Sparkles,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import {
  FALLBACK_CATEGORY,
  dateFromISO,
  defaultCategories,
  defaultSchedule,
  formatMoney,
  listExpenses,
  listExtras,
  loadSettings,
  localISODate,
  reassignCategory,
  removeExpense,
  removeExtra,
  saveBalance,
  saveCategories,
  saveChartType,
  saveFixed,
  saveFixedSkips,
  saveIncomeSince,
  updateExpense,
  updateExtra,
  saveExpense,
  saveExtra,
  saveIncome,
  saveSchedule,
  type BalanceAnchor,
  type Category,
  type CategoryId,
  type ChartType,
  type Expense,
  type Extra,
  type FixedExpense,
  type PaySchedule,
} from "./data";
import { LineChart } from "./charts";
import { ForecastView } from "./ForecastView";
import {
  anchorBalance,
  currentBalance,
  paycheckSkip,
  pendingPaychecks,
} from "./income";
import { findFixed, pendingFixedPayments, skipKey } from "./fixed";
import { CategoryIcon } from "./icons";
import { DatePicker } from "./pickers";
import { SettingsPanel } from "./SettingsPanel";
import { Glass, Switch, money, spring, tint } from "./ui";
import "./App.css";

type View = "historial" | "proyeccion";
type Kind = "gasto" | "ingreso";
type Period = "semana" | "mes" | "año";
type Range = { start: Date; end: Date };
type Bucket = {
  key: string;
  label: string;
  title: string;
  total: number;
  future: boolean;
  today: boolean;
  tick: boolean;
};

// Cambio de vista: el contenido sale hacia un lado y entra desde el otro, según la
// posición de la pestaña. El filtro vuelve a "none" al final porque cualquier filter
// en un ancestro anula el backdrop-filter de las tarjetas de vidrio.
const viewVariants: Variants = {
  enter: (direction: number) => ({
    opacity: 0,
    x: 32 * direction,
    filter: "blur(6px)",
  }),
  center: {
    opacity: 1,
    x: 0,
    filter: "blur(0px)",
    transition: { duration: 0.28, ease: [0.2, 0.8, 0.2, 1] },
    transitionEnd: { filter: "none" },
  },
  exit: (direction: number) => ({
    opacity: 0,
    x: -32 * direction,
    filter: "blur(6px)",
    transition: { duration: 0.16, ease: "easeIn" },
  }),
};

const views: { id: View; label: string }[] = [
  { id: "historial", label: "Historial" },
  { id: "proyeccion", label: "Proyección" },
];
const kinds: { id: Kind; label: string }[] = [
  { id: "gasto", label: "Gasto" },
  { id: "ingreso", label: "Ingreso extra" },
];
const chartTypes: { id: ChartType; label: string }[] = [
  { id: "barras", label: "Barras" },
  { id: "linea", label: "Línea" },
];
const periods: { id: Period; label: string }[] = [
  { id: "semana", label: "Semana" },
  { id: "mes", label: "Mes" },
  { id: "año", label: "Año" },
];
// En el periodo actual se compara contra el mismo tramo del anterior; en uno pasado, completo.
const previousPhrase: Record<Period, [current: string, past: string]> = {
  semana: ["a estas alturas de la semana pasada", "la semana anterior"],
  mes: ["a estas alturas del mes pasado", "el mes anterior"],
  año: ["a estas alturas del año pasado", "el año anterior"],
};

const format = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("es-MX", options);
const weekdayShort = format({ weekday: "short" });
const monthShort = format({ month: "short" });
const monthLong = format({ month: "long" });
const monthYear = format({ month: "long", year: "numeric" });
const dayMonth = format({ day: "numeric", month: "short" });
const dayLong = format({ weekday: "long", day: "numeric", month: "long" });
const clean = (value: string) => value.replace(".", "");

const sum = (items: { amountCents: number }[]) =>
  items.reduce((total, item) => total + item.amountCents, 0);

function addDays(date: Date, days: number) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() + days);
  return result;
}

function periodRange(period: Period, now: Date, offset = 0): Range {
  const year = now.getFullYear();
  const month = now.getMonth();
  if (period === "semana") {
    const start = addDays(now, -((now.getDay() + 6) % 7) + offset * 7);
    return { start, end: addDays(start, 7) };
  }
  if (period === "mes")
    return {
      start: new Date(year, month + offset, 1),
      end: new Date(year, month + offset + 1, 1),
    };
  return {
    start: new Date(year + offset, 0, 1),
    end: new Date(year + offset + 1, 0, 1),
  };
}

const daysBetween = (start: Date, end: Date) =>
  Math.round((end.getTime() - start.getTime()) / 86_400_000);

const inRange = (item: { date: string }, range: Range) => {
  const date = dateFromISO(item.date);
  return date >= range.start && date < range.end;
};

function buildBuckets(
  period: Period,
  range: Range,
  items: Expense[],
  now: Date,
): Bucket[] {
  const todayKey = localISODate(now);
  if (period === "año")
    return Array.from({ length: 12 }, (_, month) => {
      const first = new Date(range.start.getFullYear(), month, 1);
      const prefix = localISODate(first).slice(0, 7);
      return {
        key: prefix,
        label: clean(monthShort.format(first)),
        title: monthLong.format(first),
        total: sum(items.filter((item) => item.date.startsWith(prefix))),
        future: first > now,
        today: todayKey.startsWith(prefix),
        tick: true,
      };
    });
  return Array.from({ length: daysBetween(range.start, range.end) }, (_, i) => {
    const day = addDays(range.start, i);
    const key = localISODate(day);
    return {
      key,
      label:
        period === "semana"
          ? clean(weekdayShort.format(day))
          : String(day.getDate()),
      title: dayLong.format(day),
      total: sum(items.filter((item) => item.date === key)),
      future: key > todayKey,
      today: key === todayKey,
      tick: period === "semana" || i === 0 || (i + 1) % 5 === 0,
    };
  });
}

function periodTitle(period: Period, range: Range, offset: number, now: Date) {
  if (period === "semana") {
    if (offset === 0) return "Esta semana";
    if (offset === -1) return "Semana pasada";
    return clean(
      `${dayMonth.format(range.start)} – ${dayMonth.format(addDays(range.end, -1))}`,
    );
  }
  if (period === "mes")
    return range.start.getFullYear() === now.getFullYear()
      ? monthLong.format(range.start)
      : monthYear.format(range.start);
  return String(range.start.getFullYear());
}

function dayName(iso: string) {
  const today = new Date();
  if (iso === localISODate(today)) return "Hoy";
  if (iso === localISODate(addDays(today, -1))) return "Ayer";
  return dayLong.format(dateFromISO(iso));
}

function Bars({
  buckets,
  active,
  onActive,
  onPick,
  color,
}: {
  buckets: Bucket[];
  active: number | null;
  onActive: (index: number | null) => void;
  onPick?: (index: number) => void;
  color: string;
}) {
  const max = Math.max(1, ...buckets.map((bucket) => bucket.total));
  return (
    <div
      className={`bars ${active === null ? "" : "scrubbing"} ${onPick ? "pickable" : ""}`}
      style={tint(color)}
      onPointerLeave={() => onActive(null)}
    >
      {buckets.map((bucket, index) => (
        <button
          type="button"
          key={bucket.key}
          className={[
            "bar-slot",
            bucket.tick && "tick",
            bucket.today && "today",
            active === index && "active",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-label={`${bucket.title}: ${formatMoney(bucket.total)}`}
          onPointerEnter={() => onActive(index)}
          onClick={onPick && !bucket.future ? () => onPick(index) : undefined}
          onFocus={() => onActive(index)}
          onBlur={() => onActive(null)}
        >
          <span className="bar-track">
            <motion.span
              className={`bar ${bucket.total ? "" : "zero"}`}
              initial={{ height: "0%" }}
              animate={{
                height: bucket.total
                  ? `${Math.max(4, (bucket.total / max) * 100)}%`
                  : "0%",
                opacity: active === null || active === index ? 1 : 0.35,
              }}
              transition={{ type: "spring", stiffness: 260, damping: 28 }}
            />
          </span>
          <span className="bar-label">{bucket.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Movimiento que se está editando en el formulario. */
type Editing =
  { kind: "gasto"; item: Expense } | { kind: "ingreso"; item: Extra };

function QuickAdd({
  categories,
  fixed,
  editing,
  onClose,
  onSave,
  onSaveExtra,
}: {
  categories: Category[];
  /** Si el concepto es un gasto fijo, se elige su categoría (salvo que el usuario ya eligiera). */
  fixed: FixedExpense[];
  /** Si viene, el formulario abre con ese movimiento para corregirlo. */
  editing: Editing | null;
  onClose: () => void;
  onSave: (expense: Expense, isEdit: boolean) => Promise<void>;
  onSaveExtra: (extra: Extra, isEdit: boolean) => Promise<void>;
}) {
  const [kind, setKind] = useState<Kind>(editing?.kind ?? "gasto");
  const today = localISODate();
  const yesterday = localISODate(addDays(new Date(), -1));
  const [amount, setAmount] = useState(
    editing ? String(editing.item.amountCents / 100) : "",
  );
  const [description, setDescription] = useState(
    editing?.item.description ?? "",
  );
  const [category, setCategory] = useState<CategoryId>(
    editing?.kind === "gasto"
      ? editing.item.category
      : (categories[0]?.id ?? FALLBACK_CATEGORY),
  );
  const [categoryChosen, setCategoryChosen] = useState(!!editing);
  const [date, setDate] = useState(editing?.item.date ?? today);
  const [note, setNote] = useState(editing?.item.note ?? "");
  const [saving, setSaving] = useState(false);
  const cents = Math.round(Number(amount.replace(",", ".")) * 100);
  const income = kind === "ingreso";
  // Solo un ingreso extra puede programarse a futuro (un bono, el aguinaldo).
  const valid =
    description.trim() !== "" &&
    Number.isFinite(cents) &&
    cents > 0 &&
    !!date &&
    (income || date <= today);

  function chooseKind(value: Kind) {
    setKind(value);
    if (value === "gasto" && date > today) setDate(today);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    const base = {
      id: editing?.item.id ?? crypto.randomUUID(),
      description: description.trim(),
      amountCents: cents,
      date,
      note: note.trim(),
    };
    try {
      if (income) await onSaveExtra(base, !!editing);
      else
        await onSave(
          {
            ...base,
            category,
            fixedId:
              editing?.kind === "gasto" ? editing.item.fixedId : undefined,
          },
          !!editing,
        );
      onClose();
    } catch {
      toast.error(
        income
          ? "No se pudo guardar el ingreso"
          : "No se pudo guardar el gasto",
      );
      setSaving(false);
    }
  }

  return (
    <form className={`quick ${kind}`} onSubmit={submit}>
      {editing ? (
        <p className="quick-title">
          Editar {editing.kind === "gasto" ? "gasto" : "ingreso extra"}
        </p>
      ) : (
        <Switch
          id="kind-pill"
          small
          options={kinds}
          value={kind}
          onChange={chooseKind}
        />
      )}
      <div className="quick-main">
        <label className="quick-amount">
          <span>$</span>
          <input
            autoFocus
            inputMode="decimal"
            placeholder="0"
            aria-label="Monto"
            value={amount}
            style={{ width: `${Math.max(1, amount.length) + 0.4}ch` }}
            onChange={(event) =>
              setAmount(event.target.value.replace(/[^\d.,]/g, ""))
            }
          />
        </label>
        <input
          className="quick-desc"
          placeholder={income ? "¿De dónde? (bono, venta…)" : "¿En qué?"}
          aria-label="Concepto"
          maxLength={80}
          value={description}
          onChange={(event) => {
            setDescription(event.target.value);
            const match = findFixed(event.target.value, fixed);
            if (
              !categoryChosen &&
              match &&
              categories.some((item) => item.id === match.category)
            )
              setCategory(match.category);
          }}
        />
      </div>
      {income ? (
        <p className="quick-hint">
          Se suma a tu dinero en su fecha. Puedes programarlo a futuro, como el
          aguinaldo.
        </p>
      ) : (
        <div className="quick-cats" role="radiogroup" aria-label="Categoría">
          {categories.map((item) => (
            <button
              type="button"
              role="radio"
              aria-checked={category === item.id}
              key={item.id}
              className="quick-cat"
              style={tint(item.color)}
              onClick={() => {
                setCategory(item.id);
                setCategoryChosen(true);
              }}
            >
              {category === item.id && (
                <motion.span
                  layoutId="category-pill"
                  className="quick-cat-pill"
                  transition={spring}
                />
              )}
              <CategoryIcon icon={item.icon} size={15} />
              <span>{item.name}</span>
            </button>
          ))}
        </div>
      )}
      <div className="quick-foot">
        <Switch
          id="date-pill"
          small
          options={[
            { id: today, label: "Hoy" },
            { id: yesterday, label: "Ayer" },
          ]}
          value={date === today || date === yesterday ? date : null}
          onChange={setDate}
        />
        <DatePicker
          value={date}
          max={income ? undefined : today}
          onChange={setDate}
        />
        <input
          className="quick-note"
          placeholder="Nota"
          aria-label="Nota"
          maxLength={240}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        <button
          type="button"
          className="icon-btn"
          onClick={onClose}
          aria-label="Cerrar"
        >
          <X size={18} />
        </button>
        <button
          className="save"
          disabled={!valid || saving}
          aria-label="Guardar"
        >
          <Check size={20} />
        </button>
      </div>
    </form>
  );
}

function App() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("mes");
  const [offset, setOffset] = useState(0);
  const [income, setIncome] = useState(0);
  const [schedule, setSchedule] = useState<PaySchedule>(defaultSchedule);
  const [anchor, setAnchor] = useState<BalanceAnchor | null>(null);
  const [chartType, setChartType] = useState<ChartType>("barras");
  const [categories, setCategories] = useState<Category[]>(defaultCategories);
  const [view, setView] = useState<View>("historial");
  const direction = view === "proyeccion" ? 1 : -1;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fixed, setFixed] = useState<FixedExpense[]>([]);
  const [fixedSkips, setFixedSkips] = useState<string[]>([]);
  const [incomeSince, setIncomeSince] = useState<string | null>(null);
  const [category, setCategory] = useState<CategoryId | null>(null);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const now = new Date();
  const todayKey = localISODate(now);

  async function refresh() {
    const [items, incomes] = await Promise.all([listExpenses(), listExtras()]);
    setExpenses(
      items.sort(
        (a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id),
      ),
    );
    setExtras(incomes);
  }

  useEffect(() => {
    Promise.all([
      refresh(),
      loadSettings().then((settings) => {
        setIncome(settings.incomeCents);
        setSchedule(settings.schedule);
        setAnchor(settings.balance);
        setChartType(settings.chartType);
        setFixed(settings.fixed);
        setFixedSkips(settings.fixedSkips);
        // El sueldo se registra como movimiento desde ahora (o desde que se declaró el
        // saldo, que ya lo incluía): así no se generan pagos hacia atrás.
        const since =
          settings.incomeSince ?? settings.balance?.date ?? localISODate();
        setIncomeSince(since);
        if (!settings.incomeSince) void saveIncomeSince(since);
        setCategories(settings.categories);
      }),
    ])
      .catch(() => toast.error("No se pudieron cargar los gastos"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeForm();
        setSettingsOpen(false);
        return;
      }
      const typing =
        event.target instanceof HTMLElement &&
        event.target.matches("input, textarea, select");
      if (
        typing ||
        settingsOpen ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return;
      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        setAdding(true);
      } else if (view !== "historial") {
        return;
      } else if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (event.key === "ArrowLeft") {
        setOffset((value) => value - 1);
      } else if (event.key === "ArrowRight") {
        setOffset((value) => Math.min(0, value + 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, settingsOpen]);

  const categoryOf = (id: CategoryId) =>
    categories.find((item) => item.id === id) ??
    categories.find((item) => item.id === FALLBACK_CATEGORY) ??
    defaultCategories[defaultCategories.length - 1];
  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const item of expenses)
      result[item.category] = (result[item.category] ?? 0) + 1;
    return result;
  }, [expenses]);

  useEffect(() => setActive(null), [period, category, offset]);

  function choosePeriod(value: Period) {
    setPeriod(value);
    setOffset(0);
  }

  const range = useMemo(
    () => periodRange(period, now, offset),
    [period, offset, todayKey],
  );
  // Los gastos con fecha futura (extraordinarios programados) solo cuentan en la proyección.
  const inPeriod = useMemo(
    () =>
      expenses.filter((item) => item.date <= todayKey && inRange(item, range)),
    [expenses, range],
  );
  const scoped = category
    ? inPeriod.filter((item) => item.category === category)
    : inPeriod;
  const total = sum(scoped);
  const periodExtras = useMemo(
    () =>
      extras.filter((item) => item.date <= todayKey && inRange(item, range)),
    [extras, range],
  );
  const extrasTotal = sum(periodExtras);
  const balance = useMemo(
    () => currentBalance(anchor, expenses, extras, todayKey),
    [anchor, expenses, extras, todayKey],
  );

  const elapsed = Math.max(
    1,
    daysBetween(
      range.start,
      new Date(Math.min(addDays(now, 1).getTime(), range.end.getTime())),
    ),
  );
  const average = Math.round(total / elapsed);

  const previous = periodRange(period, now, offset - 1);
  const previousTotal = sum(
    expenses.filter(
      (item) =>
        (!category || item.category === category) &&
        inRange(item, {
          start: previous.start,
          end:
            offset === 0
              ? new Date(
                  Math.min(
                    addDays(previous.start, elapsed).getTime(),
                    previous.end.getTime(),
                  ),
                )
              : previous.end,
        }),
    ),
  );
  const change = previousTotal
    ? Math.round(((total - previousTotal) / previousTotal) * 100)
    : null;

  const buckets = useMemo(
    () => buildBuckets(period, range, scoped, now),
    [period, range, scoped, todayKey],
  );
  const categoryTotals = categories
    .map((item) => ({
      ...item,
      total: sum(inPeriod.filter((expense) => expense.category === item.id)),
    }))
    .filter((item) => item.total > 0)
    .sort((a, b) => b.total - a.total);
  const periodTotal = sum(inPeriod);

  const query = search.trim().toLowerCase();
  const monthSummary =
    period === "año"
      ? buckets
          .map((bucket, index) => ({
            ...bucket,
            index,
            count: scoped.filter((item) => item.date.startsWith(bucket.key))
              .length,
          }))
          .filter((month) => month.count > 0)
          .reverse()
      : [];
  const biggestMonth = Math.max(1, ...monthSummary.map((month) => month.total));

  function openMonth(index: number) {
    setPeriod("mes");
    setOffset(
      (range.start.getFullYear() - now.getFullYear()) * 12 +
        index -
        now.getMonth(),
    );
  }

  // Los ingresos extra se listan junto a los gastos, salvo al filtrar por categoría.
  const groups = useMemo(() => {
    const byDay = new Map<string, { items: Expense[]; incomes: Extra[] }>();
    const matches = (item: { description: string; note: string }) =>
      !query ||
      `${item.description} ${item.note}`.toLowerCase().includes(query);
    const slot = (date: string) => {
      let group = byDay.get(date);
      if (!group) byDay.set(date, (group = { items: [], incomes: [] }));
      return group;
    };
    for (const item of scoped)
      if (matches(item)) slot(item.date).items.push(item);
    if (!category)
      for (const item of periodExtras)
        if (matches(item)) slot(item.date).incomes.push(item);
    return [...byDay]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, group]) => ({ date, ...group, total: sum(group.items) }));
  }, [scoped, periodExtras, category, query]);

  const scrub = active === null ? null : buckets[active];
  const selected = category ? categoryOf(category) : null;
  const heroLabel = [
    scrub ? scrub.title : periodTitle(period, range, offset, now),
    selected?.name,
  ]
    .filter(Boolean)
    .join(" · ");

  // Registra en Movimientos lo que ya llegó: los cobros de gastos fijos y los pagos del
  // ingreso fijo (sin duplicar ni tocar lo ya registrado a mano u omitido).
  useEffect(() => {
    if (loading) return;
    const charges = pendingFixedPayments(fixed, expenses, fixedSkips);
    const paychecks = pendingPaychecks(
      income,
      schedule,
      incomeSince,
      extras,
      fixedSkips,
      todayKey,
    );
    if (!charges.length && !paychecks.length) return;
    Promise.all([...charges.map(saveExpense), ...paychecks.map(saveExtra)])
      .then(refresh)
      .catch(() =>
        toast.error("No se pudieron registrar los movimientos fijos"),
      );
  }, [
    loading,
    fixed,
    fixedSkips,
    expenses,
    extras,
    income,
    schedule,
    incomeSince,
  ]);

  function updateSkips(change: (skips: string[]) => string[]) {
    setFixedSkips((current) => {
      const next = change(current);
      saveFixedSkips(next).catch(() =>
        toast.error("No se pudo guardar el mes omitido"),
      );
      return next;
    });
  }
  function closeForm() {
    setAdding(false);
    setEditing(null);
  }
  function startEdit(value: Editing) {
    setEditing(value);
    setAdding(true);
  }

  async function addExpense(expense: Expense, isEdit = false) {
    if (isEdit) await updateExpense(expense);
    else await saveExpense(expense);
    await refresh();
    if (isEdit)
      toast("Gasto actualizado", { description: expense.description });
  }
  async function deleteExpense(expense: Expense) {
    // Borrar un pago de un fijo (el automático o uno registrado a mano con su nombre)
    // = ese mes no se pagó: se omite, y así el cobro automático no lo vuelve a crear.
    const owner =
      expense.fixedId ?? findFixed(expense.description, fixed)?.id ?? null;
    const skip = owner ? skipKey(owner, expense.date.slice(0, 7)) : null;
    try {
      if (skip) updateSkips((skips) => [...skips, skip]);
      await removeExpense(expense.id);
      await refresh();
      toast(skip ? "Omitido este mes" : "Gasto eliminado", {
        description: skip
          ? `${expense.description} · no se cobrará este mes`
          : expense.description,
        action: {
          label: "Deshacer",
          onClick: () => {
            if (skip)
              updateSkips((skips) => skips.filter((item) => item !== skip));
            void addExpense(expense);
          },
        },
      });
    } catch {
      toast.error("No se pudo eliminar el gasto");
    }
  }
  async function addExtra(extra: Extra, isEdit = false, announce = !isEdit) {
    if (isEdit) await updateExtra(extra);
    else await saveExtra(extra);
    await refresh();
    if (isEdit)
      toast("Ingreso actualizado", { description: extra.description });
    // El historial solo muestra hasta hoy: un ingreso a futuro vive en Proyección.
    if (announce && extra.date > todayKey)
      toast("Ingreso programado", {
        description: `${extra.description} · ${clean(dayMonth.format(dateFromISO(extra.date)))}`,
        action: { label: "Ver", onClick: () => setView("proyeccion") },
      });
  }
  async function deleteExtra(extra: Extra) {
    // Borrar un pago del ingreso fijo = no llegó: se omite y no se vuelve a registrar.
    const skip = extra.fixedIncome ? paycheckSkip(extra.date) : null;
    try {
      if (skip) updateSkips((skips) => [...skips, skip]);
      await removeExtra(extra.id);
      await refresh();
      toast(skip ? "Pago omitido" : "Ingreso eliminado", {
        description: skip
          ? `${extra.description} · no se contará este pago`
          : extra.description,
        action: {
          label: "Deshacer",
          onClick: () => {
            if (skip)
              updateSkips((skips) => skips.filter((item) => item !== skip));
            void addExtra(extra, false, false);
          },
        },
      });
    } catch {
      toast.error("No se pudo eliminar el ingreso");
    }
  }
  // Cambiar el monto o el calendario del sueldo aplica a los pagos siguientes: no se
  // generan pagos hacia atrás con las reglas nuevas.
  async function restartPaychecks() {
    await saveIncomeSince(todayKey);
    setIncomeSince(todayKey);
  }
  async function changeIncome(cents: number) {
    try {
      await restartPaychecks();
      await saveIncome(cents);
      setIncome(cents);
    } catch {
      toast.error("No se pudo guardar el ingreso");
    }
  }
  async function changeSchedule(next: PaySchedule) {
    try {
      await restartPaychecks();
      await saveSchedule(next);
      setSchedule(next);
    } catch {
      toast.error("No se pudo guardar el día de pago");
    }
  }
  async function changeBalance(cents: number | null) {
    try {
      const next =
        cents === null
          ? null
          : anchorBalance(cents, expenses, extras, todayKey);
      await saveBalance(next);
      setAnchor(next);
    } catch {
      toast.error("No se pudo guardar tu dinero actual");
    }
  }
  function changeChartType(type: ChartType) {
    setChartType(type);
    saveChartType(type).catch(() =>
      toast.error("No se pudo guardar el tipo de gráfica"),
    );
  }
  function changeFixed(list: FixedExpense[]) {
    setFixed(list);
    saveFixed(list).catch(() =>
      toast.error("No se pudieron guardar los gastos fijos"),
    );
  }
  function changeCategories(list: Category[]) {
    setCategories(list);
    saveCategories(list).catch(() =>
      toast.error("No se pudieron guardar las categorías"),
    );
  }
  async function removeCategory(id: string) {
    try {
      if (counts[id]) await reassignCategory(id, FALLBACK_CATEGORY);
      if (fixed.some((item) => item.category === id))
        changeFixed(
          fixed.map((item) =>
            item.category === id
              ? { ...item, category: FALLBACK_CATEGORY }
              : item,
          ),
        );
      if (category === id) setCategory(null);
      changeCategories(categories.filter((item) => item.id !== id));
      await refresh();
    } catch {
      toast.error("No se pudo eliminar la categoría");
    }
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="aurora" aria-hidden>
        <span className="a1" style={{ backgroundColor: selected?.color }} />
        <span className="a2" />
        <span className="a3" />
      </div>
      <div className="grain" aria-hidden />

      <main className="page fit">
        <header className="top">
          <span className="brand">Gastos</span>
          <Switch
            id="view-pill"
            options={views}
            value={view}
            onChange={setView}
          />
          <div className="top-end">
            <button
              type="button"
              className={`balance ${balance !== null && balance < 0 ? "neg" : ""}`}
              title={
                balance === null
                  ? "Indica cuánto dinero tienes"
                  : "Tu dinero hoy: saldo declarado más pagos e ingresos, menos gastos"
              }
              onClick={() => setSettingsOpen(true)}
            >
              <Wallet size={16} />
              {balance === null ? (
                "¿Cuánto tienes?"
              ) : (
                <NumberFlow
                  value={balance / 100}
                  format={money}
                  locales="es-MX"
                />
              )}
            </button>
            <button
              type="button"
              className="gear"
              aria-label="Configuración"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings size={19} />
            </button>
          </div>
        </header>

        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.div
            key={view}
            className="view"
            custom={direction}
            variants={viewVariants}
            initial="enter"
            animate="center"
            exit="exit"
          >
            {view === "proyeccion" ? (
              !loading && (
                <ForecastView
                  expenses={expenses}
                  extras={extras}
                  income={income}
                  schedule={schedule}
                  balance={balance}
                  fixed={fixed}
                  fixedSkips={fixedSkips}
                  onDelete={deleteExpense}
                  onDeleteExtra={deleteExtra}
                  onOpenSettings={() => setSettingsOpen(true)}
                />
              )
            ) : (
              <>
                <section className="hero">
                  <div className="hero-row">
                    <div className="hero-nav">
                      <button
                        type="button"
                        className="nav-arrow"
                        aria-label="Periodo anterior"
                        onClick={() => setOffset(offset - 1)}
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.p
                          key={heroLabel}
                          className="hero-label"
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.15 }}
                        >
                          {heroLabel}
                        </motion.p>
                      </AnimatePresence>
                      <button
                        type="button"
                        className="nav-arrow"
                        aria-label="Periodo siguiente"
                        disabled={offset === 0}
                        onClick={() => setOffset(offset + 1)}
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                    <Switch
                      id="period-pill"
                      small
                      options={periods}
                      value={period}
                      onChange={choosePeriod}
                    />
                  </div>
                  <h1 className="hero-total">
                    <NumberFlow
                      value={(scrub ? scrub.total : total) / 100}
                      format={money}
                      locales="es-MX"
                    />
                  </h1>
                  <div className={`hero-meta ${scrub ? "dim" : ""}`}>
                    {change !== null && (
                      <span className={`pill ${change > 0 ? "up" : "down"}`}>
                        {change > 0 ? (
                          <ArrowUpRight size={16} />
                        ) : (
                          <ArrowDownRight size={16} />
                        )}
                        {change === 0
                          ? `Igual que ${previousPhrase[period][offset === 0 ? 0 : 1]}`
                          : `${Math.abs(change)}% ${change > 0 ? "más" : "menos"} que ${previousPhrase[period][offset === 0 ? 0 : 1]}`}
                      </span>
                    )}
                    <span className="pill">
                      <NumberFlow
                        value={average / 100}
                        format={money}
                        locales="es-MX"
                      />
                      al día
                    </span>
                    {!category && extrasTotal > 0 && (
                      <span className="pill plus">
                        <ArrowDownLeft size={16} />
                        {formatMoney(extrasTotal)} en ingresos
                      </span>
                    )}
                  </div>
                </section>

                <div className="board">
                  <div className="board-main">
                    <Glass className="chart fill-card">
                      <header className="card-head">
                        <p className="card-label">
                          {period === "año" ? "Por mes" : "Por día"}
                        </p>
                        <div
                          className="chart-type"
                          role="radiogroup"
                          aria-label="Tipo de gráfica"
                        >
                          {chartTypes.map((option) => (
                            <button
                              type="button"
                              role="radio"
                              key={option.id}
                              aria-checked={chartType === option.id}
                              aria-label={option.label}
                              title={option.label}
                              onClick={() => changeChartType(option.id)}
                            >
                              {chartType === option.id && (
                                <motion.span
                                  layoutId="chart-type-pill"
                                  className="switch-pill"
                                  transition={spring}
                                />
                              )}
                              {option.id === "barras" ? (
                                <ChartColumn size={16} />
                              ) : (
                                <ChartLine size={16} />
                              )}
                            </button>
                          ))}
                        </div>
                      </header>
                      <div className="chart-body">
                        {chartType === "linea" ? (
                          <LineChart
                            className="history-line"
                            area
                            points={buckets.map((bucket) => ({
                              key: bucket.key,
                              value: bucket.total,
                              label: bucket.label,
                              aria: `${bucket.title}: ${formatMoney(bucket.total)}`,
                              tick: bucket.tick || bucket.today,
                              future: bucket.future,
                            }))}
                            active={active}
                            onActive={setActive}
                            onPick={period === "año" ? openMonth : undefined}
                            color={selected?.color ?? "#b9a6ff"}
                          />
                        ) : (
                          <Bars
                            buckets={buckets}
                            active={active}
                            onActive={setActive}
                            onPick={period === "año" ? openMonth : undefined}
                            color={selected?.color ?? "#b9a6ff"}
                          />
                        )}
                      </div>
                      {categoryTotals.length > 0 && (
                        <div className="cats">
                          <div
                            className={`cat-bar ${category ? "filtering" : ""}`}
                          >
                            {categoryTotals.map((item) => (
                              <span
                                key={item.id}
                                className={category === item.id ? "on" : ""}
                                style={{
                                  ...tint(item.color),
                                  flexGrow: item.total,
                                }}
                              />
                            ))}
                          </div>
                          <div className="cat-chips">
                            {categoryTotals.map((item) => (
                              <button
                                type="button"
                                key={item.id}
                                className={`cat-chip ${category === item.id ? "on" : ""}`}
                                style={tint(item.color)}
                                aria-pressed={category === item.id}
                                onClick={() =>
                                  setCategory(
                                    category === item.id ? null : item.id,
                                  )
                                }
                              >
                                <i />
                                {item.name}
                                <b>
                                  {Math.round((item.total / periodTotal) * 100)}
                                  %
                                </b>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </Glass>
                  </div>

                  <div className="board-side fill">
                    <Glass className="ledger">
                      <header className="ledger-head">
                        <h2>Movimientos</h2>
                        <label className="search">
                          <Search size={16} />
                          <input
                            ref={searchRef}
                            value={search}
                            placeholder="Buscar"
                            aria-label="Buscar gasto o nota"
                            onChange={(event) => setSearch(event.target.value)}
                          />
                          <kbd>/</kbd>
                        </label>
                      </header>
                      <div className="ledger-scroll">
                        {!loading &&
                          (period === "año" && !query && monthSummary.length ? (
                            <div className="months">
                              {monthSummary.map((month) => (
                                <button
                                  type="button"
                                  key={month.key}
                                  className="month-row"
                                  onClick={() => openMonth(month.index)}
                                >
                                  <span className="month-name">
                                    {month.title}
                                  </span>
                                  <span className="month-count">
                                    {month.count}{" "}
                                    {month.count === 1 ? "gasto" : "gastos"}
                                  </span>
                                  <span
                                    className="month-meter"
                                    style={tint(selected?.color ?? "#b9a6ff")}
                                  >
                                    <i
                                      style={{
                                        width: `${(month.total / biggestMonth) * 100}%`,
                                      }}
                                    />
                                  </span>
                                  <span className="row-amount">
                                    {formatMoney(month.total)}
                                  </span>
                                  <ChevronRight
                                    size={16}
                                    className="month-go"
                                  />
                                </button>
                              ))}
                            </div>
                          ) : groups.length ? (
                            groups.map((group) => (
                              <div className="day" key={group.date}>
                                <div className="day-head">
                                  <span>{dayName(group.date)}</span>
                                  {group.items.length > 1 && (
                                    <span>{formatMoney(group.total)}</span>
                                  )}
                                </div>
                                <AnimatePresence initial={false}>
                                  {group.incomes.map((extra) => (
                                    <motion.div
                                      key={extra.id}
                                      className="row"
                                      initial={{ opacity: 0, height: 0 }}
                                      animate={{ opacity: 1, height: "auto" }}
                                      exit={{ opacity: 0, height: 0 }}
                                      transition={{ duration: 0.25 }}
                                    >
                                      <div className="row-inner">
                                        <span
                                          className="cat-icon"
                                          style={tint("#7fd8b5")}
                                          title={
                                            extra.fixedIncome
                                              ? "Ingreso fijo"
                                              : "Ingreso extra"
                                          }
                                        >
                                          <ArrowDownLeft size={18} />
                                        </span>
                                        <div className="row-text">
                                          <strong>
                                            {extra.description}
                                            {extra.fixedIncome && (
                                              <Repeat
                                                size={13}
                                                className="extra-mark"
                                                aria-label="Ingreso fijo"
                                              />
                                            )}
                                          </strong>
                                          {(extra.note ||
                                            !extra.fixedIncome) && (
                                            <span>
                                              {extra.note || "Ingreso extra"}
                                            </span>
                                          )}
                                        </div>
                                        <span className="row-amount plus">
                                          +{formatMoney(extra.amountCents)}
                                        </span>
                                        <button
                                          type="button"
                                          className="row-delete row-edit"
                                          aria-label={`Editar ${extra.description}`}
                                          onClick={() =>
                                            startEdit({
                                              kind: "ingreso",
                                              item: extra,
                                            })
                                          }
                                        >
                                          <Pencil size={15} />
                                        </button>
                                        <button
                                          type="button"
                                          className="row-delete"
                                          aria-label={`Eliminar ${extra.description}`}
                                          onClick={() =>
                                            void deleteExtra(extra)
                                          }
                                        >
                                          <Trash2 size={16} />
                                        </button>
                                      </div>
                                    </motion.div>
                                  ))}
                                  {group.items.map((expense) => {
                                    const item = categoryOf(expense.category);
                                    return (
                                      <motion.div
                                        key={expense.id}
                                        className="row"
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: "auto" }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.25 }}
                                      >
                                        <div className="row-inner">
                                          <span
                                            className="cat-icon"
                                            style={tint(item.color)}
                                            title={item.name}
                                          >
                                            <CategoryIcon icon={item.icon} />
                                          </span>
                                          <div className="row-text">
                                            <strong>
                                              {expense.description}
                                              {expense.fixedId && (
                                                <Repeat
                                                  size={13}
                                                  className="extra-mark"
                                                  aria-label="Gasto fijo"
                                                />
                                              )}
                                              {expense.extraordinary && (
                                                <Sparkles
                                                  size={13}
                                                  className="extra-mark"
                                                  aria-label="Extraordinario"
                                                />
                                              )}
                                            </strong>
                                            {expense.note && (
                                              <span>{expense.note}</span>
                                            )}
                                          </div>
                                          <span className="row-amount">
                                            {formatMoney(expense.amountCents)}
                                          </span>
                                          <button
                                            type="button"
                                            className="row-delete row-edit"
                                            aria-label={`Editar ${expense.description}`}
                                            onClick={() =>
                                              startEdit({
                                                kind: "gasto",
                                                item: expense,
                                              })
                                            }
                                          >
                                            <Pencil size={15} />
                                          </button>
                                          <button
                                            type="button"
                                            className="row-delete"
                                            aria-label={`Eliminar ${expense.description}`}
                                            onClick={() =>
                                              void deleteExpense(expense)
                                            }
                                          >
                                            <Trash2 size={16} />
                                          </button>
                                        </div>
                                      </motion.div>
                                    );
                                  })}
                                </AnimatePresence>
                              </div>
                            ))
                          ) : expenses.length || extras.length ? (
                            <p className="empty">Nada por aquí.</p>
                          ) : (
                            <p className="empty">Aún no registras gastos.</p>
                          ))}
                      </div>
                    </Glass>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        income={income}
        onIncome={changeIncome}
        schedule={schedule}
        onSchedule={(next) => void changeSchedule(next)}
        balance={balance}
        onBalance={changeBalance}
        categories={categories}
        counts={counts}
        onCategories={changeCategories}
        onRemoveCategory={removeCategory}
        fixed={fixed}
        onFixed={changeFixed}
      />

      <AnimatePresence>
        {adding && (
          <motion.div
            className="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeForm}
          />
        )}
      </AnimatePresence>
      <div className="dock-layer" hidden={settingsOpen}>
        <motion.div
          layout
          className={`dock ${adding ? "open" : ""}`}
          style={{ borderRadius: adding ? 28 : 999 }}
          transition={spring}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            {adding ? (
              <motion.div
                key="form"
                initial={{ opacity: 0, filter: "blur(8px)" }}
                animate={{ opacity: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, filter: "blur(8px)" }}
                transition={{ duration: 0.2 }}
              >
                <QuickAdd
                  key={editing?.item.id ?? "nuevo"}
                  categories={categories}
                  fixed={fixed}
                  editing={editing}
                  onClose={closeForm}
                  onSave={addExpense}
                  onSaveExtra={addExtra}
                />
              </motion.div>
            ) : (
              <motion.button
                key="trigger"
                type="button"
                className="dock-trigger"
                onClick={() => setAdding(true)}
                initial={{ opacity: 0, filter: "blur(8px)" }}
                animate={{ opacity: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, filter: "blur(8px)" }}
                transition={{ duration: 0.2 }}
              >
                <Plus size={18} />
                Nuevo movimiento
                <kbd>N</kbd>
              </motion.button>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      <Toaster
        theme="dark"
        position="bottom-center"
        offset={96}
        toastOptions={{ className: "toast" }}
      />
    </MotionConfig>
  );
}

export default App;
