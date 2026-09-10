#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const root = path.resolve(__dirname, '..');
const docsRoot = path.join(root, 'docs');
const navigation = JSON.parse(fs.readFileSync(path.join(root, 'docs.json'), 'utf8'));
const action = yaml.load(fs.readFileSync(path.join(root, 'action.yml'), 'utf8'));
const COPILOT_ACTION_REFERENCE = 'v3';
const DISTRIBUTED_COPILOT_ACTION = `vypdev/copilot@${COPILOT_ACTION_REFERENCE}`;
const CHECKOUT_ACTION = 'actions/checkout@v5';
const MAJOR_ACTION_REFERENCE = /^[^/\s]+\/[^@\s]+@v[1-9]\d*$/;

const errors = [];
const docsFiles = fs.readdirSync(docsRoot, { recursive: true })
  .filter(file => file.endsWith('.mdx'))
  .map(file => String(file));
const docsContent = docsFiles.map(file => fs.readFileSync(path.join(docsRoot, file), 'utf8'));
const docsByFile = new Map(docsFiles.map((file, index) => [file, docsContent[index]]));
const allDocumentation = [
  fs.readFileSync(path.join(root, 'README.md'), 'utf8'),
  ...docsContent,
].join('\n');
const internalDocumentationFiles = [
  ...fs.readdirSync(path.join(root, '_agent', 'docs'), { recursive: true })
    .filter(file => file.endsWith('.md'))
    .map(file => path.join(root, '_agent', 'docs', file)),
  ...fs.readdirSync(path.join(root, '.cursor', 'rules'), { recursive: true })
    .filter(file => file.endsWith('.mdc'))
    .map(file => path.join(root, '.cursor', 'rules', file)),
];
const internalDocumentation = internalDocumentationFiles
  .map(file => fs.readFileSync(file, 'utf8'))
  .join('\n');

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

const filesByRoute = new Map(docsFiles.map(file => [routeForFile(file), file]));

function stripFencedCode(source) {
  return source.replace(/^```[\s\S]*?^```\s*$/gm, '');
}

