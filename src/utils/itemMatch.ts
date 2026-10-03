// Recognise the same product under slightly different names ("Wine glasses" / "Wine glass",
// "Dalwhinnie 15 whisky" / "Dalwhinnie 15 single malt whisky"), for de-duplicating scan results.

const STOP = new Set(['a', 'an', 'the', 'of', 'and', 'with', 'for', 'in', 'pack', 'box', 'set', 'bottle']);

function singular(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 4 && /(ses|xes|ches|shes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

export function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // Bacardí -> bacardi
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w && !STOP.has(w))
    .map(singular);
}

/** Similarity 0..1: share of the shorter name's words found in the longer one */
export function nameSimilarity(a: string, b: string): number {
  const ta = new Set(nameTokens(a));
  const tb = new Set(nameTokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  const [small, big] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  let shared = 0;
  small.forEach((w) => big.has(w) && shared++);
  // "Glass" alone must not swallow "Wine glass": a one-word name only matches exactly
  if (small.size === 1 && big.size > 1) return shared && big.size === 1 ? 1 : shared / big.size;
  // A short generic name doesn't match a longer one that starts with an extra qualifier:
  // "Spice jar" is not "Oregano spice jar" (but "Bacardi Razz" is "Bacardi Razz rum")
  const bigFirst = nameTokens(ta.size <= tb.size ? b : a)[0];
  if (small.size <= 2 && big.size > small.size && !small.has(bigFirst)) return shared / big.size;
  return shared / small.size;
}

export const isSameItem = (a: string, b: string) => nameSimilarity(a, b) >= 0.8;
