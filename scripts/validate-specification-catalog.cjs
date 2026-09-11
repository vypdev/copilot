#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_ROOT = path.resolve(__dirname, '..');
const CATALOG_JSON = 'specs/catalog.json';
const CATALOG_MARKDOWN = 'specs/CATALOG.md';
const STATUS_LABELS = {
  'as-built-baseline': 'As-built baseline',
  implemented: 'Implemented',
  proposed: 'Proposed',
  deprecated: 'Deprecated',
};
const PATH_FIELDS = ['specs', 'workflows', 'entrypoints', 'code', 'tests', 'documentation'];

function readCatalog(root = DEFAULT_ROOT) {
  return JSON.parse(fs.readFileSync(path.join(root, CATALOG_JSON), 'utf8'));
}

function validateCatalog(root, catalog) {
  const errors = [];
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) {
    return ['catalog must be a JSON object.'];
  }
  if (catalog.version !== 1) errors.push('catalog.version must be 1.');
  if (!Array.isArray(catalog.capabilities) || catalog.capabilities.length === 0) {
    return [...errors, 'catalog.capabilities must be a non-empty array.'];
  }

  const ids = new Set();
  const titles = new Set();
  const registeredSpecs = new Map();
  for (const [index, capability] of catalog.capabilities.entries()) {
    const prefix = `capabilities[${index}]`;
    for (const field of ['id', 'title', 'status', 'scope', 'owner', 'lastVerified']) {
      if (typeof capability?.[field] !== 'string' || capability[field].trim() === '') {
        errors.push(`${prefix}.${field} must be a non-empty string.`);
      }
    }
    if (ids.has(capability.id)) errors.push(`${prefix}.id duplicates ${capability.id}.`);
    if (titles.has(capability.title)) errors.push(`${prefix}.title duplicates ${capability.title}.`);
    ids.add(capability.id);
    titles.add(capability.title);
    if (!Object.hasOwn(STATUS_LABELS, capability.status)) {
      errors.push(`${prefix}.status must be one of ${Object.keys(STATUS_LABELS).join(', ')}.`);
    }
    if (!isIsoDate(capability.lastVerified)) {
      errors.push(`${prefix}.lastVerified must use YYYY-MM-DD.`);
    }

    for (const field of PATH_FIELDS) {
      const values = capability[field];
      if (!Array.isArray(values)) {
        errors.push(`${prefix}.${field} must be an array.`);
        continue;
      }
      if (field !== 'workflows' && values.length === 0) {
        errors.push(`${prefix}.${field} must not be empty.`);
      }
      if (new Set(values).size !== values.length) {
        errors.push(`${prefix}.${field} contains duplicate paths.`);
      }
      for (const [pathIndex, relativePath] of values.entries()) {
        const location = `${prefix}.${field}[${pathIndex}]`;
        if (!isSafeRelativePath(relativePath)) {
          errors.push(`${location} must be a normalized repository-relative path.`);
          continue;
        }
        if (!matchesFieldBoundary(field, relativePath)) {
          errors.push(`${location} is outside the ${field} boundary: ${relativePath}.`);
        }
        const absolutePath = path.resolve(root, relativePath);
        if (!isInside(root, absolutePath) || !fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
          errors.push(`${location} does not resolve to an existing file: ${relativePath}.`);
        }
        if (field === 'specs') {
          const owners = registeredSpecs.get(relativePath) ?? [];
          owners.push(capability.id);
          registeredSpecs.set(relativePath, owners);
        }
      }
    }
    if (capability.status === 'as-built-baseline' && isSafeRelativePath(capability.specs?.[0])) {
      const primarySpec = path.join(root, capability.specs[0]);
      if (fs.existsSync(primarySpec) && fs.statSync(primarySpec).isFile()) {
        errors.push(...validateAsBuiltSpecification(
          fs.readFileSync(primarySpec, 'utf8'),
          capability.specs[0],
        ));
      }
    }
  }

  for (const [spec, owners] of registeredSpecs) {
    if (owners.length > 1) errors.push(`${spec} is registered by multiple capabilities: ${owners.join(', ')}.`);
  }
  for (const spec of discoverSpecificationFiles(root)) {
    if (!registeredSpecs.has(spec)) errors.push(`${spec} is not registered in the specification catalog.`);
  }
  return errors;
}

