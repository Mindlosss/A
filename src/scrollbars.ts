// Marca con "is-scrolling" el elemento que se está desplazando y la quita tras un
// momento de reposo; el CSS solo pinta la barra mientras la clase está puesta.
const HIDE_AFTER_MS = 1200;
const timers = new WeakMap<Element, number>();

document.addEventListener(
  "scroll",
  (event) => {
    const target =
      event.target === document ? document.documentElement : event.target;
    if (!(target instanceof Element)) return;
    target.classList.add("is-scrolling");
    window.clearTimeout(timers.get(target));
    timers.set(
      target,
      window.setTimeout(() => target.classList.remove("is-scrolling"), HIDE_AFTER_MS),
    );
  },
  { capture: true, passive: true },
);
