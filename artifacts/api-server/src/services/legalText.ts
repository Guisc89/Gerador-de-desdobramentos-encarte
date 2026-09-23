/**
 * Normalizes legal copy without inventing layout line breaks. Wrapping belongs
 * to the footer's actual rendered width; only breaks entered by the user remain
 * hard boundaries.
 */
export function formatLegalTextLines(value: unknown): string[] {
  const raw = String(value ?? "").replace(/\r\n?/g, "\n");
  if (!raw.trim()) return [];
  return raw
    .split("\n")
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter(Boolean);
}

/**
 * Fits legal copy inside its fixed box after fonts and layout are ready.
 * Product geometry never participates in this calculation. The same script is
 * embedded in preview HTML and server-rendered HTML, keeping both paths equal.
 */
export const LEGAL_FIT_SCRIPT = `
<script>
(() => {
  const fit = (element) => {
    const box = element.parentElement;
    if (!box) return;
    const maximum = Number(element.dataset.maxFont ||
      parseFloat(getComputedStyle(element).fontSize) || 16);
    const minimum = Number(element.dataset.minFont || 1);
    let low = minimum;
    let high = maximum;
    const fits = (size) => {
      element.style.fontSize = size + "px";
      return element.scrollHeight <= box.clientHeight + 0.5 &&
        element.scrollWidth <= box.clientWidth + 0.5;
    };
    if (fits(maximum)) return;
    for (let index = 0; index < 14; index += 1) {
      const middle = (low + high) / 2;
      if (fits(middle)) low = middle;
      else high = middle;
    }
    element.style.fontSize = low + "px";
  };
  const run = () => document.querySelectorAll("[data-fit-legal]").forEach(fit);
  // The export renderer calls this once more after every embedded image has
  // settled. Exposing the same fitter avoids a timing gap between the first
  // requestAnimationFrame used by the iframe preview and Puppeteer's screenshot.
  window.__fitLegalText = run;
  window.__legalFitReady = (document.fonts ? document.fonts.ready : Promise.resolve())
    .then(() => new Promise((resolve) => requestAnimationFrame(() => {
      run();
      requestAnimationFrame(resolve);
    })));
  window.addEventListener("resize", run);
})();
</script>`;