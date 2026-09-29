import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import {
  FALLBACK_CATEGORY,
  dateFromISO,
  localISODate,
  type Category,
} from "./data";
import { CategoryIcon } from "./icons";
import { tint } from "./ui";

// Todos los desplegables de la app (fechas, días, categorías) comparten esta base: el
// menú se dibuja en <body> con posición fija, así ningún contenedor con overflow (el
// formulario flotante, el panel de configuración) lo recorta, y abre hacia arriba si
// abajo no cabe.

type Align = "left" | "right";
type Place = { up: boolean; style: CSSProperties };

const MENU_ROOM = 340; // alto aproximado del menú más grande (el calendario)

function usePopover(align: Align) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<Place>({ up: false, style: {} });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Coloca el menú junto al botón. Devuelve false si el botón ya no está en pantalla.
  function position(keepSide?: boolean) {
    const box = triggerRef.current?.getBoundingClientRect();
    if (!box || box.bottom < 0 || box.top > window.innerHeight) return false;
    const below = window.innerHeight - box.bottom;
    setPlace((current) => {
      const up = keepSide ? current.up : below < MENU_ROOM && box.top > below;
      return {
        up,
        style: {
          ...(up
            ? { bottom: window.innerHeight - box.top + 6 }
            : { top: box.bottom + 6 }),
          ...(align === "left"
            ? { left: box.left }
            : { right: window.innerWidth - box.right }),
        },
      };
    });
    return true;
  }

  function toggle() {
    if (open) return setOpen(false);
    if (position()) setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      )
        close();
    };
    // Esc cierra solo el menú, no el formulario o el panel que lo contiene.
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      close();
      triggerRef.current?.focus();
    };
    // Al desplazar, el menú sigue al botón; si el botón sale de la pantalla, se cierra.
    const follow = (event: Event) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      if (!position(true)) close();
    };
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("keydown", escape, true);
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("keydown", escape, true);
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
    };
  }, [open]);

  return {
    open,
    place,
    align,
    toggle,
    close: () => setOpen(false),
    triggerRef,
    menuRef,
  };
}

type Popover = ReturnType<typeof usePopover>;

