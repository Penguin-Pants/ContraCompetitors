import type { Difficulty } from '@lr/shared/difficulty';

export interface DifficultySettings {
  /** Multiplies enemy walk speed (LIV-4, LIV-5). */
  enemySpeed: number;
  /** Fraction of spawn points that are active. */
  activeSpawns: number;
  /** Multiplies the shooter fire interval. Lower fires more often. */
  fireInterval: number;
}

/** Starting values from the build plan (Phase 4). Tune by playtest. */
export const DIFFICULTY_TABLE: Readonly<Record<Difficulty, DifficultySettings>> = {
  easy: { enemySpeed: 0.7, activeSpawns: 0.5, fireInterval: 1.5 },
  medium: { enemySpeed: 1.0, activeSpawns: 0.75, fireInterval: 1.0 },
  hard: { enemySpeed: 1.35, activeSpawns: 1.0, fireInterval: 0.7 },
};
