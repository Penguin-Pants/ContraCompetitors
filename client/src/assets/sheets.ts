import { toSurface } from '../render/surface.ts';
import type { GameSheets } from '../scenes/gameRender.ts';
import type { Theme } from '../theme/palette.ts';
import { tintImage } from '../theme/tint.ts';
import { loadSheet, type LoadedSheet } from './loader.ts';
import { BRIEFCASE_SHEET, PLAYER_SHEET, SHOOTER_SHEET, WALKER_SHEET } from './placeholders.ts';

export async function loadBaseSheets(): Promise<GameSheets> {
  const [player, walker, shooter, briefcase] = await Promise.all(
    [PLAYER_SHEET, WALKER_SHEET, SHOOTER_SHEET, BRIEFCASE_SHEET].map(loadSheet),
  );
  return { player: player!, walker: walker!, shooter: shooter!, briefcase: briefcase! };
}

function tintSheet(sheet: LoadedSheet, theme: Theme): LoadedSheet {
  const images = sheet.images.map((img) => tintImage(img, theme));
  return { ...sheet, images, surfaces: images.map(toSurface) };
}

/** Recolors the reserved ramps once per theme (THM-1, THM-2). */
export function tintSheets(base: GameSheets, theme: Theme): GameSheets {
  return {
    player: tintSheet(base.player, theme),
    walker: tintSheet(base.walker, theme),
    shooter: tintSheet(base.shooter, theme),
    briefcase: base.briefcase,
  };
}
