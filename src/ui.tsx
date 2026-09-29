import type { CSSProperties, PointerEvent, ReactNode } from "react";
import { motion } from "motion/react";

export const money = { style: "currency", currency: "MXN" } as const;
export const spring = { type: "spring", bounce: 0.2, duration: 0.5 } as const;
export const tint = (color: string) => ({ "--c": color }) as CSSProperties;

// Tarjeta de vidrio con un reflejo que sigue al cursor.
export function Glass({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  function follow(event: PointerEvent<HTMLElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--mx", `${event.clientX - box.left}px`);
    event.currentTarget.style.setProperty("--my", `${event.clientY - box.top}px`);
  }
  return (
    <section className={`glass ${className}`} onPointerMove={follow}>
      {children}
    </section>
  );
}

export function Switch<T extends string>({
  id,
  options,
  value,
  onChange,
  small = false,
}: {
  id: string;
  options: { id: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
  small?: boolean;
}) {
  return (
    <div className={`switch ${small ? "small" : ""}`} role="radiogroup">
      {options.map((option) => (
        <button
          type="button"
          role="radio"
          aria-checked={value === option.id}
          key={option.id}
          onClick={() => onChange(option.id)}
        >
          {value === option.id && (
            <motion.span
              layoutId={id}
              className="switch-pill"
              transition={spring}
            />
          )}
          <span className="switch-label">{option.label}</span>
        </button>
      ))}
    </div>
  );
}
