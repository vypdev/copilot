'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const [tree, store] = process.argv.slice(2).map(value => path.resolve(value));
const installed = (name, version) => path.join(store, name + '@' + version, 'node_modules', name);
const esbuild = require(installed('esbuild', '0.28.2'));
const { chromium } = require(installed('playwright', '1.64.1'));
const haUi = '0.1.0-next.1';
const haUiRoot = path.join(store, '@vypdev+ha-ui@' + haUi, 'node_modules/@vypdev/ha-ui');
const haUiPackage = require(path.join(haUiRoot, 'package.json'));
assert.equal(haUiPackage.version, haUi);
const { head } = require('./subjects.json').subjects.find(subject => subject.number === 29);
const digest = value => createHash('sha256').update(value).digest('hex');
const git = (...args) => execFileSync('git', ['-C', tree, ...args], { encoding: 'utf8' }).trim();

const entry = String.raw`
import './src/presentation/domus-tasks';
import {TaskController} from './src/application/task-controller';
import {TaskSessionJournal} from './src/adapters/task-journal';
import {decodeTaskIntent} from './src/composition/entry-page';

const context = {installationId: '01234567-89ab-cdef-0123-456789abcdef', channel: 'edge', subject: 'a'.repeat(32)};
const session = {context, deployment: 'native', access: 'full', serverTime: 1000, expiresAt: 100000, householdApiAvailable: true};
const read = result => ({result: Promise.resolve(result), cancel() {}});
const detail = {occurrenceId:'work-1', definitionId:'def-1', revision:'1', title:'Existing task', description:'',
    priority:'normal', state:'open', assigneeIds:[], dueAt:null, allowedActions:[], materials:[], cycle:null};
let state;

export async function mount() {
    state?.element.remove();
    const storage = new Map(), sends = [];
    const journal = new TaskSessionJournal({getItem:key => storage.get(key) ?? null,
        setItem:(key,value) => storage.set(key,value), removeItem:key => storage.delete(key)});
    const server = {access:() => read({householdId:'home', memberId:'member-1', canCreate:true}),
        list:() => read({items:[detail], nextCursor:null}), detail:() => read(detail),
        send:async request => {
            sends.push(request.command);
            return {kind:'receipt', stage:'committed', action:'task.create',
                operationId:'previous-create', occurrenceId:'work-1', revision:'1'};
        }};
    const controller = new TaskController('native', {session:() => read(session)}, server, journal,
        {anchor() {}, now:() => 1000}, {requestKey:() => 'key-1'});
    await controller.refresh();
    const element = document.createElement('domus-tasks');
    element.view = controller.view;
    state = {controller, element, sends, work:Promise.resolve()};
    element.addEventListener('domus-task-intent', event => {
        if (event.target !== element) return;
        const intent = decodeTaskIntent(event.detail);
        if (intent?.type !== 'create') return;
        // Production entry-page dispatches create and publishes the completed task view.
        state.work = controller.create(intent.title, intent.description, intent.priority).then(() => {element.view = controller.view;});
    });
    document.body.append(element);
    await element.updateComplete;
}

export async function observe() {
    await state.work;
    const {controller, element, sends} = state;
    await element.updateComplete;
    return {title:element.shadowRoot.querySelector('#task-title').value,
        description:element.shadowRoot.querySelector('#task-description').value,
        open:element.shadowRoot.querySelector('.new-task').open,
        notice:controller.view.notice, receipt:controller.view.outcome?.operationId ?? null,
        sends:sends.map(command => command.payload.title)};
}
`;

async function main() {
    assert.equal(git('rev-parse', 'HEAD'), head);
    assert.equal(git('status', '--porcelain'), '');
    const bundle = await esbuild.build({
        stdin: { contents: entry, resolveDir: path.join(tree, 'frontend'), loader: 'ts' },
        bundle: true, write: false, globalName: 'shadowControl', platform: 'browser', target: 'es2022',
        alias: { lit: installed('lit', '3.3.3'),
            '@vypdev/ha-ui/contracts': path.join(haUiRoot, haUiPackage.exports['./contracts'].import),
            '@vypdev/ha-ui/tabs': path.join(haUiRoot, haUiPackage.exports['./tabs'].import) },
    });
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        await page.route('**/*', route => route.abort());
        await page.setContent('<!doctype html><body></body>');
        await page.addScriptTag({ content: bundle.outputFiles[0].text });
        const open = page.locator('.new-task > summary');
        const title = page.locator('#task-title');
        const description = page.locator('#task-description');
        const submit = page.locator('.new-task button[type=submit]');
        const observe = () => page.evaluate(() => shadowControl.observe());
        const observations = [];
        for (const prior of [false, true]) {
            await page.evaluate(() => shadowControl.mount());
            if (prior) {
                await open.click();
                await title.fill('Valid preceding task');
                await submit.click();
                assert.deepEqual(await observe(), { title: '', description: '', open: false, notice: null,
                    receipt: 'previous-create', sends: ['Valid preceding task'] });
            }
            await open.click();
            await title.fill('   ');
            await description.fill('Draft the user should keep');
            await submit.click();
            const observed = await observe();
            assert.deepEqual(observed, prior
                ? { title: '', description: '', open: false, notice: 'invalid_input', receipt: 'previous-create', sends: ['Valid preceding task'] }
                : { title: '   ', description: 'Draft the user should keep', open: true, notice: 'invalid_input', receipt: null, sends: [] });
            observations.push({ priorCommittedReceipt: prior, ...observed });
        }
        console.log(JSON.stringify({ head, tree: git('rev-parse', 'HEAD^{tree}'),
            lockSha256: digest(fs.readFileSync(path.join(tree, 'pnpm-lock.yaml'))), bundleSha256: digest(bundle.outputFiles[0].contents),
            node: process.version, esbuild: esbuild.version, chromium: browser.version(), playwright: '1.64.1', lit: '3.3.3', haUi,
            observations }, null, 2));
    } finally {
        await browser.close();
    }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
