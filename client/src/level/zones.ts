import { TILE } from './tilemap.ts';

export interface ZonePalette {
  /** Main backdrop color. Fixed, independent of brand colors, so readability checks have a stable target. */
  backdrop: string;
  /** Far wall or skyline silhouette on L1. */
  far: string;
  /** Warm light glow color on L0. */
  glow: string;
  floor: string;
  floorEdge: string;
}

export interface Zone {
  id: 1 | 2 | 3;
  name: string;
  /** First and last tile column, inclusive. */
  col0: number;
  col1: number;
  palette: ZonePalette;
}

/** Cold light with warm accents (section 3). */
export const ZONES: readonly Zone[] = [
  {
    id: 1,
    name: 'Storage Aisle',
    col0: 0,
    col1: 99,
    palette: {
      backdrop: '#121a28',
      far: '#1b2536',
      glow: '#ffb347',
      floor: '#363d4b',
      floorEdge: '#4a5263',
    },
  },
  {
    id: 2,
    name: 'Shipping Dock and Truck Lot',
    col0: 100,
    col1: 199,
    palette: {
      backdrop: '#161a2e',
      far: '#222842',
      glow: '#ffd27a',
      floor: '#2c3036',
      floorEdge: '#3d424b',
    },
  },
  {
    id: 3,
    name: 'Receiving Bay Entrance',
    col0: 200,
    col1: 299,
    palette: {
      backdrop: '#191b27',
      far: '#262838',
      glow: '#ff9a3c',
      floor: '#38353c',
      floorEdge: '#4b4750',
    },
  },
];

/** Backdrop colors the readability module tests brand colors against (THM-8). */
export const ZONE_BACKDROPS: readonly string[] = ZONES.map((z) => z.palette.backdrop);

export function zoneAt(xPx: number): Zone {
  const col = Math.floor(xPx / TILE);
  return ZONES.find((z) => col >= z.col0 && col <= z.col1) ?? ZONES[ZONES.length - 1]!;
}
