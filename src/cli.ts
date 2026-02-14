#!/usr/bin/env node

import { execSync } from 'child_process';
import { Command } from 'commander';
import * as dotenv from 'dotenv';
import { runLocalAction } from './actions/local_action';
import { IssueRepository } from './data/repository/issue_repository';
import { ACTIONS, ERRORS, INPUT_KEYS, OPENCODE_DEFAULT_MODEL, TITLE } from './utils/constants';
import { getSetupToken, hasValidSetupToken, setupEnvFileExists } from './utils/setup_files';
import { logError, logInfo } from './utils/logger';
import { getCliDoPrompt } from './prompts';
import { Ai } from './data/model/ai';
import { OPENCODE_PROJECT_CONTEXT_INSTRUCTION } from './utils/opencode_project_context_instruction';
import { AiRepository } from './data/repository/ai_repository';

// Load environment variables from .env file
dotenv.config();

const program = new Command();

// Function to get git repository info
function getGitInfo() {
  try {
    const remoteUrl = execSync('git config --get remote.origin.url').toString().trim();
    const match = remoteUrl.match(/github\.com[/:]([^/]+)\/([^/]+)(?:\.git)?$/);
    if (!match) {
      return { error: ERRORS.GIT_REPOSITORY_NOT_FOUND };
    }
    return {
      owner: match[1],
      repo: match[2].replace('.git', '')
    };
  } catch {
    return { error: ERRORS.GIT_REPOSITORY_NOT_FOUND };
  }
}

/** Get current git branch (for CLI commands that need a branch when -b is omitted). */
function getCurrentBranch(): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD').toString().trim() || 'main';
  } catch {
    return 'main';
  }
}

/**
 * Run the thinking AI scenario for deep code analysis and proposals.
 */
program
  .command('think')
  .description(`${TITLE} - Deep code analysis and change proposals using AI reasoning`)
  .option('-i, --issue <number>', 'Issue number to process (optional)', '1')
  .option('-b, --branch <name>', 'Branch name', 'master')
  .option('-d, --debug', 'Debug mode', false)
  .option('-t, --token <token>', 'Personal access token', process.env.PERSONAL_ACCESS_TOKEN)
  .option('-q, --question <question...>', 'Question or prompt for analysis', '')
  .option('--opencode-server-url <url>', 'OpenCode server URL (e.g. http://127.0.0.1:4096)', '')
  .option('--opencode-model <model>', `OpenCode model (e.g. ${OPENCODE_DEFAULT_MODEL}, openai/gpt-4o-mini)`, '')
  .option('--ai-ignore-files <ai-ignore-files>', 'AI ignore files', 'node_modules/*,build/*')
  .option('--include-reasoning <include-reasoning>', 'Include reasoning', 'false')
  .action(async (options) => {    
    const gitInfo = getGitInfo();
    
    if ('error' in gitInfo) {
      logError(gitInfo.error);
      process.exit(1);
    }

    // Helper function to clean CLI arguments that may have '=' prefix
    const cleanArg = (value: unknown): string => {
      if (value == null) return '';
      const str = String(value);
      return str.startsWith('=') ? str.substring(1) : str;
    };

    const questionParts = (options.question || []).map(cleanArg);
    const question = questionParts.join(' ');

    if (!question || question.length === 0) {
      console.log('❌ Please provide a question or prompt using -q or --question');
      return;
    }

    const branch = cleanArg(options.branch);
    const issueNumber = cleanArg(options.issue);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CLI options map to action inputs
    const params: any = {
      [INPUT_KEYS.DEBUG]: options.debug.toString(),
      [INPUT_KEYS.SINGLE_ACTION]: ACTIONS.THINK,
      [INPUT_KEYS.SINGLE_ACTION_ISSUE]: parseInt(issueNumber) || 1,
      [INPUT_KEYS.TOKEN]: options?.token?.length > 0 ? options.token : process.env.PERSONAL_ACCESS_TOKEN,
      [INPUT_KEYS.OPENCODE_SERVER_URL]: options?.opencodeServerUrl?.length > 0 ? options.opencodeServerUrl : process.env.OPENCODE_SERVER_URL,
      [INPUT_KEYS.OPENCODE_MODEL]: options?.opencodeModel?.length > 0 ? options.opencodeModel : process.env.OPENCODE_MODEL || OPENCODE_DEFAULT_MODEL,
      [INPUT_KEYS.AI_IGNORE_FILES]: options?.aiIgnoreFiles?.length > 0 ? options.aiIgnoreFiles : process.env.AI_IGNORE_FILES,
      [INPUT_KEYS.AI_INCLUDE_REASONING]: options?.includeReasoning?.length > 0 ? options.includeReasoning : process.env.AI_INCLUDE_REASONING,
      repo: {
        owner: gitInfo.owner,
        repo: gitInfo.repo,
      },
      commits: {
        ref: `refs/heads/${branch}`,
      },
    }

    // Set up issue context if provided
    const parsedIssueNumber = parseInt(issueNumber);
    if (issueNumber && parsedIssueNumber > 0) {
      const issueRepository = new IssueRepository();
      const isIssue = await issueRepository.isIssue(
        gitInfo.owner,
        gitInfo.repo,
        parsedIssueNumber,
        params[INPUT_KEYS.TOKEN] ?? ''
      );

      if (isIssue) {
        params.eventName = 'issue';
        params.issue = {
          number: parsedIssueNumber,
        }
        params.comment = {
          body: question,
        }
      }
    } else {
      // If no issue provided, set up as issue with question as body
      params.eventName = 'issue';
      params.issue = {
        number: 1,
      }
      params.comment = {
        body: question,
      }
    }

    params[INPUT_KEYS.WELCOME_TITLE] = '🤔 AI Reasoning Analysis';
    params[INPUT_KEYS.WELCOME_MESSAGES] = [
      `Starting deep code analysis for ${gitInfo.owner}/${gitInfo.repo}/${branch}...`,
      `Question: ${question.substring(0, 100)}${question.length > 100 ? '...' : ''}`,
    ];

    runLocalAction(params);
  });

