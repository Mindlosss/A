import { useMemo, useState } from "react";
import NumberFlow from "@number-flow/react";
import { motion } from "motion/react";
import {
  ArrowDownLeft,
  ChartLine,
  Settings,
  Sparkles,
  Table,
  Trash2,
} from "lucide-react";
import {
  dateFromISO,
  formatMoney,
  localISODate,
  type Expense,
  type Extra,
  type FixedExpense,
  type PaySchedule,
} from "./data";
import { forecast } from "./forecast";
import { LineChart } from "./charts";
import { Glass, Switch, money, spring } from "./ui";

const monthLong = new Intl.DateTimeFormat("es-MX", { month: "long" });
const monthShort = new Intl.DateTimeFormat("es-MX", { month: "short" });
const dayMonth = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
});
const clean = (value: string) => value.replace(".", "");

type Horizon = "6" | "12";
const horizons: { id: Horizon; label: string }[] = [
  { id: "6", label: "6 meses" },
  { id: "12", label: "12 meses" },
];

type Display = "grafica" | "tabla";
const displays: { id: Display; label: string }[] = [
  { id: "grafica", label: "Gráfica" },
  { id: "tabla", label: "Tabla mes a mes" },
];

type Planned =
  { kind: "gasto"; item: Expense } | { kind: "ingreso"; item: Extra };

