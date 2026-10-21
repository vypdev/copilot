const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const MAX_REQUESTS = 20;
const ACTION = './.github/actions/copilot-verification-setup';
const MARKER = '      # copilot:native-verification:start';
const CALLBACKS = ['copilot_issue_comment.yml', 'copilot_pull_request_comment.yml'];

function phaseSteps(action, inputAlias = 'copilot-inputs', id = 'copilot') {
  const steps = [];
  let previous = id;
  for (let count = 1; count <= MAX_REQUESTS; count++) {
    const setup = `verification_setup_${count}`;
    const continuation = `verification_continue_${count}`;
    const pending = `steps.${previous}.outputs.verification-setup-pending == 'true'`;
    const output = key => `\${{ steps.${previous}.outputs.verification-${key} }}`;
    steps.push({ name: `Prepare repository verification ${count}`, id: setup,
      if: `\${{ !cancelled() && steps.${previous}.outcome == 'success' && ${pending} }}`, uses: ACTION, 'timeout-minutes': 5,
      env: Object.fromEntries(['HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'PATH', 'JAVA_HOME', 'TMP', 'TEMP', 'TMPDIR'].map(key => [key, output(key.toLowerCase())])) });
    steps.push({ name: `Continue repository verification ${count}`, id: continuation,
      if: `\${{ always() && ${pending} }}`, uses: action, with: { alias: inputAlias },
      env: { COPILOT_NATIVE_PHASE: 'continue', COPILOT_NATIVE_TICKET: `\${{ steps.${id}.outputs.verification-ticket }}`,
        COPILOT_NATIVE_REQUEST: `\${{ steps.${previous}.outputs.verification-request }}`,
        COPILOT_NATIVE_OUTCOME: `\${{ steps.${setup}.outcome }}` } });
    previous = continuation;
  }
  steps.push({ name: 'Complete repository verification', id: 'verification_complete',
    if: `\${{ always() && steps.${id}.outputs.verification-ticket != '' }}`, uses: action, with: { alias: inputAlias },
    env: { COPILOT_NATIVE_PHASE: 'finish', COPILOT_NATIVE_TICKET: `\${{ steps.${id}.outputs.verification-ticket }}` } });
  return steps;
}

function renderSteps(action, alias = 'copilot-inputs', id = 'copilot') {
  return yaml.dump(phaseSteps(action, alias, id), { lineWidth: -1, noRefs: true, quotingType: '"' })
    .replace(/with:\n    alias: ([^\n]+)/g, 'with: *$1')
    .split('\n').map(line => line ? `      ${line}` : '').join('\n');
}

function generate(file) {
  let text = fs.readFileSync(file, 'utf8').split(MARKER)[0].trimEnd() + '\n';
  const action = file.startsWith('setup/') ? 'vypdev/copilot@v3' : './';
  const start = `      - uses: ${action}\n`;
  text = text.replace(/(?:        id: copilot\n)+/g, '');
  if (text.includes(start)) text = text.replace(start, `      - uses: ${action}\n        id: copilot\n`);
  text = text.replace('        with:\n          debug:', '        with: &copilot-inputs\n          debug:');
  // Distributed templates start with agent inputs rather than debug.
  const index = text.indexOf('        id: copilot\n');
  const before = text.slice(0, index);
  let operation = text.slice(index);
  operation = operation.replace('        with:\n', '        with: &copilot-inputs\n');
  if (!operation.includes('          COPILOT_NATIVE_PHASE: prepare')) operation = operation.replace('        env:\n', '        env:\n          COPILOT_NATIVE_PHASE: prepare\n');
  text = before + operation;
  fs.writeFileSync(file, `${text}\n${MARKER}\n${renderSteps(action)}      # copilot:native-verification:end\n`);
}

if (require.main === module) for (const directory of ['.github/workflows', 'setup/workflows']) for (const file of CALLBACKS) generate(path.join(directory, file));
module.exports = { MAX_REQUESTS, ACTION, CALLBACKS, phaseSteps, renderSteps };
