import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export function sddPrerequisiteDocuments() {
  const specs = resolve(__dirname, '../../specs');
  return { standard: readFileSync(join(specs, 'README.md'), 'utf8'), template: readFileSync(join(specs, '_template.md'), 'utf8') };
}

export const MALFORMED_SDD_PREREQUISITES = ['title-only template', 'title-only standard', 'missing canonical heading',
  'fenced template', 'missing standard section', 'fenced standard', 'empty template section', 'commented standard'] as const;

export function malformedSddPrerequisites(scenario: typeof MALFORMED_SDD_PREREQUISITES[number]) {
  const documents = sddPrerequisiteDocuments();
  if (scenario === 'title-only template') documents.template = '# Invalid\n';
  if (scenario === 'title-only standard') documents.standard = '# Invalid\n';
  if (scenario === 'missing canonical heading') documents.template = documents.template.replace('## 8. Clean Architecture design', '## 8. Other');
  if (scenario === 'fenced template') documents.template = '# Template\n```markdown\n' + documents.template + '\n```';
  if (scenario === 'missing standard section') documents.standard = documents.standard.replace('## 6.', '### 6.');
  if (scenario === 'fenced standard') documents.standard = '# Standard\n~~~markdown\n' + documents.standard + '\n~~~';
  if (scenario === 'empty template section') documents.template = documents.template.replace(/(## 20\.[^\n]+)[^]*/u, '$1\n');
  if (scenario === 'commented standard') documents.standard = '# Standard\n<!--\n' + documents.standard + '\n-->';
  return documents;
}

/** Metadata fixtures only: no compiler, runtime or framework is executed. */
export const PORTABLE_SDD_LAYOUTS = [
  ['Kotlin/Gradle', 'backend/app/src/main/kotlin/example/Application.kt', 'backend/app/src/test/kotlin/example/ApplicationTest.kt', 'backend/app/README.md'],
  ['Astro/Svelte monorepo', 'frontend/apps/console/src/pages/index.astro', 'frontend/apps/console/src/components/Card.spec.ts', 'frontend/apps/console/README.md'],
  ['Python SDK', 'sdks/python/client/__init__.py', 'sdks/python/tests/test_client.py', 'sdks/python/README.rst'],
  ['TypeScript spec', 'packages/client/index.ts', 'src/client.spec.ts', 'packages/client/README.md'],
  ['JavaScript test', 'apps/client/index.js', 'src/client.test.js', 'apps/client/README.md'],
  ['Java/Maven', 'services/api/src/main/java/example/Application.java', 'services/api/src/test/java/example/ApplicationTest.java', 'services/api/README.adoc'],
  ['.NET', 'backend/Api/Program.cs', 'backend/Api.Tests/ApiTests.cs', 'backend/Api/README.md'],
  ['Go', 'cmd/server/main.go', 'internal/server/server_test.go', 'internal/server/README.md'],
  ['Rust', 'crates/client/src/lib.rs', 'crates/client/tests/client.rs', 'crates/client/README.md'],
  ['unknown language', 'modules/custom/start.custom', 'checks/custom.check', 'manual/guide.txt'],
] as const;

export function portableSddCapability() {
  return {
    id: 'payments', title: 'Payments', status: 'proposed', scope: 'Portable payment evidence',
    owner: 'Maintainers', lastVerified: '2026-10-19', specs: ['specs/payments.md'], workflows: [] as string[],
    entrypoints: PORTABLE_SDD_LAYOUTS.map(([, source]) => String(source)),
    code: [...PORTABLE_SDD_LAYOUTS.map(([, source]) => String(source)), 'frontend/apps/console/src/components/Card.svelte'],
    tests: PORTABLE_SDD_LAYOUTS.map(([, , test]) => String(test)),
    documentation: [...PORTABLE_SDD_LAYOUTS.map(([, , , doc]) => String(doc)), 'sdks/python/README.md'],
  };
}

export function writePortableSddEvidence(root: string, capability = portableSddCapability()): void {
  for (const file of new Set([...capability.entrypoints, ...capability.code, ...capability.tests, ...capability.documentation])) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), '# Synthetic metadata evidence\n');
  }
}
