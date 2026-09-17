const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
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

const agentFields = ['provider', 'model-provider', 'model', 'effort', 'executable'];
const requiredInputs = [
  ...agentFields.map(field => `agent-${field}`),
  ...['planner', 'findings', 'reviewer', 'fixer', 'tester']
    .flatMap(role => agentFields.map(field => `${role}-${field}`)),
];
const missingInputs = requiredInputs.filter(input => !action.inputs?.[input]);
if (missingInputs.length) throw new Error(`Missing agent inputs in action.yml: ${missingInputs.join(', ')}`);

const expectedDefaults = {
  'agent-provider': 'codex',
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
  'agent-command', 'planner-command', 'findings-command', 'reviewer-command', 'fixer-command', 'tester-command',
  'AGENT_COMMAND', 'PLANNER_COMMAND', 'FINDINGS_COMMAND', 'REVIEWER_COMMAND', 'FIXER_COMMAND', 'TESTER_COMMAND',
  'CODEX_VERSION', 'OPENCODE_VERSION', 'CURSOR_INSTALLER_SHA256',
];
for (const value of forbidden) {
  if (docs.includes(value) || auditableContent.includes(value)) {
    throw new Error(`Forbidden retired implementation/documentation reference: ${value}`);
  }
}
for (const value of [
  'AGENT_ALLOWED_MODEL_PROVIDERS', 'AGENT_ALLOWED_MODELS', 'opencode run --pure',
  'agent-executable', 'codex-cli 0.153.4', '1.18.3', '2026.09.10-fd3934a',
]) {
  if (!docs.includes(value)) throw new Error(`Missing normative documentation reference: ${value}`);
}
for (const value of ['model_reasoning_effort', '--variant', 'AGENT_PROVISIONING']) {
  if (!docs.includes(value)) throw new Error(`Missing normative documentation reference: ${value}`);
}

const requiredPages = [
  'overview.mdx', 'quick-start.mdx', 'configuration-checklist.mdx',
  'agents/execution-contract.mdx', 'agents/runtime-selection.mdx', 'agents/model-selection.mdx',
  'agents/model-allowlists.mdx', 'agents/cli-commands.mdx', 'agents/failure-policy.mdx',
  'agents/codex-openai.mdx', 'agents/cursor.mdx',
  'agents/repository-collaboration.mdx', 'agents/repository-guidance-troubleshooting.mdx',
  'issues/configurable-workflows.mdx', 'issues/type/help.mdx',
  'security-operations/security/credentials.mdx', 'security-operations/security/trust-boundaries.mdx',
  'security-operations/security/forks-and-pull-request-target.mdx', 'security-operations/security/self-hosted-runners.mdx',
  'security-operations/security/secret-exposure.mdx', 'security-operations/operations/provisioning.mdx',
  'security-operations/operations/verification.mdx', 'security-operations/operations/smoke-tests.mdx',
  'security-operations/operations/upgrade-rollback.mdx', 'bugbot/finding-publication.mdx',
  'bugbot/permissions.mdx', 'bugbot/verification-commands.mdx',
  'development/architecture.mdx', 'development/local-development.mdx',
  'development/specifications.mdx',
  'development/testing.mdx', 'development/build-artifacts.mdx',
  'development/release-process.mdx', 'development/documentation-completeness-plan.mdx',
  'development/agent-functionality-audit.mdx',
];
for (const file of requiredPages) {
  const absolute = path.join(docsRoot, file);
  if (!fs.existsSync(absolute)) throw new Error(`Missing required documentation page: ${file}`);
  const content = fs.readFileSync(absolute, 'utf8');
  if (!content.startsWith('---\n') || !content.includes('\ntitle:')) {
    throw new Error(`Invalid MDX frontmatter: ${file}`);
  }
}

