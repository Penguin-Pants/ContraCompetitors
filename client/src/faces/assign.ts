/** Fisher-Yates shuffle with an injectable random source. */
export function shuffle<T>(items: readonly T[], rand: () => number = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * One face per enemy slot (THM-3, I-1). Faces come from a shuffled list; a face repeats only when
 * there are fewer faces than slots. Zero faces gives all nulls (placeholder heads, E-8).
 */
export function assignFaces<T>(
  faces: readonly T[],
  slots: number,
  rand: () => number = Math.random,
): (T | null)[] {
  if (faces.length === 0) return Array.from({ length: slots }, () => null);
  const order = shuffle(faces, rand);
  return Array.from({ length: slots }, (_, i) => order[i % order.length]!);
}