function validateAsBuiltSpecification(source, file) {
  const errors = [];
  if (!source.startsWith('# ')) errors.push(`${file} must start with one product title.`);
  for (const metadata of ['Status: As-built baseline', 'Date:', 'Owners:', 'Scope:', 'Required review gates:', 'Open decisions blocking readiness:']) {
    if (!source.includes(`- ${metadata}`)) errors.push(`${file} is missing metadata: ${metadata}`);
  }
  for (let section = 1; section <= 20; section += 1) {
    if (!new RegExp(`^## ${section}\\.`, 'm').test(source)) {
      errors.push(`${file} is missing required section ${section}.`);
    }
  }
  for (const classification of [
    'Observed behavior:',
    'Intentional contract:',
    'Known debt and limitations:',
    'Unknown rationale:',
    'Proposed improvements:',
  ]) {
    if (!source.includes(classification)) errors.push(`${file} is missing retrospective classification: ${classification}`);
  }
  if (!source.includes('```mermaid')) errors.push(`${file} must include an overview/dependency visual.`);
  for (const state of ['Pending:', 'Action required:', 'Blocked:', 'Partial:', 'Complete:']) {
    if (!source.includes(state)) errors.push(`${file} is missing representative UI state: ${state}`);
  }
  if (!/\| \*\*Total\*\* \| \*\*\d+\*\* \|/.test(source)) {
    errors.push(`${file} must declare a numeric test-budget total.`);
  }
  if (!/\bMUST\b/.test(source)) errors.push(`${file} must contain normative requirements.`);
  return errors;
}

function isSafeRelativePath(value) {
  return typeof value === 'string'
    && value.length > 0
    && value === value.trim()
    && !path.isAbsolute(value)
    && !value.includes('\\')
    && value.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..')
    && path.posix.normalize(value) === value;
}

function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function isInside(root, candidate) {
  const relative = path.relative(path.resolve(root), candidate);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

function matchesFieldBoundary(field, relativePath) {
  if (field === 'specs') return /^specs\/(?!README\.md$|_template\.md$|CATALOG\.md$).+\.md$/.test(relativePath);
  if (field === 'workflows') return /^(?:\.github|setup)\/workflows\/.+\.ya?ml$/.test(relativePath);
  if (field === 'entrypoints') return /^(?:src\/.+|action\.yml|package\.json)$/.test(relativePath);
  if (field === 'code') return /^(?:src|scripts)\//.test(relativePath);
  if (field === 'tests') return /^src\/.*(?:__tests__\/.*\.test\.ts|\.test\.ts)$/.test(relativePath);
  if (field === 'documentation') return /^(?:docs\/.*\.(?:md|mdx)|README\.md|CONTRIBUTING\.md)$/.test(relativePath);
  return false;
}

function discoverSpecificationFiles(root) {
  const excluded = new Set(['README.md', '_template.md', 'CATALOG.md']);
  const specsRoot = path.join(root, 'specs');
  const files = [];
  function visit(directory, prefix = '') {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) visit(path.join(directory, entry.name), relative);
      else if (entry.isFile() && entry.name.endsWith('.md') && !(prefix === '' && excluded.has(entry.name))) {
        files.push(`specs/${relative}`);
      }
    }
  }
  visit(specsRoot);
  return files.sort();
}