/**
 * Do - AI development assistant using OpenCode "build" agent.
 * When the OpenCode server is run locally from your repo (e.g. opencode serve), the build agent
 * can read and write files; changes are applied in the server workspace.
 */
program
  .command('do')
  .description(`${TITLE} - AI development assistant (OpenCode build agent; can edit files when run locally)`)
  .option('-p, --prompt <prompt...>', 'Prompt or question (required)', '')
  .option('-d, --debug', 'Debug mode', false)
  .option('--opencode-server-url <url>', 'OpenCode server URL', process.env.OPENCODE_SERVER_URL || 'http://127.0.0.1:4096')
  .option('--opencode-model <model>', 'OpenCode model', process.env.OPENCODE_MODEL)
  .option('--output <format>', 'Output format (text|json)', 'text')
  .action(async (options) => {    
    const gitInfo = getGitInfo();
    
    if ('error' in gitInfo) {
      logError(gitInfo.error);
      process.exit(1);
    }

    // Helper function to clean CLI arguments that may have '=' prefix
    const cleanArg = (value: unknown): string => {
      if (value == null) return '';
      const str = String(value);
      return str.startsWith('=') ? str.substring(1) : str;
    };

    const promptParts = (options.prompt || []).map(cleanArg);
    const prompt = promptParts.join(' ');

    if (!prompt || prompt.length === 0) {
      console.log('❌ Please provide a prompt using -p or --prompt');
      return;
    }

    const serverUrl = cleanArg(options.opencodeServerUrl) || process.env.OPENCODE_SERVER_URL || 'http://127.0.0.1:4096';
    const model = cleanArg(options.opencodeModel) || process.env.OPENCODE_MODEL || OPENCODE_DEFAULT_MODEL;
    // Handle subagents flag: default is true, can be disabled with --no-use-subagents
    // Commander.js sets useSubagents to false when --no-use-subagents is used
    const _useSubAgents = options.useSubagents !== false;
    const _maxConcurrentSubAgents = parseInt(cleanArg(options.maxConcurrentSubagents)) || 5;
    const outputFormat = cleanArg(options.output) || 'text';

    if (!serverUrl) {
      console.log('❌ OpenCode server URL required. Set OPENCODE_SERVER_URL or use --opencode-server-url');
      return;
    }

    try {
      const ai = new Ai(serverUrl, model, false, false, [], false, 'low', 20);
      const aiRepository = new AiRepository();
      const fullPrompt = getCliDoPrompt({
        projectContextInstruction: OPENCODE_PROJECT_CONTEXT_INSTRUCTION,
        userPrompt: prompt,
      });
      const result = await aiRepository.copilotMessage(ai, fullPrompt);

      if (!result) {
        console.error('❌ Request failed (check OpenCode server and model).');
        process.exit(1);
      }

      const { text, sessionId } = result;

      if (outputFormat === 'json') {
        console.log(JSON.stringify({ response: text, sessionId }, null, 2));
        return;
      }

      console.log('\n' + '='.repeat(80));
      console.log('🤖 RESPONSE (OpenCode build agent)');
      console.log('='.repeat(80));
      console.log(`\n${text || '(No text response)'}\n`);
      console.log('Changes are applied directly in the workspace when OpenCode runs from the repo (e.g. opencode serve).');
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('❌ Error executing do:', err.message || error);
      if (options.debug) {
        console.error(error);
      }
      process.exit(1);
    }
  });

