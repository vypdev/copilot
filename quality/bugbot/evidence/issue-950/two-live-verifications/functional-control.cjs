'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const [tree, store] = process.argv.slice(2).map(value => path.resolve(value));
const installed = (name, version) => path.join(store, `${name}@${version}`, 'node_modules', name);
const esbuild = require(installed('esbuild', '0.28.2'));
const { chromium } = require(installed('playwright', '1.64.1'));
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

const entry = String.raw`
import './src/presentation/domus-tasks';
import {TaskController} from './src/application/task-controller';
import {TaskSessionJournal} from './src/adapters/task-journal';
import {revisionValue} from './src/domain/administration';

let element, state;
const revision = revisionValue('1');
const context = {installationId: '01234567-89ab-cdef-0123-456789abcdef', channel: 'edge', subject: 'a'.repeat(32)};
const session = {context, deployment: 'native', access: 'full', serverTime: 1000, expiresAt: 100000, householdApiAvailable: true};
const read = result => ({result: Promise.resolve(result), cancel() {}});

export async function mount(action) {
  if (element) element.remove();
  const detail = {occurrenceId:'work-1',definitionId:'def-1',definitionRevision:revision,title:'Reviewed task',
    description:'',priority:'normal',state:'completed',revision,assigneeIds:[],dueAt:null,currentCycleId:'cycle-1',
    allowedActions:[action],cycle:{cycleId:'cycle-1',verification:'pending',performedAt:'1000',performerIds:['member-1']},
    materials:[],materialRecording:'review_on_completion',dependencyReviewRequired:false,pendingMaterials:false};
  const sends = [], intents = [], storage = new Map();
  const journal = new TaskSessionJournal({getItem: key => storage.get(key) ?? null,
    setItem: (key,value) => storage.set(key,value), removeItem: key => storage.delete(key)});
  const server = {access: () => read({householdId:'home',memberId:'member-1',canCreate:true}),
    list: () => read({items:[detail],nextCursor:null}), detail: () => read(detail),
    send: async request => {sends.push(request.command);return {kind:'uncertain'};}};
  const controller = new TaskController('native', {session: () => read(session)}, server, journal,
    {anchor() {},now: () => 1000}, {requestKey: () => 'key-1'});
  await controller.refresh();
  await controller.select('work-1');
  element = document.createElement('domus-tasks');
  element.view = controller.view;
  state = {controller,sends,intents,work:Promise.resolve()};
  element.addEventListener('domus-task-intent', event => {
    if (event.target !== element) return;
    const intent = event.detail;
    intents.push(intent);
    // Same verify/reopen dispatch as the pinned entry-page composition.
    state.work = (intent.type === 'verify' ? controller.verify(intent.decision,intent.reason)
      : controller.reopen(intent.reason)).then(() => {element.view = controller.view;});
  });
  document.body.append(element);
  await element.updateComplete;
}
export async function observe() {
  await state.work;
  await element.updateComplete;
  return {notice:state.controller.view.notice, visible:element.shadowRoot.textContent.includes('Required fields must not be empty.'),
    intents:state.intents,sends:state.sends};
}
`;

async function main() {
    const bundle = await esbuild.build({ stdin: { contents: entry, resolveDir: path.join(tree, 'frontend'), loader: 'ts' },
        bundle: true, write: false, globalName: 'taskControl', platform: 'browser', target: 'es2022',
        alias: { lit: installed('lit', '3.3.3') } });
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        await page.route('**/*', route => route.abort());
        await page.setContent('<!doctype html><body></body>');
        await page.addScriptTag({ content: bundle.outputFiles[0].text });
        const protocol = await page.context().newCDPSession(page);
        const version = await protocol.send('Browser.getVersion');
        const facts = [];
        for (const [action, label] of [['reject', 'Reject'], ['reopen', 'Reopen task']]) {
            for (const [kind, reason] of [['ascii-space', ' '], ['nel-U+0085', '\u0085'], ['nonempty', 'Reviewed']]) {
                await page.evaluate(action => taskControl.mount(action), action);
                const field = page.locator('#task-reason');
                const button = page.getByRole('button', { name: label, exact: true });
                await field.fill(reason);
                const disabled = await button.isDisabled();
                if (!disabled) await button.click();
                const actual = await page.evaluate(() => taskControl.observe());
                assert.equal(disabled, kind === 'ascii-space');
                assert.equal(actual.intents.length, kind === 'ascii-space' ? 0 : 1);
                assert.equal(actual.sends.length, kind === 'nonempty' ? 1 : 0);
                assert.equal(actual.notice === 'invalid_input', kind === 'nel-U+0085');
                assert.equal(actual.visible, kind === 'nel-U+0085');
                if (kind !== 'ascii-space') assert.equal(actual.intents[0].reason, reason);
                if (kind === 'nonempty') assert.equal(actual.sends[0].payload.reason, reason);
                facts.push({action, kind, disabled, notice: actual.notice, noticeVisible: actual.visible,
                    intents: actual.intents.length, requestsToMockServer: actual.sends.length});
            }
        }
        console.log(JSON.stringify({node:process.version,lit:'3.3.3',playwright:'1.64.1',esbuild:esbuild.version,
            chromium:browser.version(),cdp:version,lockSha256:digest(fs.readFileSync(path.join(tree,'pnpm-lock.yaml'))),
            bundleSha256:digest(bundle.outputFiles[0].contents), observations:facts}, null, 2));
    } finally {
        await browser.close();
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
