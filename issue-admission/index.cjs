'use strict';

// Metadata's required:true is advisory; never fall through to the mutation entry.
const mode = (process.env['INPUT_ISSUE-EVENT-ADMISSION-MODE'] ?? '').trim();
if (mode !== 'inspect' && mode !== 'record') {
  process.stderr.write('Issue admission requires inspect or record mode. No pipeline was started.\n');
  process.exitCode = 1;
} else {
  // This isolated action has no JSON input-override channel or native worker mode.
  delete process.env.INPUT_VARS_JSON;
  process.env.COPILOT_ISSUE_ADMISSION_BOOTSTRAP = '1';
  void require('../build/github_action/index.js').runGitHubActionEntry();
}
