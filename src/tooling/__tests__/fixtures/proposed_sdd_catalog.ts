import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function capability(id = 'future', status = 'proposed') {
  return { id, title: id + ' capability', status, scope: 'Reviewed prospective behavior', owner: 'Maintainers',
    lastVerified: '2026-10-29', specs: ['specs/' + id + '.md'], workflows: [] as string[],
    entrypoints: [] as string[], code: [] as string[], tests: [] as string[], documentation: ['docs/guide.md'],
    readiness: { state: 'draft', implementationEvidence: 'absent', blockers: ['Product review pending'], changesAllowed: false } };
}
export type Capability = ReturnType<typeof capability>;
export function documents(root: string, item: Capability): void {
  mkdirSync(join(root, 'specs'), { recursive: true }); mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(join(root, item.specs[0]), '# Proposed contract\n\n- Status: Draft\n');
  writeFileSync(join(root, 'docs/guide.md'), '# Prospective guide\n');
}
export function implementation(root: string, item: Capability): void {
  mkdirSync(join(root, 'lib'), { recursive: true }); mkdirSync(join(root, 'checks'), { recursive: true });
  writeFileSync(join(root, 'lib/quote.cjs'), 'exports.quote = quantity => { if (!Number.isInteger(quantity) || quantity < 0) throw new RangeError("quantity"); return quantity * 7; };\n');
  writeFileSync(join(root, 'checks/quote.cjs'), 'const assert = require("node:assert/strict"); const { quote } = require("../lib/quote.cjs"); assert.equal(quote(3), 21); assert.throws(() => quote(-1), RangeError);\n');
  item.entrypoints = ['lib/quote.cjs']; item.code = ['lib/quote.cjs']; item.tests = ['checks/quote.cjs'];
}
export function catalog(items: Capability[]) { return { version: 1, capabilities: items }; }
