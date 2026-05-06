export interface PriceParts {
  precoOriginal: string;
  precoInteiro: string;
  precoCentavos: string;
}

export function formatPrice(raw: unknown): PriceParts | null {
  if (raw === null || raw === undefined || raw === "") return null;

  let value: number | null = null;

  if (typeof raw === "number") {
    value = raw;
  } else {
    const text = String(raw)
      .replace(/r\$/i, "")
      .replace(/\s+/g, "")
      .trim();
    if (!text) return null;
    // Brazilian format: 1.234,56 -> 1234.56
    let normalized = text;
    if (normalized.includes(",")) {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    }
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) return null;
    value = parsed;
  }

  if (value === null || !Number.isFinite(value)) return null;

  const fixed = value.toFixed(2);
  const [intPart, centPart] = fixed.split(".");
  return {
    precoOriginal: `R$ ${intPart!.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${centPart}`,
    precoInteiro: intPart!,
    precoCentavos: centPart!,
  };
}
