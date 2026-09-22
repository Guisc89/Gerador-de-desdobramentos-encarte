export const DISCLAIMER_PADRAO =
  "Os preços e produtos anunciados são válidos exclusivamente para esta loja.";

function automaticLineCount(length: number, wordCount: number): number {
  if (wordCount <= 1) return wordCount;
  if (length <= 28) return 1;
  if (length <= 170) return Math.min(3, wordCount);
  if (length <= 260) return Math.min(4, wordCount);
  return Math.min(5, wordCount);
}

function balancedSegment(words: string[], lineCount: number): string[] {
  const count = Math.max(1, Math.min(lineCount, words.length));
  if (count === 1) return [words.join(" ")];

  const lengths = words.map((word) => word.length);
  const prefix = [0];
  lengths.forEach((length) => prefix.push(prefix[prefix.length - 1]! + length));
  const totalLength = prefix[prefix.length - 1]! + words.length - count;
  const target = totalLength / count;
  const costs = Array.from({ length: count + 1 }, () =>
    Array(words.length + 1).fill(Number.POSITIVE_INFINITY)
  );
  const previous = Array.from({ length: count + 1 }, () =>
    Array(words.length + 1).fill(-1)
  );
  costs[0]![0] = 0;

  for (let lines = 1; lines <= count; lines += 1) {
    for (let end = lines; end <= words.length; end += 1) {
      for (let start = lines - 1; start < end; start += 1) {
        const lineLength = prefix[end]! - prefix[start]! + (end - start - 1);
        const cost = costs[lines - 1]![start]! + (lineLength - target) ** 2;
        if (cost < costs[lines]![end]!) {
          costs[lines]![end] = cost;
          previous[lines]![end] = start;
        }
      }
    }
  }

  const result: string[] = [];
  let end = words.length;
  for (let lines = count; lines > 0; lines -= 1) {
    const start = previous[lines]![end]!;
    result.unshift(words.slice(start, end).join(" "));
    end = start;
  }
  return result;
}

/**
 * Balances legal copy at word boundaries. User line breaks remain hard
 * boundaries; automatic wrapping adds up to five lines for ordinary input.
 */
export function formatLegalTextLines(value: unknown): string[] {
  const raw = String(value ?? "").replace(/\r\n?/g, "\n");
  if (!raw.trim()) return [];
  const segments = raw
    .split("\n")
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .map((line) => line.split(" "));
  const wordCount = segments.reduce((sum, words) => sum + words.length, 0);
  const length = segments.reduce(
    (sum, words) => sum + words.join(" ").length,
    0,
  );
  const desired = Math.max(
    segments.length,
    automaticLineCount(length, wordCount),
  );
  const allocations = segments.map(() => 1);
  let remaining = desired - segments.length;
  while (remaining > 0) {
    let best = -1;
    let bestLoad = -1;
    segments.forEach((words, index) => {
      if (allocations[index]! >= words.length) return;
      const load = words.join(" ").length / allocations[index]!;
      if (load > bestLoad) {
        best = index;
        bestLoad = load;
      }
    });
    if (best < 0) break;
    allocations[best] += 1;
    remaining -= 1;
  }
  return segments.flatMap((words, index) =>
    balancedSegment(words, allocations[index]!)
  );
}