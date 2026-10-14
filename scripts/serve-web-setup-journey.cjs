#!/usr/bin/env node
/** Interactive presentation review using the production bridge/transport and no provider adapters. */
const { resolve } = require('node:path');
const { reviewView } = require('./web-setup-review-views.cjs');

async function main() {
  const { createServer } = await import('vite');
  const loader = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  let server;
  try {
    const { WebSetupBridge } = await loader.ssrLoadModule(resolve(__dirname, '../src/cli/web_setup_bridge.ts'));
    const { startWebSetupServer } = await loader.ssrLoadModule(resolve(__dirname, '../src/cli/web_setup_server.ts'));
    const { setupQuestionPresentation } = await loader.ssrLoadModule(resolve(__dirname, '../src/application/policies/setup_question_guidance_policy.ts'));
    const bridge = new WebSetupBridge('fixture-owner/fixture-repo');
    const stages = ['Repository', 'Setup choices', 'Setup PAT', 'Plan', 'Bot PAT & credentials', 'Apply'];
    const stage = index => bridge.setJourney({ repository: 'fixture-owner/fixture-repo', position: index + 1,
      total: 6, current: stages[index], complete: stages.slice(0, index), pending: stages.slice(index + 1),
      mutationStarted: false, choiceReviewPass: 1 });
    stage(0);
    server = await startWebSetupServer(bridge, resolve(__dirname, '../build/web'));
    const stop = () => { void server.close(); };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    console.log(`Interactive fixture: ${server.url}`);
    console.log(`Fixture pairing code: ${server.pairingCode}`);
    console.log('No GitHub or filesystem mutation adapters. Enter only the literal fixture-value in both credential fields.');

    async function ask(prompt, index) {
      stage(index);
      const value = await bridge.ask(prompt);
      return value;
    }
    async function credential(copyId, index) {
      while (!bridge.snapshot().outcome) {
        const value = await ask({ kind: 'secret', title: 'Fixture credential', copyId, copyValues: { name: 'PAT' } }, index);
        if (value === undefined) return false;
        if (value === 'fixture-value') { bridge.clearMessage(); return true; }
        bridge.message('Enter fixture-value; never use a real credential in this review.', 'error', undefined, 'validation.unknown');
      }
      return false;
    }
    async function journey() {
      const target = await ask({ kind: 'confirm', title: 'Confirm fixture repository', copyId: 'repository.confirm',
        copyValues: { repository: 'fixture-owner/fixture-repo', branch: 'develop' },
        choices: ['Yes, this is my repository', 'Stop and choose another checkout'] }, 0);
      if (target !== 'Yes, this is my repository') { bridge.cancel(); return; }
      const question = reviewView('question').prompt;
      if (await ask({ ...question, presentation: setupQuestionPresentation(question.question) }, 1) === undefined) return;
      if (!await credential('setupPat.entry', 2)) return;
      const plan = { ...reviewView('plan').prompt, editGroups: [] };
      if (await ask(plan, 3) !== 'approve') { bridge.cancel(); return; }
      if (!await credential('botPat.entry.manual', 4)) return;
      const apply = await ask({ kind: 'confirm', title: 'Apply fixture setup?', copyId: 'apply.confirm',
        choices: ['Apply setup', 'Stop without applying'] }, 5);
      if (apply !== 'Apply setup') { bridge.cancel(); return; }
      bridge.effects([{ id: 'files', state: 'skipped', scope: 'local' }, { id: 'secrets', state: 'skipped', scope: 'repository' }]);
      bridge.configureReadOnlyDoctor(async () => ({ healthy: true, pass: 0, warn: 0, fail: 0, skipped: 2 }));
      bridge.finish('dry-run', 'Fixture preview finished; no resources were written.');
    }
    await Promise.all([server.closed, journey()]);
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  } finally {
    if (server) await server.close();
    await loader.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
