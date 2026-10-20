export const TILE = 16;

export const EMPTY = 0;
export const SOLID = 1;
/** One-way platform: blocks only from above. */
export const ONEWAY = 2;
export type TileType = typeof EMPTY | typeof SOLID | typeof ONEWAY;

export class TileMap {
  readonly cols: number;
  readonly rows: number;
  private readonly tiles: Uint8Array;

  constructor(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    this.tiles = new Uint8Array(cols * rows);
  }

  get widthPx(): number {
    return this.cols * TILE;
  }

  /** Outside the map: left, right and bottom are solid walls, above is open. */
  get(tx: number, ty: number): TileType {
    if (tx < 0 || tx >= this.cols || ty >= this.rows) return SOLID;
    if (ty < 0) return EMPTY;
    return this.tiles[ty * this.cols + tx] as TileType;
  }

  /** Fills columns tx0..tx1 and rows ty0..ty1, inclusive. */
  fill(tx0: number, ty0: number, tx1: number, ty1: number, type: TileType) {
    for (let ty = Math.max(0, ty0); ty <= Math.min(this.rows - 1, ty1); ty++)
      for (let tx = Math.max(0, tx0); tx <= Math.min(this.cols - 1, tx1); tx++)
        this.tiles[ty * this.cols + tx] = type;
  }
}