const generatedArtifactPaths = {
  '.copilot/repository-profile.json': 'profile',
  '.copilot/AGENT_GUIDE.md': 'guide',
  '.agents/skills/copilot-repository-workflow/SKILL.md': 'skill',
  'AGENTS.md': 'pointer',
};
const generatedManifest = JSON.parse(fs.readFileSync(path.join(root, '.copilot/setup-manifest.json'), 'utf8'));
if (generatedManifest.schemaVersion !== 2
  || generatedManifest.generator?.name !== '@vypdev/copilot'
  || generatedManifest.generator?.contractVersion !== 1) {
  throw new Error('Dogfood agent guidance manifest has an unsupported generator contract.');
}
for (const [relative, role] of Object.entries(generatedArtifactPaths)) {
  const record = generatedManifest.artifacts?.[relative];
  if (!record || record.role !== role || !/^[a-f0-9]{64}$/.test(record.sha256)) {
    throw new Error(`Dogfood manifest is missing a valid ${role} record for ${relative}.`);
  }
  const content = fs.readFileSync(path.join(root, relative), 'utf8');
  const hashedContent = role === 'pointer'
    ? content.match(/<!-- copilot:agent-guidance:start -->[\s\S]*?<!-- copilot:agent-guidance:end -->/)?.[0]
    : content;
  if (!hashedContent || createHash('sha256').update(hashedContent, 'utf8').digest('hex') !== record.sha256) {
    throw new Error(`Dogfood ${role} content does not match its manifest hash: ${relative}.`);
  }
}

const profile = JSON.parse(fs.readFileSync(path.join(root, '.copilot/repository-profile.json'), 'utf8'));
const expectedProfileKeys = ['branches', 'deployment', 'generator', 'issueWorkflows', 'pullRequests', 'schemaVersion'];
if (JSON.stringify(Object.keys(profile).sort()) !== JSON.stringify(expectedProfileKeys)
  || profile.schemaVersion !== 2
  || profile.branches?.remoteLifecycleOwner !== 'github-action'
  || profile.branches?.startLabel !== 'in-progress'
  || profile.branches?.readyLabel !== 'branched'
  || profile.branches?.helpCreatesBranch !== false
  || profile.pullRequests?.mustLinkIssue !== true
  || profile.deployment?.agentMayInitiateWithoutExplicitAuthorization !== false) {
  throw new Error('Dogfood repository profile violates the collaborator-agent schema or branch/deployment invariants.');
}
const skill = fs.readFileSync(path.join(root, '.agents/skills/copilot-repository-workflow/SKILL.md'), 'utf8');
const skillFrontmatter = yaml.load(skill.split('---')[1]);
if (skillFrontmatter?.name !== 'copilot-repository-workflow'
  || typeof skillFrontmatter?.description !== 'string'
  || !skill.includes('.copilot/repository-profile.json')
  || !skill.includes('.copilot/AGENT_GUIDE.md')
  || !skill.includes('Never invent, replace, rename, delete, or force-push')) {
  throw new Error('Dogfood collaborator skill is missing required metadata, links, or branch invariants.');
}
const guide = fs.readFileSync(path.join(root, '.copilot/AGENT_GUIDE.md'), 'utf8');
for (const required of [
  'repository collaborator agents',
  'exact installed Issue Form',
  'GitHub Action exclusively owns creation',
  'Never expose credentials',
  'explicit authorization for that exact operation',
]) {
  if (!guide.includes(required)) throw new Error(`Dogfood collaborator guide is missing required content: ${required}.`);
}
const generatedContent = [JSON.stringify(profile), guide, skill].join('\n');
if (/(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\/(?:Users|home)\/[^/\s]+\/)/.test(generatedContent)) {
  throw new Error('Dogfood collaborator guidance contains secret-like or machine-local content.');
}
const internalGuidanceImports = fs.readdirSync(path.join(root, 'src'), { recursive: true })
  .filter(file => file.endsWith('.ts')
    && !file.includes('__tests__')
    && !file.includes('repository_agent_guidance')
    && file !== 'application/policies/setup_configuration_plan.ts')
  .filter(file => {
    const content = fs.readFileSync(path.join(root, 'src', file), 'utf8');
    return content.includes('.copilot/AGENT_GUIDE.md') || content.includes('copilot-repository-workflow');
  });
if (internalGuidanceImports.length) {
  throw new Error(`Internal Action code must not ingest collaborator guidance: ${internalGuidanceImports.join(', ')}.`);
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
  .filter(route => {
    const relative = route.slice(1);
    return !fs.existsSync(path.join(docsRoot, `${relative}.mdx`))
      && !fs.existsSync(path.join(docsRoot, `${relative}.md`))
      && !fs.existsSync(path.join(docsRoot, relative, 'index.mdx'))
      && !fs.existsSync(path.join(docsRoot, relative, 'index.md'));
  });
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
