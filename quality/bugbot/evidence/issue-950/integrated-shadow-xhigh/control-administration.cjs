'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { subjects } = require('./subjects.json');

const entry = String.raw`
import './src/presentation/domus-administration';
import { revisionValue } from './src/domain/administration';

const context = { installationId: '01234567-89ab-cdef-0123-456789abcdef', channel: 'edge', subject: 'a'.repeat(32) };
const member = { memberId: 'owner', role: 'viewer', status: 'active', revision: revisionValue('3'), exceptions: [] };
const saved = { memberId: 'owner', locale: 'es', routine_participation_summaries: true, revision: revisionValue('13'), notificationDelivery: 'unavailable' };
let element, intents;

export async function mount(writable) {
    element?.remove();
    intents = [];
    element = document.createElement('domus-administration');
    element.addEventListener('domus-administration-intent', event => intents.push(event.detail.type));
    element.view = { phase: 'ready', busy: false, session: { context, deployment: 'standalone', access: 'full' },
        access: { state: 'active', member, effectiveRole: 'viewer', permissions: writable ? ['preferences.read', 'preferences.write'] : ['preferences.read'] },
        preferences: saved, presentation: null, roster: null, directory: null, household: null, policy: null,
        notice: null, outcome: null, journal: null, controls: { preferences: writable, ownAlias: false, household: false, policy: false } };
    document.body.append(element);
    await element.updateComplete;
}

export async function reject() {
    element.view = { ...element.view, outcome: { kind: 'rejected', reason: 'invalid_input', correlationId: null } };
    await element.updateComplete;
}

export function state() { return { savedLocale: element.view.preferences.locale, intents: [...intents] }; }
`;

async function run([checkout, virtualStore]) {
    const subject = subjects.find(item => item.number === 28);
    const git = (...args) => execFileSync('git', ['-C', checkout, ...args], { encoding: 'utf8' }).trim();
    assert.equal(git('rev-parse', 'HEAD'), subject.head);
    assert.equal(git('rev-parse', 'HEAD^{tree}'), subject.tree);
    assert.equal(git('status', '--porcelain'), '');
    const installed = (name, version) => path.resolve(virtualStore, `${name}@${version}/node_modules/${name}`);
    const esbuild = require(installed('esbuild', '0.28.2'));
    const { chromium } = require(installed('playwright', '1.64.1'));
    const bundle = esbuild.buildSync({ bundle: true, write: false, globalName: 'administrationControl',
        platform: 'browser', target: 'es2022', alias: { lit: installed('lit', '3.3.3') },
        stdin: { contents: entry, resolveDir: path.join(checkout, 'frontend'), loader: 'ts' } });
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        await page.route('**/*', route => route.abort());
        await page.setContent('<body></body>');
        await page.addScriptTag({ content: bundle.outputFiles[0].text });
        const button = name => page.getByRole('button', { name, exact: true });
        const language = page.getByLabel('Saved language');
        await page.evaluate(() => administrationControl.mount(false));
        const readOnly = { disabled: await button('Edit preferences').isDisabled(), languageFields: await language.count(),
            ...await page.evaluate(() => administrationControl.state()) };
        assert.deepEqual(readOnly, { disabled: true, languageFields: 0, savedLocale: 'es', intents: [] });
        await page.evaluate(() => administrationControl.mount(true));
        await button('Edit preferences').click();
        assert.equal(await language.inputValue(), 'es');
        await language.selectOption('en');
        await button('Review changes').click();
        await button('Save changes').click();
        await page.evaluate(() => administrationControl.reject());
        const rejected = { backDisabled: await button('Back to editing').isDisabled(),
            resetEnabled: await button('Reset from current data').isEnabled(),
            ...await page.evaluate(() => administrationControl.state()) };
        assert.deepEqual(rejected, { backDisabled: true, resetEnabled: true, savedLocale: 'es', intents: ['submit'] });
        await button('Reset from current data').click();
        const resetLocale = await language.inputValue();
        assert.equal(resetLocale, 'es');
        console.log(JSON.stringify({ head: subject.head, tree: subject.tree, chromium: browser.version(),
            esbuild: esbuild.version, lit: '3.3.3', playwright: '1.64.1', readOnly, rejected, resetLocale }, null, 2));
    } finally {
        await browser.close();
    }
}

run(process.argv.slice(2)).catch(error => {
    console.error(error);
    process.exitCode = 1;
});
