/** Existing Setup admission only; actual authenticated authority is established separately. */
export function isSetupTokenValueValid(token: string): boolean {
  const value = token.trim();
  return value.length >= 20 && value !== 'github_pat_11..';
}
