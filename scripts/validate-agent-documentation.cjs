const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const root = path.resolve(__dirname, '..');
const action = yaml.load(fs.readFileSync(path.join(root, 'action.yml'), 'utf8'));
const docsRoot = path.join(root, 'docs');
const docFiles = fs.readdirSync(docsRoot, { recursive: true })
  .filter(file => file.endsWith('.mdx'));
const docs = docFiles.map(file => fs.readFileSync(path.join(docsRoot, file), 'utf8')).join('\\n');
const auditableFiles = [
  path.join(root, 'action.yml'),
  path.join(root, 'README.md'),
  ...fs.readdirSync(path.join(root, 'src'), { recursive: true })
    .filter(file => file.endsWith('.ts'))
    .map(file => path.join(root, 'src', file)),
];
const auditableContent = auditableFiles.map(file => fs.readFileSync(file, 'utf8')).join('\\n');

const requiredInputs = ['agent-provider', 'agent-model-provider', 'agent-model', 'agent-command'];
const missingInputs = requiredInputs.filter(input => !action.inputs?.[input]);
if (missingInputs.length) throw new Error(`Missing agent inputs in action.yml: ${missingInputs.join(', ')}`);

const expectedDefaults = {
  'agent-provider': 'opencode',
  'agent-model-provider': 'openai',
  'agent-model': 'gpt-5.6-luna',
};
for (const [input, expected] of Object.entries(expectedDefaults)) {
  if (action.inputs[input].default !== expected) {
    throw new Error(`Unexpected ${input} default: ${JSON.stringify(action.inputs[input].default)} (expected ${expected})`);
  }
  if (!docs.includes(`\`${input}\``) || !docs.includes(`\`${expected}\``)) {
    throw new Error(`Documentation does not describe ${input}=${expected}`);
  }
}

const forbidden = [
  'opencode-model', 'opencode-server-url', 'opencode-start-server',
  'OPENCODE_SERVER_URL', 'opencode serve', 'OPENCODE_DEFAULT_MODEL', 'OPENCODE_MODEL',
];
for (const value of forbidden) {
  if (docs.includes(value) || auditableContent.includes(value)) {
    throw new Error(`Forbidden legacy implementation/documentation reference: ${value}`);
  }
}
for (const value of ['AGENT_ALLOWED_MODEL_PROVIDERS', 'AGENT_ALLOWED_MODELS', 'opencode run --model']) {
  if (!docs.includes(value)) throw new Error(`Missing normative documentation reference: ${value}`);
}

const requiredPages = [
  'overview.mdx', 'quick-start.mdx', 'configuration-checklist.mdx',
  'agent-execution-contract.mdx', 'runtime-selection.mdx', 'model-selection.mdx',
  'model-allowlists.mdx', 'cli-commands.mdx', 'agent-failure-policy.mdx',
  'security/credentials.mdx', 'security/trust-boundaries.mdx',
  'security/forks-and-pull-request-target.mdx', 'security/self-hosted-runners.mdx',
  'security/secret-exposure.mdx', 'operations/provisioning.mdx',
  'operations/verification.mdx', 'operations/smoke-tests.mdx',
  'operations/upgrade-rollback.mdx', 'bugbot/finding-publication.mdx',
  'bugbot/permissions.mdx', 'bugbot/verification-commands.mdx',
  'development/architecture.mdx', 'development/local-development.mdx',
  'development/testing.mdx', 'development/build-artifacts.mdx',
  'development/release-process.mdx', 'documentation-completeness-plan.mdx',
];
for (const file of requiredPages) {
  const absolute = path.join(docsRoot, file);
  if (!fs.existsSync(absolute)) throw new Error(`Missing required documentation page: ${file}`);
  const content = fs.readFileSync(absolute, 'utf8');
  if (!content.startsWith('---\n') || !content.includes('\ntitle:')) {
    throw new Error(`Invalid MDX frontmatter: ${file}`);
  }
}

const docsConfig = JSON.parse(fs.readFileSync(path.join(root, 'docs.json'), 'utf8'));
const routes = [];
function collect(value) {
  if (Array.isArray(value)) return value.forEach(collect);
  if (!value || typeof value !== 'object') return;
  if (typeof value.href === 'string' && value.href.startsWith('/')) routes.push(value.href);
  Object.values(value).forEach(collect);
}
collect(docsConfig);
const categoryRoutes = new Set(['/', '/issues', '/pull-requests', '/single-actions', '/bugbot']);
const missingRoutes = [...new Set(routes)].filter(route => !categoryRoutes.has(route))
  .filter(route => !fs.existsSync(path.join(docsRoot, `${route.slice(1)}.mdx`)) && !fs.existsSync(path.join(docsRoot, `${route.slice(1)}.md`)));
if (missingRoutes.length) throw new Error(`Missing docs.json routes: ${missingRoutes.join(', ')}`);

const workflowFiles = fs.readdirSync(path.join(root, 'setup', 'workflows')).filter(file => file.endsWith('.yml'));
if (!workflowFiles.length) throw new Error('No workflow files found');
for (const file of workflowFiles) {
  const content = fs.readFileSync(path.join(root, 'setup', 'workflows', file), 'utf8');
  if (!content.includes('AGENT_ALLOWED_MODEL_PROVIDERS')) continue;
  for (const value of ["'openai'", "'openai/gpt-5.6-luna'"]) {
    if (!content.includes(value)) throw new Error(`${file} is missing approved fallback ${value}`);
  }
}

console.log(`agent documentation validation: PASS (${docFiles.length} MDX pages, ${workflowFiles.length} workflows, ${new Set(routes).size} routes)`);
