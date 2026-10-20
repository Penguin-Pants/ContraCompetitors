/** The only leaderboard check (LB-4): exactly 3 ASCII letters. */
export const INITIALS_RE = /^[A-Za-z]{3}$/;

/** Upper-case initials, or null when the value fails the filter. */
export function normalizeInitials(value: string): string | null {
  return INITIALS_RE.test(value) ? value.toUpperCase() : null;
}