function PopoverMenu({
  popover,
  label,
  className = "",
  style,
  role = "listbox",
  children,
}: {
  popover: Popover;
  label: string;
  className?: string;
  style?: CSSProperties;
  role?: string;
  children: ReactNode;
}) {
  const { open, place, align } = popover;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={popover.menuRef as RefObject<HTMLDivElement>}
          className={`pick-menu ${className}`}
          role={role}
          aria-label={label}
          style={{
            ...place.style,
            ...style,
            transformOrigin: `${place.up ? "bottom" : "top"} ${align}`,
          }}
          initial={{ opacity: 0, y: place.up ? 4 : -4, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: place.up ? 4 : -4, scale: 0.97 }}
          transition={{ duration: 0.15 }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export type Option = {
  value: number;
  label: string;
  short?: string;
  wide?: boolean;
};

/** Lista de opciones; con columns, en cuadrícula (los días del mes como calendario). */
export function PopoverSelect({
  value,
  options,
  label,
  columns,
  compact = false,
  align = "left",
  onChange,
}: {
  value: number;
  options: Option[];
  label: string;
  columns?: number;
  compact?: boolean;
  align?: Align;
  onChange: (value: number) => void;
}) {
  const popover = usePopover(align);
  const current =
    options.find((option) => option.value === value) ?? options[0];

  return (
    <>
      <button
        ref={popover.triggerRef}
        type="button"
        className="pick-trigger"
        aria-label={`${label}: ${current.label}`}
        aria-expanded={popover.open}
        onClick={popover.toggle}
      >
        {compact ? (current.short ?? current.label) : current.label}
        <ChevronDown size={14} />
      </button>
      <PopoverMenu
        popover={popover}
        label={label}
        className={columns ? "grid" : ""}
        style={
          columns
            ? { gridTemplateColumns: `repeat(${columns}, 34px)` }
            : undefined
        }
      >
        {options.map((option) => (
          <button
            type="button"
            role="option"
            key={option.value}
            aria-selected={option.value === current.value}
            className={option.wide ? "wide" : ""}
            onClick={() => {
              onChange(option.value);
              popover.close();
            }}
          >
            {columns && !option.wide
              ? (option.short ?? option.label)
              : option.label}
          </button>
        ))}
      </PopoverMenu>
    </>
  );
}

// Día del mes: 1–31 y "último día" (0), para meses de cualquier largo.
const dayOptions: Option[] = [
  ...Array.from({ length: 31 }, (_, i) => ({
    value: i + 1,
    label: `Día ${i + 1}`,
    short: String(i + 1),
  })),
  { value: 0, label: "Último día", short: "Últ.", wide: true },
];

export function DayPicker({
  value,
  label,
  compact,
  align,
  onChange,
}: {
  value: number;
  label: string;
  compact?: boolean;
  align?: Align;
  onChange: (day: number) => void;
}) {
  return (
    <PopoverSelect
      value={value}
      options={dayOptions}
      label={label}
      columns={7}
      compact={compact}
      align={align}
      onChange={onChange}
    />
  );
}

export function CategoryPicker({
  categories,
  value,
  onChange,
}: {
  categories: Category[];
  value: string;
  onChange: (id: string) => void;
}) {
  const popover = usePopover("left");
  const current =
    categories.find((item) => item.id === value) ??
    categories.find((item) => item.id === FALLBACK_CATEGORY) ??
    categories[0];
  if (!current) return null;

  return (
    <>
      <button
        ref={popover.triggerRef}
        type="button"
        className="cat-icon cat-pick-trigger"
        style={tint(current.color)}
        aria-label={`Categoría: ${current.name}`}
        aria-expanded={popover.open}
        title={current.name}
        onClick={popover.toggle}
      >
        <CategoryIcon icon={current.icon} size={15} />
      </button>
      <PopoverMenu popover={popover} label="Categoría" className="cats">
        {categories.map((category) => (
          <button
            type="button"
            role="option"
            key={category.id}
            aria-selected={category.id === current.id}
            style={tint(category.color)}
            onClick={() => {
              onChange(category.id);
              popover.close();
            }}
          >
            <CategoryIcon icon={category.icon} size={15} />
            {category.name}
          </button>
        ))}
      </PopoverMenu>
    </>
  );
}

const monthTitle = new Intl.DateTimeFormat("es-MX", {
  month: "long",
  year: "numeric",
});
const shortDate = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const weekdayInitials = ["L", "M", "M", "J", "V", "S", "D"];

/** Fecha completa (AAAA-MM-DD) con calendario; los días después de max no se pueden elegir. */
export function DatePicker({
  value,
  max,
  label = "Fecha",
  align = "left",
  onChange,
}: {
  value: string;
  max?: string;
  label?: string;
  align?: Align;
  onChange: (date: string) => void;
}) {
  const popover = usePopover(align);
  const [month, setMonth] = useState(value.slice(0, 7));
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(year, monthNumber - 1, 1);
  const blanks = (first.getDay() + 6) % 7; // semana de lunes a domingo
  const length = new Date(year, monthNumber, 0).getDate();
  const today = localISODate();
  const days = Array.from(
    { length },
    (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`,
  );
  const move = (delta: number) =>
    setMonth(
      localISODate(new Date(year, monthNumber - 1 + delta, 1)).slice(0, 7),
    );

  return (
    <>
      <button
        ref={popover.triggerRef}
        type="button"
        className="pick-trigger"
        aria-label={`${label}: ${value}`}
        aria-expanded={popover.open}
        onClick={() => {
          setMonth(value.slice(0, 7));
          popover.toggle();
        }}
      >
        {shortDate.format(dateFromISO(value)).replace(".", "")}
        <ChevronDown size={14} />
      </button>
      <PopoverMenu
        popover={popover}
        label={label}
        className="calendar"
        role="dialog"
      >
        <div className="cal-head">
          <button
            type="button"
            aria-label="Mes anterior"
            onClick={() => move(-1)}
          >
            <ChevronLeft size={16} />
          </button>
          <span>{monthTitle.format(first)}</span>
          <button
            type="button"
            aria-label="Mes siguiente"
            disabled={!!max && month >= max.slice(0, 7)}
            onClick={() => move(1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="cal-grid">
          {weekdayInitials.map((initial, i) => (
            <span key={`d${i}`} className="cal-dow">
              {initial}
            </span>
          ))}
          {Array.from({ length: blanks }, (_, i) => (
            <span key={`b${i}`} />
          ))}
          {days.map((iso) => (
            <button
              type="button"
              key={iso}
              aria-selected={iso === value}
              aria-label={iso}
              className={iso === today ? "today" : ""}
              disabled={!!max && iso > max}
              onClick={() => {
                onChange(iso);
                popover.close();
              }}
            >
              {Number(iso.slice(8))}
            </button>
          ))}
        </div>
      </PopoverMenu>
    </>
  );
}