/**
 * Check progress of an issue based on code changes.
 */
program
  .command('check-progress')
  .description(`${TITLE} - Check progress of an issue based on code changes`)
  .option('-i, --issue <number>', 'Issue number to check progress for (required)', '')
  .option('-b, --branch <name>', 'Branch name (optional, will try to determine from issue)')
  .option('-d, --debug', 'Debug mode', false)
  .option('-t, --token <token>', 'Personal access token', process.env.PERSONAL_ACCESS_TOKEN)
  .option('--opencode-server-url <url>', 'OpenCode server URL', process.env.OPENCODE_SERVER_URL || 'http://127.0.0.1:4096')
  .option('--opencode-model <model>', 'OpenCode model', process.env.OPENCODE_MODEL)
  .action(async (options) => {    
    const gitInfo = getGitInfo();
    
    if ('error' in gitInfo) {
      logError(gitInfo.error);
      process.exit(1);
    }

    // Helper function to clean CLI arguments that may have '=' prefix
    const cleanArg = (value: unknown): string => {
      if (value == null) return '';
      const str = String(value);
      return str.startsWith('=') ? str.substring(1) : str;
    };

    const issueNumber = cleanArg(options.issue);

    if (!issueNumber || issueNumber.length === 0) {
      console.log('❌ Please provide an issue number using -i or --issue');
      return;
    }

    const parsedIssueNumber = parseInt(issueNumber);
    if (isNaN(parsedIssueNumber) || parsedIssueNumber <= 0) {
      console.log(`❌ Invalid issue number: ${issueNumber}. Must be a positive number.`);
      return;
    }

    const branch = cleanArg(options.branch);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CLI options map to action inputs
    const params: any = {
      [INPUT_KEYS.DEBUG]: options.debug.toString(),
      [INPUT_KEYS.SINGLE_ACTION]: ACTIONS.CHECK_PROGRESS,
      [INPUT_KEYS.SINGLE_ACTION_ISSUE]: parsedIssueNumber,
      [INPUT_KEYS.TOKEN]: options.token || process.env.PERSONAL_ACCESS_TOKEN,
      [INPUT_KEYS.OPENCODE_SERVER_URL]: options.opencodeServerUrl || process.env.OPENCODE_SERVER_URL || 'http://127.0.0.1:4096',
      [INPUT_KEYS.OPENCODE_MODEL]: options.opencodeModel || process.env.OPENCODE_MODEL || OPENCODE_DEFAULT_MODEL,
      [INPUT_KEYS.AI_IGNORE_FILES]: process.env.AI_IGNORE_FILES || 'build/*,dist/*,node_modules/*,*.d.ts',
      repo: {
        owner: gitInfo.owner,
        repo: gitInfo.repo,
      },
      issue: {
        number: parsedIssueNumber,
      },
    };

    // Set branch if provided
    if (branch && branch.length > 0) {
      params.commits = {
        ref: `refs/heads/${branch}`,
      };
    }

    params[INPUT_KEYS.WELCOME_TITLE] = '📊 Progress Check';
    params[INPUT_KEYS.WELCOME_MESSAGES] = [
      `Checking progress for issue #${parsedIssueNumber} in ${gitInfo.owner}/${gitInfo.repo}...`,
    ];

    try {
      await runLocalAction(params);
      process.exit(0);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('❌ Error checking progress:', error.message);
      if (options.debug) {
        console.error(err);
      }
      process.exit(1);
    }
  });

/**
 * Recommend implementation steps for an issue based on its description.
 */
