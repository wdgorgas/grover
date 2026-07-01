/** Motion utilities — typewriter subtitles, count-up numbers, staggered reveals. */

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Types text into an element with a blinking caret; instant if reduced motion. */
export function typewrite(el, text, speed = 14) {
  if (!el) return;
  if (reduced) { el.textContent = text; return; }
  el.innerHTML = '<span class="tw"></span><span class="caret"></span>';
  const tw = el.querySelector('.tw');
  const caret = el.querySelector('.caret');
  let i = 0;
  const step = () => {
    // A few characters per tick keeps it brisk, not gimmicky.
    i = Math.min(text.length, i + 2);
    tw.textContent = text.slice(0, i);
    if (i < text.length) setTimeout(step, speed);
    else setTimeout(() => caret.remove(), 1200);
  };
  step();
}

/** Counts a numeric element up from 0; formatter renders each frame. */
export function countUp(el, target, formatter = (v) => v.toFixed(2), duration = 700) {
  if (!el) return;
  if (reduced || !isFinite(target)) { el.textContent = formatter(target || 0); return; }
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = formatter(target * eased);
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Assigns stagger indices to a container's children (used with .reveal). */
export function stagger(container, selector = ':scope > *') {
  if (!container) return;
  container.querySelectorAll(selector).forEach((el, i) => {
    el.classList.add('reveal');
    el.style.setProperty('--i', Math.min(i, 12));
  });
}
