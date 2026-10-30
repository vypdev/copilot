// Executes repository source against an owned file-backed provider. No network.
const fs = require('node:fs');
const ts = require('typescript');
const { setInterval } = require('node:timers');
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  module._compile(ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
  } }).outputText, filename);
};
const { runLinkPullRequestIssue } = require('../../link_pull_request_issue_workflow.ts');
const stateFile = process.argv[2];
const read = () => JSON.parse(fs.readFileSync(stateFile, 'utf8'));
const write = state => fs.writeFileSync(stateFile, JSON.stringify(state));
runLinkPullRequestIssue({ pullRequestNumber: 10, issueNumber: 42,
  originalBaseBranch: 'develop', defaultBranch: 'main', expectedHeadSha: 'a'.repeat(40),
  expectedHeadRepository: 'owner/repo', expectedHeadRef: 'bugfix/42-work' }, 'worker', {
  getDetails: async () => read(), isLinked: async () => false,
  updateDescription: async (_pr, body) => write({ ...read(), body }),
  updateBaseBranch: async (_pr, baseBranch) => write({ ...read(), baseBranch }),
}, { wait: async () => {
  process.send({ phase: 'temporary-base' });
  await new Promise(() => { setInterval(() => {}, 1000); });
} }).then(() => process.exit(2), () => process.exit(3));
