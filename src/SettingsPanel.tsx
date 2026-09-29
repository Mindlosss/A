import { useEffect, useState, type KeyboardEvent } from "react";
import {
  AnimatePresence,
  Reorder,
  motion,
  useDragControls,
} from "motion/react";
import { Check, GripVertical, Plus, Trash2, X } from "lucide-react";
import {
  FALLBACK_CATEGORY,
  formatMoney,
  iconNames,
  localISODate,
  palette,
  type Category,
  type FixedExpense,
  type Frequency,
  type PaySchedule,
} from "./data";
import { CategoryIcon } from "./icons";
import { CategoryPicker, DayPicker, PopoverSelect } from "./pickers";
import { Switch, spring, tint } from "./ui";

const frequencies: { id: Frequency; label: string }[] = [
  { id: "mensual", label: "Mensual" },
  { id: "quincenal", label: "Quincenal" },
  { id: "semanal", label: "Semanal" },
];
const weekdays = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

// Vacío significa "sin valor" (null); `signed` permite saldos negativos.
function MoneyInput({
  cents,
  onCommit,
  label,
  suffix,
  signed = false,
}: {
  cents: number | null;
  onCommit: (cents: number | null) => Promise<void>;
  label: string;
  suffix: string;
  signed?: boolean;
}) {
  const show = (value: number | null) =>
    value === null || (value === 0 && !signed) ? "" : String(value / 100);
  const [value, setValue] = useState(show(cents));
  const [saved, setSaved] = useState(false);
  useEffect(() => setValue(show(cents)), [cents]);

  async function commit() {
    const text = value.replace(",", ".");
    const next =
      text === "" || text === "-" ? null : Math.round(Number(text) * 100);
    if (next !== null && (!Number.isFinite(next) || (!signed && next < 0)))
      return setValue(show(cents));
    // Sin signo, vacío y cero son lo mismo (ingreso en cero).
    if (next === cents || (!signed && (next ?? 0) === (cents ?? 0))) return;
    await onCommit(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1400);
  }

  return (
    <label className="money-field">
      <span>$</span>
      <input
        inputMode="decimal"
        placeholder="0"
        aria-label={label}
        value={value}
        onChange={(event) =>
          setValue(
            event.target.value.replace(signed ? /[^\d.,-]/g : /[^\d.,]/g, ""),
          )
        }
        onBlur={() => void commit()}
        onKeyDown={(event) =>
          event.key === "Enter" && event.currentTarget.blur()
        }
      />
      <em>{suffix}</em>
      <AnimatePresence>
        {saved && (
          <motion.i
            className="saved-mark"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          >
            <Check size={14} />
          </motion.i>
        )}
      </AnimatePresence>
    </label>
  );
}

