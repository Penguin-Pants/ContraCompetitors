/** RGBA pixels at art resolution. Pure data, so tint, rotate and scale are testable without a DOM. */
export interface PixelImage {
  w: number;
  h: number;
  data: Uint8ClampedArray;
}

export function createImage(w: number, h: number): PixelImage {
  return { w, h, data: new Uint8ClampedArray(w * h * 4) };
}

export function parseHex(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Bad color ${hex}`);
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex(r: number, g: number, b: number): string {
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

/** Builds an image from text rows. Each char is a palette key; '.' and ' ' are transparent. */
export function fromRows(
  rows: readonly string[],
  palette: Readonly<Record<string, string>>,
): PixelImage {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const img = createImage(w, h);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]!;
      if (ch === '.' || ch === ' ') continue;
      const color = palette[ch];
      if (!color) throw new Error(`No palette entry for "${ch}"`);
      setPixel(img, x, y, parseHex(color));
    }
  });
  return img;
}

export function setPixel(
  img: PixelImage,
  x: number,
  y: number,
  [r, g, b]: readonly number[],
  a = 255,
) {
  const i = (y * img.w + x) * 4;
  img.data[i] = r!;
  img.data[i + 1] = g!;
  img.data[i + 2] = b!;
  img.data[i + 3] = a;
}

export function getPixel(img: PixelImage, x: number, y: number): [number, number, number, number] {
  const i = (y * img.w + x) * 4;
  const d = img.data;
  return [d[i]!, d[i + 1]!, d[i + 2]!, d[i + 3]!];
}

/** Nearest-neighbor integer upscale. Stays on the art grid. */
export function scaleInt(img: PixelImage, n: number): PixelImage {
  if (!Number.isInteger(n) || n < 1) throw new Error('scaleInt needs a positive integer');
  const out = createImage(img.w * n, img.h * n);
  for (let y = 0; y < out.h; y++) {
    for (let x = 0; x < out.w; x++) {
      const si = (Math.floor(y / n) * img.w + Math.floor(x / n)) * 4;
      const di = (y * out.w + x) * 4;
      out.data.set(img.data.subarray(si, si + 4), di);
    }
  }
  return out;
}
