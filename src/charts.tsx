import { motion } from "motion/react";
import { tint } from "./ui";

export type LinePoint = {
  key: string;
  value: number;
  /** Banda de incertidumbre; si falta, no se dibuja. */
  low?: number;
  high?: number;
  label: string;
  /** Texto completo para lectores de pantalla. */
  aria: string;
  /** Solo se muestra la etiqueta de los puntos marcados (y del activo). */
  tick?: boolean;
  /** Días que aún no llegan: ocupan su lugar pero no se dibujan. */
  future?: boolean;
};

const transition = { type: "spring", stiffness: 180, damping: 28 } as const;

// Línea con área o banda. Cada punto ocupa una columna del mismo ancho, igual que las
// barras, para que cambiar de tipo de gráfica no mueva las etiquetas.
export function LineChart({
  points,
  active,
  onActive,
  onPick,
  color,
  area = false,
  className = "",
}: {
  points: LinePoint[];
  active: number | null;
  onActive: (index: number | null) => void;
  onPick?: (index: number) => void;
  color?: string;
  area?: boolean;
  className?: string;
}) {
  const shown = points
    .map((point, index) => ({ point, index }))
    .filter(({ point }) => !point.future);
  const values = shown
    .flatMap(({ point }) => [point.value, point.low ?? point.value, point.high ?? point.value])
    .concat(0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min || 1) * 0.08;
  const x = (index: number) => ((index + 0.5) / points.length) * 100;
  const y = (value: number) => 100 - ((value - min + pad) / (max - min + pad * 2)) * 100;
  const path = (list: typeof shown, pick: (point: LinePoint) => number) =>
    list.map(({ point, index }, n) => `${n ? "L" : "M"}${x(index)},${y(pick(point))}`).join(" ");

  const line = path(shown, (point) => point.value);
  const band = shown.some(({ point }) => point.low !== undefined)
    ? path(shown, (point) => point.high ?? point.value) +
      " " +
      path([...shown].reverse(), (point) => point.low ?? point.value).replace("M", "L") +
      " Z"
    : "";
  const fill =
    area && shown.length > 1
      ? `${line} L${x(shown[shown.length - 1].index)},${y(min)} L${x(shown[0].index)},${y(min)} Z`
      : "";
  // Con muchos puntos (días del mes) los círculos estorban: solo se marca el activo.
  const dots = points.length <= 12;
  // Si cambia la cantidad de puntos la ruta no se puede interpolar: se vuelve a montar.
  const shape = `${points.length}`;

  return (
    <div
      className={`spark ${className}`}
      style={color ? tint(color) : undefined}
      onPointerLeave={() => onActive(null)}
    >
      <div className="spark-plot">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {min < 0 && max > 0 && (
            <line className="spark-zero" x1="0" x2="100" y1={y(0)} y2={y(0)} />
          )}
          {band && (
            <motion.path key={`b${shape}`} className="spark-band" initial={false} animate={{ d: band }} transition={transition} />
          )}
          {fill && (
            <motion.path key={`a${shape}`} className="spark-area" initial={false} animate={{ d: fill }} transition={transition} />
          )}
          {line && (
            <motion.path key={`l${shape}`} className="spark-line" initial={false} animate={{ d: line }} transition={transition} />
          )}
        </svg>
        {active !== null && (
          <span className="spark-guide" style={{ left: `${x(active)}%` }} />
        )}
        {shown.map(({ point, index }) =>
          dots || active === index ? (
            <motion.span
              key={point.key}
              className={`spark-dot ${active === index ? "on" : ""} ${point.value < 0 ? "neg" : ""}`}
              initial={false}
              animate={{ left: `${x(index)}%`, top: `${y(point.value)}%` }}
              transition={transition}
            />
          ) : null,
        )}
        <div className={`spark-cols ${onPick ? "pickable" : ""}`} aria-hidden>
          {points.map((point, index) => (
            <span
              key={point.key}
              onPointerEnter={() => onActive(index)}
              onClick={onPick && !point.future ? () => onPick(index) : undefined}
            />
          ))}
        </div>
      </div>
      <div className={`spark-hits ${onPick ? "pickable" : ""}`}>
        {points.map((point, index) => (
          <button
            type="button"
            key={point.key}
            className={[point.tick !== false && "tick", active === index && "on"]
              .filter(Boolean)
              .join(" ")}
            aria-label={point.aria}
            onPointerEnter={() => onActive(index)}
            onFocus={() => onActive(index)}
            onBlur={() => onActive(null)}
            onClick={onPick && !point.future ? () => onPick(index) : undefined}
          >
            {point.label}
          </button>
        ))}
      </div>
    </div>
  );
}