program
  .command('recommend-steps')
  .description(`${TITLE} - Recommend steps to implement an issue (OpenCode Plan agent)`)
  .option('-i, --issue <number>', 'Issue number (required)', '')
  .option('-d, --debug', 'Debug mode', false)
  .option('-t, --token <token>', 'Personal access token', process.env.PERSONAL_ACCESS_TOKEN)
  .option('--opencode-server-url <url>', 'OpenCode server URL', process.env.OPENCODE_SERVER_URL || 'http://127.0.0.1:4096')
  .option('--opencode-model <model>', 'OpenCode model', process.env.OPENCODE_MODEL)
  .action(async (options) => {
    const gitInfo = getGitInfo();
    if ('error' in gitInfo) {
      logError(gitInfo.error);
      process.exit(1);
    }
    const cleanArg = (v: unknown): string => (v != null ? (String(v).startsWith('=') ? String(v).substring(1) : String(v)) : '');
    const issueNumber = cleanArg(options.issue);
    if (!issueNumber || isNaN(parseInt(issueNumber)) || parseInt(issueNumber) <= 0) {
      console.log('❌ Provide a valid issue number with -i or --issue');
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CLI options map to action inputs
    const params: any = {
      [INPUT_KEYS.DEBUG]: options.debug?.toString() ?? 'false',
      [INPUT_KEYS.SINGLE_ACTION]: ACTIONS.RECOMMEND_STEPS,
      [INPUT_KEYS.SINGLE_ACTION_ISSUE]: parseInt(issueNumber),
      [INPUT_KEYS.TOKEN]: options.token || process.env.PERSONAL_ACCESS_TOKEN,
      [INPUT_KEYS.OPENCODE_SERVER_URL]: options.opencodeServerUrl || process.env.OPENCODE_SERVER_URL || 'http://127.0.0.1:4096',
      [INPUT_KEYS.OPENCODE_MODEL]: options.opencodeModel || process.env.OPENCODE_MODEL || OPENCODE_DEFAULT_MODEL,
      repo: { owner: gitInfo.owner, repo: gitInfo.repo },
      issue: { number: parseInt(issueNumber) },
    };
    params[INPUT_KEYS.WELCOME_TITLE] = '📋 Recommend steps';
    params[INPUT_KEYS.WELCOME_MESSAGES] = [`Recommending steps for issue #${issueNumber} in ${gitInfo.owner}/${gitInfo.repo}...`];
    await runLocalAction(params);
  });

/**
 * Detect potential problems (bugbot): OpenCode analyzes branch vs base, reports findings
 * as comments on the issue and open PR. Previously reported findings can be marked resolved.
 */
program
  .command('detect-potential-problems')
  .description(`${TITLE} - Detect potential problems in the branch (bugbot): report as comments on issue and PR`)
  .option('-i, --issue <number>', 'Issue number (required)', '')
  .option('-b, --branch <name>', 'Branch name (optional, defaults to current git branch)', '')
  .option('-d, --debug', 'Debug mode', false)
  .option('-t, --token <token>', 'Personal access token', process.env.PERSONAL_ACCESS_TOKEN)
  .option('--opencode-server-url <url>', 'OpenCode server URL', process.env.OPENCODE_SERVER_URL || 'http://127.0.0.1:4096')
  .option('--opencode-model <model>', 'OpenCode model', process.env.OPENCODE_MODEL)
  .action(async (options) => {
    const gitInfo = getGitInfo();
    if ('error' in gitInfo) {
      logError(gitInfo.error);
      process.exit(1);
    }
    const cleanArg = (v: unknown): string => (v != null ? (String(v).startsWith('=') ? String(v).substring(1) : String(v)) : '');
    const issueNumber = cleanArg(options.issue);
    if (!issueNumber || isNaN(parseInt(issueNumber)) || parseInt(issueNumber) <= 0) {
      console.log('❌ Provide a valid issue number with -i or --issue');
      return;
    }
    const branch = (cleanArg(options.branch) || getCurrentBranch()).trim() || 'main';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CLI options map to action inputs
    const params: any = {
      [INPUT_KEYS.DEBUG]: options.debug?.toString() ?? 'false',
      [INPUT_KEYS.SINGLE_ACTION]: ACTIONS.DETECT_POTENTIAL_PROBLEMS,
      [INPUT_KEYS.SINGLE_ACTION_ISSUE]: parseInt(issueNumber),
      [INPUT_KEYS.TOKEN]: options.token || process.env.PERSONAL_ACCESS_TOKEN,
      [INPUT_KEYS.OPENCODE_SERVER_URL]: options.opencodeServerUrl || process.env.OPENCODE_SERVER_URL || 'http://127.0.0.1:4096',
      [INPUT_KEYS.OPENCODE_MODEL]: options.opencodeModel || process.env.OPENCODE_MODEL || OPENCODE_DEFAULT_MODEL,
      repo: { owner: gitInfo.owner, repo: gitInfo.repo },
      issue: { number: parseInt(issueNumber) },
      commits: { ref: `refs/heads/${branch}` },
    };
    params[INPUT_KEYS.WELCOME_TITLE] = '🐛 Detect potential problems (bugbot)';
    params[INPUT_KEYS.WELCOME_MESSAGES] = [
      `Detecting potential problems for issue #${issueNumber} on branch ${branch} in ${gitInfo.owner}/${gitInfo.repo}...`,
    ];
    try {
      await runLocalAction(params);
      process.exit(0);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('❌ Error running detect-potential-problems:', error.message);
      if (options.debug) {
        console.error(err);
      }
      process.exit(1);
    }
  });

/** Returns true if cwd is inside a git repository (work tree). */
function isInsideGitRepo(cwd: string): boolean {
  try {
    execSync('git rev-parse --is-inside-work-tree', { cwd, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Run the initial setup to configure labels, issue types, and verify access.
 */
program
  .command('setup')
  .description(`${TITLE} - Initial setup: create labels, issue types, and verify access`)
  .option('-d, --debug', 'Debug mode', false)
  .option('-t, --token <token>', 'Personal access token', process.env.PERSONAL_ACCESS_TOKEN)
  .action(async (options) => {
    const cwd = process.cwd();

    logInfo('🔍 Checking we are inside a git repository...');
    if (!isInsideGitRepo(cwd)) {
      logError('❌ Not a git repository. Run "copilot setup" from the root of a git repo.');
      process.exit(1);
    }
    logInfo('✅ Git repository detected.');

    logInfo('🔗 Resolving repository (owner/repo)...');
    const gitInfo = getGitInfo();
    if ('error' in gitInfo) {
      logError(gitInfo.error);
      process.exit(1);
    }
    logInfo(`📦 Repository: ${gitInfo.owner}/${gitInfo.repo}`);

    if (!hasValidSetupToken(cwd)) {
      logError('🛑 Setup requires PERSONAL_ACCESS_TOKEN with a valid token.');
      logInfo('   You can:');
      logInfo('   • Add it to your environment: export PERSONAL_ACCESS_TOKEN=your_github_token');
      if (setupEnvFileExists(cwd)) {
        logInfo('   • Or add PERSONAL_ACCESS_TOKEN=your_github_token to your existing .env file');
      } else {
        logInfo('   • Or create a .env file in this repo with: PERSONAL_ACCESS_TOKEN=your_github_token');
      }
      process.exit(1);
    }

    logInfo('⚙️  Running initial setup (labels, issue types, access)...');

    const params: any = { // eslint-disable-line @typescript-eslint/no-explicit-any -- CLI options map to action inputs
      [INPUT_KEYS.DEBUG]: options.debug.toString(),
      [INPUT_KEYS.SINGLE_ACTION]: ACTIONS.INITIAL_SETUP,
      [INPUT_KEYS.SINGLE_ACTION_ISSUE]: 1,
      [INPUT_KEYS.TOKEN]: options.token || process.env.PERSONAL_ACCESS_TOKEN || getSetupToken(cwd),
      repo: {
        owner: gitInfo.owner,
        repo: gitInfo.repo,
      },
      issue: {
        number: 1,
      },
    };

    params[INPUT_KEYS.WELCOME_TITLE] = '⚙️  Initial Setup';
    params[INPUT_KEYS.WELCOME_MESSAGES] = [
      `Running initial setup for ${gitInfo.owner}/${gitInfo.repo}...`,
      'This will create labels, issue types, and verify access to GitHub.',
    ];

    await runLocalAction(params);
  });

if (typeof process.env.JEST_WORKER_ID === 'undefined') {
  program.parse(process.argv);
}
export { program }; 