function headingSlug(heading) {
  return heading
    .replace(/<[^>]+>/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-');
}

const anchorsByFile = new Map();
function anchorsForFile(file) {
  if (anchorsByFile.has(file)) return anchorsByFile.get(file);
  const anchors = new Set();
  const counts = new Map();
  const source = stripFencedCode(docsByFile.get(file) ?? '');
  for (const match of source.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)) {
    const base = headingSlug(match[1]);
    if (!base) continue;
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  anchorsByFile.set(file, anchors);
  return anchors;
}

function assertAnchor(route, source) {
  const hash = route.indexOf('#');
  if (hash < 0) return;
  const normalized = route.slice(0, hash) || '/';
  const fragment = decodeURIComponent(route.slice(hash + 1));
  const target = filesByRoute.get(normalized);
  if (!target || !fragment) return;
  if (!anchorsForFile(target).has(fragment)) {
    errors.push(`${source}: local documentation link targets missing heading #${fragment} in ${target}`);
  }
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
  for (const match of source.matchAll(/\]\((\/[^)\s]+)(?:\s+[^)]*)?\)/g)) {
    assertRoute(match[1], `${file}: markdown link`);
    assertAnchor(match[1], `${file}: markdown link`);
  }
  for (const match of source.matchAll(/\bhref=["'](\/[^"']+)/g)) {
    assertRoute(match[1], `${file}: href`);
    assertAnchor(match[1], `${file}: href`);
  }

  for (const match of source.matchAll(/^```(?:yaml|yml)\s*\n([\s\S]*?)^```\s*$/gm)) {
    try {
      const snippet = yaml.load(match[1]);
      visitYaml(snippet, value => {
        if (!value || typeof value !== 'object' || typeof value.uses !== 'string') return;
        if (value.uses.startsWith('actions/checkout@')) {
          if (value.uses !== CHECKOUT_ACTION) {
            const line = source.slice(0, match.index).split('\n').length;
            errors.push(`${file}:${line}: checkout examples must use ${CHECKOUT_ACTION}`);
          }
        } else if (value.uses !== DISTRIBUTED_COPILOT_ACTION
          && !value.uses.startsWith('./') && !value.uses.startsWith('docker://')
          && !MAJOR_ACTION_REFERENCE.test(value.uses)) {
          const line = source.slice(0, match.index).split('\n').length;
          errors.push(`${file}:${line}: action ${value.uses} must use a major version tag such as owner/action@v1`);
        }
        if (/^actions\/checkout@/.test(value.uses) && value.with?.['persist-credentials'] !== false) {
          const line = source.slice(0, match.index).split('\n').length;
          errors.push(`${file}:${line}: checkout examples must set persist-credentials: false`);
        }
      });
    } catch (error) {
      const line = source.slice(0, match.index).split('\n').length;
      errors.push(`${file}:${line}: invalid YAML documentation snippet: ${error.message}`);
    }
  }
}

function visitYaml(value, visitor) {
  visitor(value);
  if (Array.isArray(value)) return value.forEach(item => visitYaml(item, visitor));
  if (!value || typeof value !== 'object') return;
  Object.values(value).forEach(item => visitYaml(item, visitor));
}

for (const match of allDocumentation.matchAll(/uses:\s*vypdev\/copilot@([^\s"'`]+)/g)) {
  if (match[1] !== COPILOT_ACTION_REFERENCE) {
    errors.push(`documentation uses vypdev/copilot@${match[1]}; expected major-version ref ${COPILOT_ACTION_REFERENCE}`);
  }
}

const tick = String.fromCharCode(96);
const undocumentedInputs = Object.keys(action.inputs ?? {})
  .filter(input => !allDocumentation.includes(`${tick}${input}${tick}`));
if (undocumentedInputs.length) {
  errors.push(`action.yml inputs missing from documentation: ${undocumentedInputs.join(', ')}`);
}

const howToUse = docsByFile.get('how-to-use.mdx') ?? '';
const setupWorkflowFiles = fs.readdirSync(path.join(root, 'setup', 'workflows'))
  .filter(file => /\.ya?ml$/.test(file))
  .sort();
const missingWorkflowInventory = setupWorkflowFiles.filter(file => !howToUse.includes(`\`${file}\``));
if (missingWorkflowInventory.length) {
  errors.push(`how-to-use.mdx: setup workflow inventory is missing: ${missingWorkflowInventory.join(', ')}`);
}

const actionTypesSource = fs.readFileSync(path.join(root, 'src', 'data', 'model', 'action_types.ts'), 'utf8');
const actionValues = [...actionTypesSource.matchAll(/:\s*'([^']+)'/g)].map(match => match[1]);
const availableActions = docsByFile.get('single-actions/available-actions.mdx') ?? '';
const internalUseCaseFlows = fs.readFileSync(path.join(root, '_agent', 'docs', 'usecase-flows.md'), 'utf8');
const missingActions = actionValues.filter(value => !availableActions.includes(`\`${value}\``));
if (missingActions.length) {
  errors.push(`single-actions/available-actions.mdx: single-action catalog is missing: ${missingActions.join(', ')}`);
}
const missingInternalActions = actionValues.filter(value => !internalUseCaseFlows.includes(`\`${value}\``));
if (missingInternalActions.length) {
  errors.push(`_agent/docs/usecase-flows.md: single-action dispatch catalog is missing: ${missingInternalActions.join(', ')}`);
}
const internalActionSection = availableActions.split('## Workflow-owned deployment actions')[1]?.split('\n## ')[0] ?? '';
for (const value of ['create_tag', 'prepare_deployment_action', 'continue_deployment_action', 'published_deployment_action', 'failed_deployment_action']) {
  if (!internalActionSection.includes(`\`${value}\``)) {
    errors.push(`single-actions/available-actions.mdx: ${value} must be documented as a workflow-owned deployment action`);
  }
}
const issueFreeActionSection = availableActions.split('## Actions that do not require an issue')[1]?.split('\n## ')[0] ?? '';
if (/^\|\s+\*\*`create_tag`\*\*\s+\|/m.test(issueFreeActionSection)) {
  errors.push('single-actions/available-actions.mdx: create_tag cannot be documented as an issue-free action');
}
if (!internalActionSection.includes('durable operation')) {
  errors.push('single-actions/available-actions.mdx: workflow-owned deployment actions must document their durable-operation boundary');
}

function documentedIssueTemplate(file) {
  const source = docsByFile.get(file) ?? '';
  for (const match of source.matchAll(/^```(?:yaml|yml)\s*\n([\s\S]*?)^```\s*$/gm)) {
    try {
      const value = yaml.load(match[1]);
      if (value && typeof value === 'object' && value.name && Array.isArray(value.body)) return value;
    } catch {
      // YAML syntax errors are already reported by the generic snippet validation above.
    }
  }
  return undefined;
}

const issueTemplatePairs = [
  ['issues/type/release.mdx', 'release.yml'],
  ['issues/type/hotfix.mdx', 'hotfix.yml'],
  ['issues/type/feature.mdx', 'feature_request.yml'],
  ['issues/type/bugfix.mdx', 'bug_report.yml'],
  ['issues/type/docs.mdx', 'doc_update.yml'],
  ['issues/type/chore.mdx', 'chore_task.yml'],
];
for (const [documentationFile, templateFile] of issueTemplatePairs) {
  const documented = documentedIssueTemplate(documentationFile);
  const actual = yaml.load(fs.readFileSync(path.join(root, 'setup', 'ISSUE_TEMPLATE', templateFile), 'utf8'));
  if (!documented) {
    errors.push(`${documentationFile}: missing complete embedded issue template`);
  } else if (JSON.stringify(documented) !== JSON.stringify(actual)) {
    errors.push(`${documentationFile}: embedded issue template differs from setup/ISSUE_TEMPLATE/${templateFile}`);
  }
}

function requireText(file, expected, contract) {
  if (!(docsByFile.get(file) ?? '').includes(expected)) errors.push(`${file}: missing ${contract}: ${expected}`);
}

requireText('issues/configuration.mdx', '`ai-pull-request-description-mode`: PR body policy', 'canonical PR description policy');
requireText('bugbot/quality-observability.mdx', 'Check is neutral when a successful review reports actionable findings', 'non-blocking Bugbot default');
requireText('issues/deployment-orchestration.mdx', '**Allowed actions** to permit direct', 'npm direct-publish prerequisite');
requireText('issues/deployment-orchestration.mdx', '`NPM_VISIBILITY_POLL_INTERVAL_SECONDS`', 'npm polling variable');
requireText('issues/deployment-orchestration.mdx', '`NPM_VISIBILITY_TIMEOUT_SECONDS`', 'npm timeout variable');
requireText('issues/deployment-orchestration.mdx', 'default branch before launching an operation', 'default-branch rollout prerequisite');

for (const variable of [
  'RELEASE_RECONCILIATION_STRATEGY', 'HOTFIX_RECONCILIATION_STRATEGY',
  'RECONCILIATION_PR_MODE', 'MERGE_QUEUE_CHECK_ATTESTATIONS', 'RECONCILIATION_BACKMERGE_MODE',
  'HOTFIX_ACTIVE_RELEASE_POLICY', 'RECONCILIATION_TREE',
  'RECONCILIATION_CLEANUP', 'RECONCILIATION_ISSUE_COMPLETION',
  'ORCHESTRATION_PRESENTATION_MODE', 'ORCHESTRATION_DIAGRAMS',
  'ORCHESTRATION_COMMENT_MODE',
]) {
  requireText('issues/deployment-orchestration.mdx', `\`${variable}\``, 'deployment Repository Variable mapping');
}

const publicContractText = [
  fs.readFileSync(path.join(root, 'action.yml'), 'utf8'),
  allDocumentation,
  ...setupWorkflowFiles.map(file => fs.readFileSync(path.join(root, 'setup', 'workflows', file), 'utf8')),
  fs.readFileSync(path.join(root, 'setup', 'pull_request_template.md'), 'utf8'),
].join('\n');
const maintainedContractText = `${publicContractText}\n${internalDocumentation}`;
const retiredContracts = [
  ['post-deployment single action', /\bdeployed_action\b/],
  ['runner-owned PR wait mode', /\blegacy-wait\b/],
  ['runner-owned PR timeout input', /\bmerge-timeout\b/],
  ['PR description boolean input', /\bai-pull-request-description(?!-mode)\b/],
  ['branch synchronization alias', /\/copilot\s+update-branch\b/],
  ['camel-case branch synchronization alias', /\/copilot\s+updateBranch\b/],
  ['unhyphenated Bugbot dry-run option', /\bdryrun=(?:true|false)\b/],
  ['Bugbot verbose option alias', /\bverbose=(?:true|false)\b/],
  ['Bugbot suggestions option alias', /\bsuggestions=(?:true|false)\b/],
  ['manual deployed transition', /\bmark(?: an issue)? as deployed\b/i],
];
for (const [contract, pattern] of retiredContracts) {
  if (pattern.test(maintainedContractText)) errors.push(`maintained contract still contains retired ${contract}`);
}
for (const [contract, pattern] of [
  ['pre-clean-architecture source root', /\bsrc\/usecase\//],
  ['removed global constants module', /\bsrc\/utils\/constants\.ts\b/],
  ['provider-specific Bugbot guard', /\bOpenCode must be configured\b/],
  ['npm-based contributor command', /\bnpm run (?:build|test|lint)/],
  ['unsupported contributor runtime', /\b(?:Use Node|nvm use) 20\b/i],
]) {
  if (pattern.test(internalDocumentation)) errors.push(`internal documentation still contains ${contract}`);
}

const obsoleteDocumentation = [
  ['single-actions/deploy-label-and-merge.mdx', 'release-to-default', 'old concurrent release merge flow'],
  ['single-actions/deploy-label-and-merge.mdx', 'direct merge compatibility fallback', 'old direct-merge fallback'],
  ['README.md', 'active findings fail that check', 'obsolete unconditional Bugbot failure'],
];
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
for (const [file, phrase, contract] of obsoleteDocumentation) {
  const source = file === 'README.md' ? readme : (docsByFile.get(file) ?? '');
  if (source.toLowerCase().includes(phrase.toLowerCase())) errors.push(`${file}: contains ${contract}: ${phrase}`);
}

if (/\bgiik\b/i.test(allDocumentation)) errors.push('documentation contains the obsolete product name giik');

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(`documentation contract validation: PASS (${docsFiles.length} MDX pages, ${routes.size} registered routes, ${Object.keys(action.inputs ?? {}).length} documented action inputs, ${setupWorkflowFiles.length} workflows, ${actionValues.length} single actions, ${issueTemplatePairs.length} synchronized issue templates)`);
