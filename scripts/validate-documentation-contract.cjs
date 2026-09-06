#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const root = path.resolve(__dirname, '..');
const docsRoot = path.join(root, 'docs');
const navigation = JSON.parse(fs.readFileSync(path.join(root, 'docs.json'), 'utf8'));
const action = yaml.load(fs.readFileSync(path.join(root, 'action.yml'), 'utf8'));
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const errors = [];
const docsFiles = fs.readdirSync(docsRoot, { recursive: true })
  .filter(file => file.endsWith('.mdx'))
  .map(file => String(file));
const docsContent = docsFiles.map(file => fs.readFileSync(path.join(docsRoot, file), 'utf8'));
const allDocumentation = [
  fs.readFileSync(path.join(root, 'README.md'), 'utf8'),
  ...docsContent,
].join('\n');

const routes = new Set();
function collectRoutes(value) {
  if (Array.isArray(value)) {
    value.forEach(collectRoutes);
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (typeof value.href === 'string' && value.href.startsWith('/')) routes.add(value.href);
  Object.values(value).forEach(collectRoutes);
}
collectRoutes(navigation);

function routeForFile(file) {
  const withoutExtension = file.slice(0, -'.mdx'.length);
  if (withoutExtension === 'index') return '/';
  if (withoutExtension.endsWith('/index')) return `/${withoutExtension.slice(0, -'/index'.length)}`;
  return `/${withoutExtension}`;
}

for (const file of docsFiles) {
  const route = routeForFile(file);
  if (!routes.has(route)) errors.push(`${file}: public MDX page is not registered in docs.json as ${route}`);
}

function assertRoute(route, source) {
  const normalized = route.split('#', 1)[0] || '/';
  if (!routes.has(normalized)) errors.push(`${source}: local documentation link targets an unregistered route ${normalized}`);
}

for (const [index, source] of docsContent.entries()) {
  const file = docsFiles[index];
  for (const match of source.matchAll(/\]\((\/[^)\s]+)(?:\s+[^)]*)?\)/g)) assertRoute(match[1], `${file}: markdown link`);
  for (const match of source.matchAll(/\bhref=["'](\/[^"']+)/g)) assertRoute(match[1], `${file}: href`);

  for (const match of source.matchAll(/^```(?:yaml|yml)\s*\n([\s\S]*?)^```\s*$/gm)) {
    try {
      yaml.load(match[1]);
    } catch (error) {
      const line = source.slice(0, match.index).split('\n').length;
      errors.push(`${file}:${line}: invalid YAML documentation snippet: ${error.message}`);
    }
  }
}

const expectedActionMajor = `v${String(packageJson.version).split('.')[0]}`;
for (const match of allDocumentation.matchAll(/uses:\s*vypdev\/copilot@([^\s"'`]+)/g)) {
  if (match[1] !== expectedActionMajor) {
    errors.push(`documentation uses vypdev/copilot@${match[1]}; expected the published major ref ${expectedActionMajor}`);
  }
}

const tick = String.fromCharCode(96);
const undocumentedInputs = Object.keys(action.inputs ?? {})
  .filter(input => !allDocumentation.includes(`${tick}${input}${tick}`));
if (undocumentedInputs.length) {
  errors.push(`action.yml inputs missing from documentation: ${undocumentedInputs.join(', ')}`);
}

if (/\bgiik\b/i.test(allDocumentation)) errors.push('documentation contains the obsolete product name giik');

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(`documentation contract validation: PASS (${docsFiles.length} MDX pages, ${routes.size} registered routes, ${Object.keys(action.inputs ?? {}).length} documented action inputs)`);