function ScheduleFields({
  schedule,
  onChange,
}: {
  schedule: PaySchedule;
  onChange: (schedule: PaySchedule) => void;
}) {
  function setFrequency(frequency: Frequency) {
    const days =
      frequency === "quincenal"
        ? schedule.days.length === 2
          ? schedule.days
          : [15, 0]
        : [schedule.days[0] ?? 1];
    onChange({ ...schedule, frequency, days });
  }
  const setDay = (index: number, day: number) =>
    onChange({
      ...schedule,
      days: schedule.days.map((item, i) => (i === index ? day : item)),
    });

  return (
    <div className="schedule">
      <Switch
        id="frequency-pill"
        small
        options={frequencies}
        value={schedule.frequency}
        onChange={setFrequency}
      />
      <div className="schedule-days">
        {schedule.frequency === "semanal" ? (
          <PopoverSelect
            value={schedule.weekday}
            label="Día de la semana"
            options={weekdays.map((name, day) => ({
              value: day,
              label: `Cada ${name.toLowerCase()}`,
            }))}
            onChange={(weekday) => onChange({ ...schedule, weekday })}
          />
        ) : (
          schedule.days.map((day, index) => (
            <DayPicker
              key={index}
              value={day}
              label={
                schedule.days.length > 1
                  ? `Día de pago ${index + 1}`
                  : "Día de pago"
              }
              onChange={(value) => setDay(index, value)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function CategoryRow({
  category,
  count,
  isNew,
  onChange,
  onRemove,
}: {
  category: Category;
  count: number;
  isNew: boolean;
  onChange: (category: Category) => void;
  onRemove: () => void;
}) {
  const controls = useDragControls();
  const [editing, setEditing] = useState(isNew);
  const [confirming, setConfirming] = useState(false);
  const [name, setName] = useState(category.name);
  const locked = category.id === FALLBACK_CATEGORY;

  function commitName() {
    const trimmed = name.trim();
    if (!trimmed) return setName(category.name);
    if (trimmed !== category.name) onChange({ ...category, name: trimmed });
  }

  return (
    <Reorder.Item
      value={category}
      className="cat-row"
      dragListener={false}
      dragControls={controls}
      style={tint(category.color)}
    >
      <div className="cat-row-main">
        <button
          type="button"
          className="grip"
          aria-label="Arrastrar para ordenar"
          onPointerDown={(event) => controls.start(event)}
        >
          <GripVertical size={15} />
        </button>
        <button
          type="button"
          className={`cat-swatch ${editing ? "on" : ""}`}
          aria-label="Cambiar color e ícono"
          aria-expanded={editing}
          onClick={() => setEditing(!editing)}
        >
          <CategoryIcon icon={category.icon} size={16} />
        </button>
        <input
          className="cat-name"
          value={name}
          maxLength={24}
          autoFocus={isNew}
          aria-label="Nombre de la categoría"
          onChange={(event) => setName(event.target.value)}
          onBlur={commitName}
          onKeyDown={(event) =>
            event.key === "Enter" && event.currentTarget.blur()
          }
        />
        <span className="cat-count" title="Gastos en esta categoría">
          {count}
        </span>
        {!locked && (
          <button
            type="button"
            className="row-delete"
            aria-label={`Eliminar ${category.name}`}
            onClick={() => (count ? setConfirming(true) : onRemove())}
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {confirming && (
          <motion.div
            key="confirm"
            className="cat-extra"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <div className="cat-confirm">
              <span>
                {count === 1
                  ? "Su gasto pasará"
                  : `Sus ${count} gastos pasarán`}{" "}
                a Otros.
              </span>
              <button type="button" className="danger" onClick={onRemove}>
                Eliminar
              </button>
              <button type="button" onClick={() => setConfirming(false)}>
                Cancelar
              </button>
            </div>
          </motion.div>
        )}
        {editing && (
          <motion.div
            key="picker"
            className="cat-extra"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <div className="cat-picker">
              <div className="colors" role="radiogroup" aria-label="Color">
                {palette.map((color) => (
                  <button
                    type="button"
                    role="radio"
                    key={color}
                    aria-checked={category.color === color}
                    aria-label={color}
                    style={tint(color)}
                    onClick={() => onChange({ ...category, color })}
                  >
                    {category.color === color && (
                      <motion.span
                        layoutId={`color-${category.id}`}
                        className="color-ring"
                        transition={spring}
                      />
                    )}
                  </button>
                ))}
              </div>
              <div className="icons" role="radiogroup" aria-label="Ícono">
                {iconNames.map((icon) => (
                  <button
                    type="button"
                    role="radio"
                    key={icon}
                    aria-checked={category.icon === icon}
                    aria-label={icon}
                    onClick={() => onChange({ ...category, icon })}
                  >
                    {category.icon === icon && (
                      <motion.span
                        layoutId={`icon-${category.id}`}
                        className="icon-pill"
                        transition={spring}
                      />
                    )}
                    <CategoryIcon icon={icon} size={16} />
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Reorder.Item>
  );
}

function FixedRow({
  item,
  categories,
  autoFocus,
  onChange,
  onRemove,
}: {
  item: FixedExpense;
  categories: Category[];
  autoFocus: boolean;
  onChange: (item: FixedExpense) => void;
  onRemove: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [amount, setAmount] = useState(
    item.amountCents ? String(item.amountCents / 100) : "",
  );

  function commit() {
    const cents = Math.round(Number(amount.replace(",", ".") || 0) * 100);
    const next = {
      ...item,
      name: name.trim(),
      amountCents: Number.isFinite(cents) && cents > 0 ? cents : 0,
    };
    if (next.name !== item.name || next.amountCents !== item.amountCents)
      onChange(next);
  }
  const blurOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") event.currentTarget.blur();
  };

  return (
    <motion.div
      className="fixed-row"
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
    >
      <CategoryPicker
        categories={categories}
        value={item.category}
        onChange={(category) => onChange({ ...item, category })}
      />
      <input
        value={name}
        autoFocus={autoFocus}
        maxLength={40}
        placeholder="Renta, internet…"
        aria-label="Nombre del gasto fijo"
        onChange={(event) => setName(event.target.value)}
        onBlur={commit}
        onKeyDown={blurOnEnter}
      />
      <DayPicker
        value={item.day}
        label="Día de pago"
        compact
        align="right"
        onChange={(day) => onChange({ ...item, day })}
      />
      <label className="fixed-amount">
        $
        <input
          inputMode="decimal"
          placeholder="0"
          aria-label="Monto mensual"
          value={amount}
          onChange={(event) =>
            setAmount(event.target.value.replace(/[^\d.,]/g, ""))
          }
          onBlur={commit}
          onKeyDown={blurOnEnter}
        />
      </label>
      <button
        type="button"
        className="row-delete"
        aria-label={`Eliminar ${item.name || "gasto fijo"}`}
        onClick={onRemove}
      >
        <Trash2 size={15} />
      </button>
    </motion.div>
  );
}

function FixedEditor({
  fixed,
  categories,
  onChange,
}: {
  fixed: FixedExpense[];
  categories: Category[];
  onChange: (list: FixedExpense[]) => void;
}) {
  const [newId, setNewId] = useState<string | null>(null);
  const total = fixed.reduce((sum, item) => sum + item.amountCents, 0);

  function add() {
    const item: FixedExpense = {
      id: crypto.randomUUID().slice(0, 8),
      name: "",
      amountCents: 0,
      day: new Date().getDate(),
      category: categories[0]?.id ?? FALLBACK_CATEGORY,
      since: localISODate(),
    };
    setNewId(item.id);
    onChange([...fixed, item]);
  }

  return (
    <>
      <div className="fixed-list">
        <AnimatePresence initial={false}>
          {fixed.map((item) => (
            <FixedRow
              key={item.id}
              item={item}
              categories={categories}
              autoFocus={item.id === newId}
              onChange={(next) =>
                onChange(fixed.map((row) => (row.id === next.id ? next : row)))
              }
              onRemove={() =>
                onChange(fixed.filter((row) => row.id !== item.id))
              }
            />
          ))}
        </AnimatePresence>
      </div>
      <button type="button" className="add-cat" onClick={add}>
        <Plus size={16} />
        Nuevo gasto fijo
      </button>
      {total > 0 && (
        <p className="fixed-total">Total {formatMoney(total)} al mes</p>
      )}
    </>
  );
}

export function SettingsPanel({
  open,
  onClose,
  income,
  onIncome,
  schedule,
  onSchedule,
  balance,
  onBalance,
  categories,
  counts,
  onCategories,
  onRemoveCategory,
  fixed,
  onFixed,
}: {
  open: boolean;
  onClose: () => void;
  income: number;
  onIncome: (cents: number) => Promise<void>;
  schedule: PaySchedule;
  onSchedule: (schedule: PaySchedule) => void;
  balance: number | null;
  onBalance: (cents: number | null) => Promise<void>;
  categories: Category[];
  counts: Record<string, number>;
  onCategories: (list: Category[]) => void;
  onRemoveCategory: (id: string) => Promise<void>;
  fixed: FixedExpense[];
  onFixed: (list: FixedExpense[]) => void;
}) {
  const [newId, setNewId] = useState<string | null>(null);

  function addCategory() {
    const used = new Set(categories.map((item) => item.color));
    const category: Category = {
      id: crypto.randomUUID().slice(0, 8),
      name: "Nueva categoría",
      color: palette.find((color) => !used.has(color)) ?? palette[0],
      icon: "grid",
    };
    setNewId(category.id);
    // Antes de "Otros", que siempre queda al final por defecto.
    const fallback = categories.findIndex(
      (item) => item.id === FALLBACK_CATEGORY,
    );
    const list = [...categories];
    list.splice(fallback < 0 ? list.length : fallback, 0, category);
    onCategories(list);
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="scrim"
            className="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            key="sheet"
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Configuración"
            initial={{ x: "calc(100% + 32px)" }}
            animate={{ x: 0 }}
            exit={{ x: "calc(100% + 32px)" }}
            transition={spring}
          >
            <header className="sheet-head">
              <h2>Configuración</h2>
              <button
                type="button"
                className="icon-btn"
                onClick={onClose}
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </header>

            <section className="sheet-section">
              <h3>Dinero actual</h3>
              <MoneyInput
                cents={balance}
                onCommit={onBalance}
                label="Dinero que tienes hoy"
                suffix="hoy"
                signed
              />
            </section>

            <section className="sheet-section">
              <h3>Ingreso fijo</h3>
              <MoneyInput
                cents={income}
                onCommit={(cents) => onIncome(cents ?? 0)}
                label="Monto de cada pago"
                suffix="por pago"
              />
              <ScheduleFields schedule={schedule} onChange={onSchedule} />
            </section>

            <section className="sheet-section">
              <h3>Gastos fijos</h3>
              <FixedEditor
                fixed={fixed}
                categories={categories}
                onChange={onFixed}
              />
            </section>

            <section className="sheet-section">
              <h3>Categorías</h3>
              <Reorder.Group
                axis="y"
                values={categories}
                onReorder={onCategories}
                className="cat-list"
              >
                {categories.map((category) => (
                  <CategoryRow
                    key={category.id}
                    category={category}
                    count={counts[category.id] ?? 0}
                    isNew={category.id === newId}
                    onChange={(next) =>
                      onCategories(
                        categories.map((item) =>
                          item.id === next.id ? next : item,
                        ),
                      )
                    }
                    onRemove={() => void onRemoveCategory(category.id)}
                  />
                ))}
              </Reorder.Group>
              <button type="button" className="add-cat" onClick={addCategory}>
                <Plus size={16} />
                Nueva categoría
              </button>
            </section>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
