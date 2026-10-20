/** Brand color slots (THM-1, THM-2). Neutral gray until a theme is applied. */
export interface Theme {
  primary: string;
  secondary: string;
}

export const NEUTRAL_THEME: Theme = { primary: '#8a8f99', secondary: '#6b707a' };