function renderCatalog(catalog) {
  const rows = catalog.capabilities.map(capability => {
    const primarySpec = capability.specs[0];
    const companionCount = capability.specs.length - 1;
    const specLabel = companionCount > 0
      ? `[${escapeCell(capability.title)}](./${path.posix.basename(primarySpec)}) + ${companionCount} companion`
      : `[${escapeCell(capability.title)}](./${path.posix.basename(primarySpec)})`;
    const evidenceCount = capability.workflows.length
      + capability.entrypoints.length
      + capability.code.length
      + capability.tests.length
      + capability.documentation.length;
    return `| \`${capability.id}\` | ${STATUS_LABELS[capability.status]} | ${escapeCell(capability.scope)} | ${specLabel} | ${evidenceCount} paths · ${capability.lastVerified} |`;
  });
  const evidenceSections = catalog.capabilities.flatMap(capability => [
    `### \`${capability.id}\` — ${capability.title}`,
    '',
    `- Owner: ${capability.owner}`,
    `- Last verified: ${capability.lastVerified}`,
    `- Specifications: ${renderPathLinks(capability.specs)}`,
    `- Workflows: ${renderPathLinks(capability.workflows)}`,
    `- Entrypoints: ${renderPathLinks(capability.entrypoints)}`,
    `- Core code: ${renderPathLinks(capability.code)}`,
    `- Tests: ${renderPathLinks(capability.tests)}`,
    `- User documentation: ${renderPathLinks(capability.documentation)}`,
    '',
  ]);
  return [
    '# Product capability specification catalog',
    '',
    '> Generated from [`catalog.json`](./catalog.json). Do not edit this table by hand.',
    '> Run `pnpm run generate:specifications` after changing catalog metadata.',
    '',
    'This catalog answers which product contract owns a capability and where its',
    'implementation, verification, workflow, and user-documentation evidence lives.',
    'An **As-built baseline** records verified current behavior; it does not hide known',
    'debt or convert unknown historic intent into a design decision.',
    '',
    '| Capability ID | Status | Scope | Primary SDD | Evidence |',
    '|---|---|---|---|---|',
    ...rows,
    '',
    '## Evidence map',
    '',
    ...evidenceSections,
    '## Maintenance contract',
    '',
    '1. Read the relevant SDD before changing a catalogued capability.',
    '2. Change the SDD, catalog evidence, tests, and user documentation together when',
    '   behavior or an architecture boundary changes.',
    '3. Use repository-relative paths in `catalog.json`; each path is validated and every',
    '   top-level product SDD must have exactly one capability owner.',
    '4. Run `pnpm run validate:specifications` in local and CI validation.',
    '',
  ].join('\n');
}

function renderPathLinks(paths) {
  if (paths.length === 0) return 'Not applicable for this capability.';
  return paths.map(relativePath => {
    const target = relativePath.startsWith('specs/')
      ? `./${path.posix.basename(relativePath)}`
      : `../${relativePath}`;
    return `[\`${relativePath}\`](${target})`;
  }).join(' · ');
}

function escapeCell(value) {
  return String(value).replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
}

function main(argv = process.argv.slice(2), root = DEFAULT_ROOT) {
  const catalog = readCatalog(root);
  const errors = validateCatalog(root, catalog);
  if (errors.length > 0) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
    return;
  }
  const rendered = renderCatalog(catalog);
  const markdownPath = path.join(root, CATALOG_MARKDOWN);
  if (argv.includes('--write')) {
    fs.writeFileSync(markdownPath, rendered, 'utf8');
    console.log(`specification catalog generation: PASS (${catalog.capabilities.length} capabilities)`);
    return;
  }
  const current = fs.existsSync(markdownPath) ? fs.readFileSync(markdownPath, 'utf8') : '';
  if (current !== rendered) {
    console.error(`${CATALOG_MARKDOWN} is stale; run pnpm run generate:specifications.`);
    process.exitCode = 1;
    return;
  }
  console.log(`specification catalog validation: PASS (${catalog.capabilities.length} capabilities)`);
}

if (require.main === module) main();

module.exports = {
  CATALOG_JSON,
  CATALOG_MARKDOWN,
  discoverSpecificationFiles,
  isIsoDate,
  isSafeRelativePath,
  matchesFieldBoundary,
  readCatalog,
  renderCatalog,
  validateAsBuiltSpecification,
  validateCatalog,
};
