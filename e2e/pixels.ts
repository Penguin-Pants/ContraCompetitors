import type { Locator, Page } from '@playwright/test';

/**
 * Screenshots an element and checks that every `block x block` cell has one color.
 * Returns the number of bad cells and the number of distinct colors seen.
 */
export async function checkPixelBlocks(page: Page, el: Locator, block: number) {
  const png = (await el.screenshot()).toString('base64');
  return page.evaluate(
    async ({ png, block }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${png}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let bad = 0;
      const distinct = new Set<number>();
      for (let by = 0; by + block <= c.height; by += block) {
        for (let bx = 0; bx + block <= c.width; bx += block) {
          const i0 = (by * c.width + bx) * 4;
          const ref = (d[i0]! << 16) | (d[i0 + 1]! << 8) | d[i0 + 2]!;
          distinct.add(ref);
          let ok = true;
          for (let y = by; y < by + block && ok; y++) {
            for (let x = bx; x < bx + block; x++) {
              const i = (y * c.width + x) * 4;
              if (((d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!) !== ref) {
                ok = false;
                break;
              }
            }
          }
          if (!ok) bad++;
        }
      }
      return { bad, distinct: distinct.size, w: c.width, h: c.height };
    },
    { png, block },
  );
}
