/** Authored TypeScript fixtures only; no corpus text or consumer Kotlin is executed. */
const fixtures = [
  {
    "id": "ts-email-caller-empty-label-guard",
    "kind": "caller-guard",
    "diff": "+// Contract: each persisted domain label must be nonempty; plus-tag local parts are supported.\n+function valid(domain: string): boolean {\n+  const labels = domain.split('.');\n+  return labels.length >= 2 && labels.some(label => label.length > 0);\n+}\n+function register(value: string, save: (email: string) => void): boolean {\n+  const parts = value.split('@');\n+  if (parts.length !== 2 || parts[0].length === 0 || /\\s/.test(value)) return false;\n+  const domain = parts[1];\n+  if (domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) return false;\n+  const checked = domain;\n+  if (!valid(checked)) return false;\n+  const stored = checked;\n+  save(value.slice(0, value.indexOf('@') + 1) + stored);\n+  return true;\n+}\n+// Supplied exact witness: user@​example..com\n+// Supported positive: Owner119+tag@Audit.Invalid"
  },
  {
    "id": "ts-email-normalization-before-guard",
    "kind": "normalize-first",
    "diff": "+// Contract: each persisted domain label must be nonempty; plus-tag local parts are supported.\n+function valid(domain: string): boolean {\n+  const labels = domain.split('.');\n+  return labels.length >= 2 && labels.every(label => label.length > 0);\n+}\n+function register(value: string, save: (email: string) => void): boolean {\n+  const parts = value.split('@');\n+  if (parts.length !== 2 || parts[0].length === 0 || /\\s/.test(value)) return false;\n+  const domain = parts[1];\n+  const checked = domain.normalize('NFKC');\n+  if (!valid(checked)) return false;\n+  const stored = checked;\n+  save(value.slice(0, value.indexOf('@') + 1) + stored);\n+  return true;\n+}\n+// Supplied exact witness: user@example．.com\n+// Supported positive: Owner119+tag@Audit.Invalid"
  },
  {
    "id": "ts-email-existential-label-defect",
    "kind": "existential",
    "diff": "+// Contract: each persisted domain label must be nonempty; plus-tag local parts are supported.\n+function valid(domain: string): boolean {\n+  const labels = domain.split('.');\n+  return labels.length >= 2 && labels.some(label => label.length > 0);\n+}\n+function register(value: string, save: (email: string) => void): boolean {\n+  const parts = value.split('@');\n+  if (parts.length !== 2 || parts[0].length === 0 || /\\s/.test(value)) return false;\n+  const domain = parts[1];\n+  const checked = domain;\n+  if (!valid(checked)) return false;\n+  const stored = checked;\n+  save(value.slice(0, value.indexOf('@') + 1) + stored);\n+  return true;\n+}\n+// Supplied exact witness: user@example..com\n+// Supported positive: Owner119+tag@Audit.Invalid"
  },
  {
    "id": "ts-email-ignored-validator-result",
    "kind": "ignored-result",
    "diff": "+// Contract: each persisted domain label must be nonempty; plus-tag local parts are supported.\n+function valid(domain: string): boolean {\n+  const labels = domain.split('.');\n+  return labels.length >= 2 && labels.every(label => label.length > 0);\n+}\n+function register(value: string, save: (email: string) => void): boolean {\n+  const parts = value.split('@');\n+  if (parts.length !== 2 || parts[0].length === 0 || /\\s/.test(value)) return false;\n+  const domain = parts[1];\n+  const checked = domain;\n+  valid(checked);\n+  const stored = checked;\n+  save(value.slice(0, value.indexOf('@') + 1) + stored);\n+  return true;\n+}\n+// Supplied exact witness: user@example..com\n+// Supported positive: Owner119+tag@Audit.Invalid"
  },
  {
    "id": "ts-email-normalization-after-guard",
    "kind": "normalize-late",
    "diff": "+// Contract: each persisted domain label must be nonempty; plus-tag local parts are supported.\n+function valid(domain: string): boolean {\n+  const labels = domain.split('.');\n+  return labels.length >= 2 && labels.every(label => label.length > 0);\n+}\n+function register(value: string, save: (email: string) => void): boolean {\n+  const parts = value.split('@');\n+  if (parts.length !== 2 || parts[0].length === 0 || /\\s/.test(value)) return false;\n+  const domain = parts[1];\n+  const checked = domain;\n+  if (!valid(checked)) return false;\n+  const stored = domain.normalize('NFKC');\n+  save(value.slice(0, value.indexOf('@') + 1) + stored);\n+  return true;\n+}\n+// Supplied exact witness: user@example．.com\n+// Supported positive: Owner119+tag@Audit.Invalid"
  }
] as const;

export function observeValidationFixture(item: { readonly id: string; readonly diff: string }): {
  accepted: boolean; persisted: readonly string[]; supportedPositive: boolean; boundaryRejected: boolean;
} {
  const fixture = fixtures.find(candidate => candidate.id === item.id);
  if (!fixture || fixture.diff !== item.diff) throw new Error('Unknown or modified validation fixture.');
  const kind = fixture.kind;
  const persisted: string[] = [];
  const valid = (domain: string): boolean => {
    const labels = domain.split('.');
    return labels.length >= 2 && (kind === 'caller-guard' || kind === 'existential'
      ? labels.some(label => label.length > 0) : labels.every(label => label.length > 0));
  };
  const register = (value: string, save: (value: string) => void): boolean => {
    const parts = value.split('@');
    if (parts.length !== 2 || parts[0].length === 0 || /\s/.test(value)) return false;
    const domain = parts[1];
    if (kind === 'caller-guard' && (domain.startsWith('.') || domain.endsWith('.') || domain.includes('..'))) return false;
    const checked = kind === 'normalize-first' ? domain.normalize('NFKC') : domain;
    if (kind === 'ignored-result') valid(checked);
    else if (!valid(checked)) return false;
    const stored = kind === 'normalize-late' ? domain.normalize('NFKC') : checked;
    save(value.slice(0, value.indexOf('@') + 1) + stored);
    return true;
  };
  const witness = kind === 'normalize-first' || kind === 'normalize-late'
    ? 'user@example\uFF0E.com' : kind === 'caller-guard' ? 'user@\u200Bexample..com' : 'user@example..com';
  const accepted = register(witness, value => persisted.push(value));
  const positive: string[] = [];
  const supportedPositive = register('Owner119+tag@Audit.Invalid', value => positive.push(value));
  if (positive[0] !== 'Owner119+tag@Audit.Invalid') throw new Error('Supported value was altered.');
  const boundaryRejected = ['user@.example.com', 'user@example.com.'].every(value => !register(value, () => undefined));
  return { accepted, persisted, supportedPositive, boundaryRejected };
}
