const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const root = path.resolve(__dirname, '..');
const action = yaml.load(fs.readFileSync(path.join(root, 'action.yml'), 'utf8'));
const docsRoot = path.join(root, 'docs');
const docs = fs.readdirSync(docsRoot, { recursive: true })
  .filter(file => file.endsWith('.mdx'))
  .map(file => fs.readFileSync(path.join(docsRoot, file), 'utf8'))
  .join('\n');

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
  'opencode-model',
  'opencode-server-url',
  'opencode-start-server',
  'OPENCODE_SERVER_URL',
  'opencode serve',
  'OPENCODE_DEFAULT_MODEL',
  'OPENCODE_MODEL',
];
for (const value of forbidden) {
  if (docs.includes(value)) throw new Error(`Forbidden legacy documentation reference: ${value}`);
}

for (const value of ['AGENT_ALLOWED_MODEL_PROVIDERS', 'AGENT_ALLOWED_MODELS', 'opencode run --model']) {
  if (!docs.includes(value)) throw new Error(`Missing normative documentation reference: ${value}`);
}

const workflowFiles = fs.readdirSync(path.join(root, 'setup', 'workflows')).filter(file => file.endsWith('.yml'));
if (!workflowFiles.length) throw new Error('No workflow files found');
for (const file of workflowFiles) {
  const content = fs.readFileSync(path.join(root, 'setup', 'workflows', file), 'utf8');
  if (!content.includes('AGENT_ALLOWED_MODEL_PROVIDERS')) continue;
  for (const value of ["'openai'", "'openai/gpt-5.6-luna'"]) {
    if (!content.includes(value)) throw new Error(`${file} is missing approved fallback ${value}`);
  }
}

console.log(`agent documentation validation: PASS (${workflowFiles.length} workflows)`);