export function ForecastView({
  expenses,
  extras,
  income,
  schedule,
  balance,
  fixed,
  fixedSkips,
  onDelete,
  onDeleteExtra,
  onOpenSettings,
}: {
  expenses: Expense[];
  extras: Extra[];
  income: number;
  schedule: PaySchedule;
  balance: number | null;
  fixed: FixedExpense[];
  fixedSkips: string[];
  onDelete: (expense: Expense) => Promise<void>;
  onDeleteExtra: (extra: Extra) => Promise<void>;
  onOpenSettings: () => void;
}) {
  const [horizon, setHorizon] = useState<Horizon>("6");
  const [active, setActive] = useState<number | null>(null);
  const [display, setDisplay] = useState<Display>("grafica");
  const todayKey = localISODate();
  const result = useMemo(
    () =>
      forecast(
        {
          expenses,
          extras,
          incomeCents: income,
          schedule,
          balance,
          fixed,
          fixedSkips,
        },
        new Date(),
        Number(horizon),
      ),
    [
      expenses,
      extras,
      income,
      schedule,
      balance,
      fixed,
      fixedSkips,
      horizon,
      todayKey,
    ],
  );

  if (!result)
    return (
      <p className="empty forecast-empty">
        Registra un gasto o un ingreso y aquí verás cuánto te quedará.
      </p>
    );

  const month = monthLong.format(new Date());
  const current = result.savings[0];
  const hasBalance = balance !== null;
  // Con saldo o con algún ingreso ya se puede hablar de lo que queda, no solo de lo gastado.
  const hasFlow =
    hasBalance ||
    income > 0 ||
    result.savings.some((point) => point.income > 0);
  const short = hasFlow && current.value < 0;
  const band = hasFlow
    ? { low: current.low, high: current.high }
    : result.monthSpend;
  const point = result.savings[active ?? result.savings.length - 1];
  const verb = hasBalance
    ? short
      ? "deberás"
      : "tendrás"
    : short
      ? "te faltarán"
      : "te quedarán";
  const planned: Planned[] = [
    ...result.upcoming.map((item) => ({ kind: "gasto" as const, item })),
    ...result.upcomingExtras.map((item) => ({
      kind: "ingreso" as const,
      item,
    })),
  ].sort((a, b) => a.item.date.localeCompare(b.item.date));

  return (
    <>
      <section className="hero">
        <div className="hero-row">
          <p className="hero-label">
            Al cierre de {month} {hasFlow ? verb : "habrás gastado"}
          </p>
          <Switch
            id="horizon-pill"
            small
            options={horizons}
            value={horizon}
            onChange={setHorizon}
          />
        </div>
        <h1 className={`hero-total ${short ? "neg" : ""}`}>
          <NumberFlow
            value={
              Math.abs(hasFlow ? current.value : result.monthSpend.value) / 100
            }
            format={money}
            locales="es-MX"
          />
        </h1>
        <div className="hero-meta">
          {band.low !== band.high && (
            <span className="pill">
              Entre {formatMoney(band.low)} y {formatMoney(band.high)}
            </span>
          )}
          {result.rate > 0 && (
            <span className="pill" title="Promedio reciente de tus gastos">
              Ritmo habitual {formatMoney(result.rate)} al día
            </span>
          )}
          {result.fixedMonthly > 0 && (
            <span
              className="pill"
              title="Se cuentan por adelantado, una vez al mes"
            >
              Fijos {formatMoney(result.fixedMonthly)} al mes
            </span>
          )}
        </div>
      </section>

      <div className="board">
        <div className="board-main">
          {hasFlow ? (
            <Glass className="chart forecast-chart fill-card">
              <header className="card-head">
                <div className="card-title">
                  <p className="card-label">
                    {hasBalance ? "Tendrás a fin de" : "Ahorro acumulado a"}{" "}
                    {monthLong.format(point.month)}
                  </p>
                  <p className={`card-value ${point.value < 0 ? "neg" : ""}`}>
                    <NumberFlow
                      value={point.value / 100}
                      format={money}
                      locales="es-MX"
                    />
                  </p>
                </div>
                <div className="hero-tools">
                  <div
                    className="chart-type"
                    role="radiogroup"
                    aria-label="Vista de la proyección"
                  >
                    {displays.map((option) => (
                      <button
                        type="button"
                        role="radio"
                        key={option.id}
                        aria-checked={display === option.id}
                        aria-label={option.label}
                        title={option.label}
                        onClick={() => setDisplay(option.id)}
                      >
                        {display === option.id && (
                          <motion.span
                            layoutId="forecast-display-pill"
                            className="switch-pill"
                            transition={spring}
                          />
                        )}
                        {option.id === "grafica" ? (
                          <ChartLine size={16} />
                        ) : (
                          <Table size={16} />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </header>
              <div className="forecast-body">
                {display === "grafica" ? (
                  <LineChart
                    points={result.savings.map((item) => ({
                      key: localISODate(item.month),
                      value: item.value,
                      low: item.low,
                      high: item.high,
                      label: clean(monthShort.format(item.month)),
                      aria: `${monthLong.format(item.month)}: ${formatMoney(item.value)}`,
                    }))}
                    active={active}
                    onActive={setActive}
                  />
                ) : (
                  <div className="plan">
                    <div className="plan-row plan-head">
                      <span>Mes</span>
                      <span>Ingresos</span>
                      <span>Gasto estimado</span>
                      <span>Te queda</span>
                      <span>{hasBalance ? "Tendrás" : "Acumulado"}</span>
                    </div>
                    <div className="plan-rows">
                      {result.savings.map((item, index) => (
                        <div
                          key={index}
                          className={`plan-row ${active === index ? "on" : ""}`}
                          onPointerEnter={() => setActive(index)}
                          onPointerLeave={() => setActive(null)}
                        >
                          <span className="plan-month">
                            {monthLong.format(item.month)}
                          </span>
                          <span>{formatMoney(item.income)}</span>
                          <span>{formatMoney(item.spend)}</span>
                          <span className={item.net < 0 ? "neg" : ""}>
                            {formatMoney(item.net)}
                          </span>
                          <span className={item.value < 0 ? "neg" : ""}>
                            {formatMoney(item.value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Glass>
          ) : (
            <Glass className="ledger income-cta">
              <p>
                Agrega tu ingreso o cuánto dinero tienes para saber cuánto te
                quedará cada mes.
              </p>
              <button
                type="button"
                className="pill income-pill"
                onClick={onOpenSettings}
              >
                <Settings size={15} />
                Abrir configuración
              </button>
            </Glass>
          )}
        </div>

        <div className="board-side fill">
          <Glass className="ledger">
            <header className="ledger-head">
              <h2>Programados</h2>
            </header>
            {planned.length ? (
              <div className="upcoming">
                {planned.map(({ kind, item }) => (
                  <div className={`upcoming-row ${kind}`} key={item.id}>
                    {kind === "ingreso" ? (
                      <ArrowDownLeft size={14} />
                    ) : (
                      <Sparkles size={14} />
                    )}
                    <span className="upcoming-name">{item.description}</span>
                    <span className="upcoming-date">
                      {clean(dayMonth.format(dateFromISO(item.date)))}
                    </span>
                    <span
                      className={`row-amount ${kind === "ingreso" ? "plus" : ""}`}
                    >
                      {kind === "ingreso" ? "+" : ""}
                      {formatMoney(item.amountCents)}
                    </span>
                    <button
                      type="button"
                      className="row-delete"
                      aria-label={`Eliminar ${item.description}`}
                      onClick={() =>
                        void (kind === "ingreso"
                          ? onDeleteExtra(item)
                          : onDelete(item))
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty small">
                Aquí aparecen los ingresos extra con fecha futura. Se suman a tu
                proyección en su fecha.
              </p>
            )}
          </Glass>
        </div>
      </div>
    </>
  );
}
