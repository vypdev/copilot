export function canSubmitPairingCode(code: string, busy: boolean): boolean {
  return !busy && /^[A-Fa-f0-9]{16}$/u.test(code.trim());
}
