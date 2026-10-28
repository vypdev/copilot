/** Inert source conformance plus execution of statically authored test functions only. */
import * as ts from 'typescript';
import { registerCallerGuard, registerNormalizedFirst, registerExistential, registerIgnoredResult, registerNormalizedLate } from './bugbot_validation_functions';

type RegistrationFixture = (value: string, save: (email: string) => void) => boolean;
const fixtures = [
  { id: "ts-email-caller-empty-label-guard", diff: "+// Contract: each persisted domain label must be nonempty; plus-tag local parts are supported.\n+function registerCallerGuard(value: string, save: (email: string) => void): boolean {\n+  function valid(domain: string): boolean {\n+    const labels = domain.split('.');\n+    return labels.length >= 2 && labels.some(label => label.length > 0);\n+  }\n+  const parts = value.split('@');\n+  if (parts.length !== 2 || parts[0].length === 0 || /\\s/.test(value)) return false;\n+  const domain = parts[1];\n+  if (domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) return false;\n+  const checked = domain;\n+  if (!valid(checked)) return false;\n+  const stored = checked;\n+  save(value.slice(0, value.indexOf('@') + 1) + stored);\n+  return true;\n+}\n+// Supplied exact witness: user@​example..com\n+// Supported positive: Owner119+tag@Audit.Invalid", execute: registerCallerGuard },
  { id: "ts-email-normalization-before-guard", diff: "+// Contract: each persisted domain label must be nonempty; plus-tag local parts are supported.\n+function registerNormalizedFirst(value: string, save: (email: string) => void): boolean {\n+  function valid(domain: string): boolean {\n+    const labels = domain.split('.');\n+    return labels.length >= 2 && labels.every(label => label.length > 0);\n+  }\n+  const parts = value.split('@');\n+  if (parts.length !== 2 || parts[0].length === 0 || /\\s/.test(value)) return false;\n+  const domain = parts[1];\n+  const checked = domain.normalize('NFKC');\n+  if (/[@\\s]/.test(checked)) return false;\n+  if (!valid(checked)) return false;\n+  const stored = checked;\n+  save(value.slice(0, value.indexOf('@') + 1) + stored);\n+  return true;\n+}\n+// Supplied exact witness: user@example．.com\n+// Supported positive: Owner119+tag@Audit.Invalid", execute: registerNormalizedFirst },
  { id: "ts-email-existential-label-defect", diff: "+// Contract: each persisted domain label must be nonempty; plus-tag local parts are supported.\n+function registerExistential(value: string, save: (email: string) => void): boolean {\n+  function valid(domain: string): boolean {\n+    const labels = domain.split('.');\n+    return labels.length >= 2 && labels.some(label => label.length > 0);\n+  }\n+  const parts = value.split('@');\n+  if (parts.length !== 2 || parts[0].length === 0 || /\\s/.test(value)) return false;\n+  const domain = parts[1];\n+  const checked = domain;\n+  if (!valid(checked)) return false;\n+  const stored = checked;\n+  save(value.slice(0, value.indexOf('@') + 1) + stored);\n+  return true;\n+}\n+// Supplied exact witness: user@example..com\n+// Supported positive: Owner119+tag@Audit.Invalid", execute: registerExistential },
  { id: "ts-email-ignored-validator-result", diff: "+// Contract: each persisted domain label must be nonempty; plus-tag local parts are supported.\n+function registerIgnoredResult(value: string, save: (email: string) => void): boolean {\n+  function valid(domain: string): boolean {\n+    const labels = domain.split('.');\n+    return labels.length >= 2 && labels.every(label => label.length > 0);\n+  }\n+  const parts = value.split('@');\n+  if (parts.length !== 2 || parts[0].length === 0 || /\\s/.test(value)) return false;\n+  const domain = parts[1];\n+  const checked = domain;\n+  valid(checked);\n+  const stored = checked;\n+  save(value.slice(0, value.indexOf('@') + 1) + stored);\n+  return true;\n+}\n+// Supplied exact witness: user@example..com\n+// Supported positive: Owner119+tag@Audit.Invalid", execute: registerIgnoredResult },
  { id: "ts-email-normalization-after-guard", diff: "+// Contract: each persisted domain label must be nonempty; plus-tag local parts are supported.\n+function registerNormalizedLate(value: string, save: (email: string) => void): boolean {\n+  function valid(domain: string): boolean {\n+    const labels = domain.split('.');\n+    return labels.length >= 2 && labels.every(label => label.length > 0);\n+  }\n+  const parts = value.split('@');\n+  if (parts.length !== 2 || parts[0].length === 0 || /\\s/.test(value)) return false;\n+  const domain = parts[1];\n+  const checked = domain;\n+  if (!valid(checked)) return false;\n+  const stored = domain.normalize('NFKC');\n+  save(value.slice(0, value.indexOf('@') + 1) + stored);\n+  return true;\n+}\n+// Supplied exact witness: user@example．.com\n+// Supported positive: Owner119+tag@Audit.Invalid", execute: registerNormalizedLate },
 ] as const;

function normalizedJavaScript(source: string): string {
  const compiled = ts.transpileModule(source, { reportDiagnostics: true, compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None,
    removeComments: true, newLine: ts.NewLineKind.LineFeed,
  } });
  if (compiled.diagnostics?.some(item => item.category === ts.DiagnosticCategory.Error)) {
    throw new Error('Invalid authored validation source.');
  }
  return compiled.outputText.trim();
}

/** Compilation is comparison-only. The emitted corpus string is NEVER executed/imported. */
export function assertValidationFixtureSource(diff: string, execute: RegistrationFixture): void {
  const source = diff.split('\n').map(line => line.slice(1)).join('\n');
  if (normalizedJavaScript(source) !== normalizedJavaScript(execute.toString())) {
    throw new Error('Authored validation source does not match the compiled function.');
  }
}

export function observeValidationFixture(item: { readonly id: string; readonly diff: string }, witnessInput?: string): {
  accepted: boolean; persisted: readonly string[]; supportedPositive: boolean; boundaryRejected: boolean;
} {
  const fixture = fixtures.find(candidate => candidate.id === item.id);
  if (!fixture || fixture.diff !== item.diff) throw new Error('Unknown or modified validation fixture.');
  assertValidationFixtureSource(item.diff, fixture.execute);
  const value = (prefix: string): string => {
    const line = item.diff.split('\n').find(line => line.startsWith(prefix));
    if (line === undefined) throw new Error('Missing validation fixture input.');
    return line.slice(prefix.length);
  };
  const witness = value('+// Supplied exact witness: ');
  const supported = value('+// Supported positive: ');
  const persisted: string[] = [];
  const accepted = fixture.execute(witnessInput ?? witness, value => persisted.push(value));
  const positive: string[] = [];
  const supportedPositive = fixture.execute(supported, value => positive.push(value));
  if (positive[0] !== supported) throw new Error('Supported value was altered.');
  const boundaryRejected = ['user@.example.com', 'user@example.com.'].every(value => !fixture.execute(value, () => undefined));
  return { accepted, persisted, supportedPositive, boundaryRejected };
}
