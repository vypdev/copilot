'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { git } = require('../on-demand/contract.cjs');
const locked = require('./subjects.lock.json');

async function main(subjects, dependencies) {
    assert(subjects && dependencies, 'Pass fixture and ha-ui dependency checkout directories.');
    const deps = path.resolve(dependencies);
    const esbuildPath = path.join(deps, 'node_modules/.pnpm/esbuild@0.28.2/node_modules/esbuild');
    const esbuild = require(esbuildPath);
    const { chromium } = require(path.join(deps, 'node_modules/playwright'));
    assert.equal(esbuild.version, '0.28.2');
    assert.equal(require(path.join(deps, 'node_modules/playwright/package.json')).version, '1.64.1');
    assert.equal(require(path.join(deps, 'packages/core/node_modules/lit/package.json')).version, '3.3.3');
    const browser = await chromium.launch({ headless: true });
    try {
        for (const [subject, { binding }] of Object.entries(locked)) {
            const cwd = path.resolve(subjects, subject);
            assert.equal(git(cwd, 'rev-parse', 'HEAD').trim(), binding.head);
            assert.equal(git(cwd, 'rev-parse', 'HEAD^{tree}').trim(), binding.tree);
            assert.equal(git(cwd, 'status', '--porcelain'), '');
            const { outputFiles: [bundle] } = await esbuild.build({
                stdin: { contents: "import {registerTabs} from './tabs.ts'; registerTabs();",
                    resolveDir: path.join(cwd, 'packages/core/src/components') },
                nodePaths: [path.join(deps, 'packages/core/node_modules')], bundle: true, write: false,
                platform: 'browser', target: 'es2022', format: 'iife',
            });
            const observations = [];
            for (const kind of ['navigation', 'panels']) for (const rtl of [false, true]) {
                const page = await browser.newPage({ viewport: { width: 500, height: 240 } });
                try {
                    await page.route('**/*', route => route.abort());
                    await page.setContent('<!doctype html><html><body></body></html>');
                    await page.addScriptTag({ content: bundle.text });
                    await page.evaluate(async ({ kind, rtl }) => {
                        const host = document.createElement('vyp-ha-tabs');
                        host.id = 'overflow';
                        host.dir = rtl ? 'rtl' : 'ltr';
                        host.style.cssText = 'position:fixed;left:0;top:0;width:240px;--vyp-ha-motion-duration:0ms';
                        host.state = { kind, label: 'Sections', selected: 'item-0',
                            items: ['Overview', 'Tasks', 'Inventory', 'Family', 'Settings', 'Calendar', 'Shopping', 'Rewards']
                                .map((label, n) => ({ id: 'item-' + n, label, disabled: false, href: kind === 'navigation' ? '#' + n : null })) };
                        host.addEventListener('ha-selection-request', event => {
                            event.preventDefault();
                            host.dataset.requests = String(Number(host.dataset.requests ?? 0) + 1);
                        });
                        document.addEventListener('mouseup', event => {
                            host.dataset.releaseOutside = String(!event.composedPath().includes(host));
                        });
                        document.body.append(host);
                        await host.updateComplete;
                    }, { kind, rtl });
                    const host = page.locator('#overflow');
                    await host.getByRole('button', { name: 'Scroll to end', exact: true }).waitFor();
                    await page.mouse.move(rtl ? 170 : 70, 28);
                    await page.mouse.down();
                    await page.mouse.move(rtl ? 220 : 20, 28, { steps: 5 });
                    const scroll = Math.abs(await host.locator('.bar').evaluate(el => el.scrollLeft));
                    await page.mouse.move(rtl ? 220 : 20, 120);
                    await page.mouse.up();
                    const outside = await host.getAttribute('data-release-outside');
                    const requestCount = async () => Number(await host.getAttribute('data-requests') ?? 0);
                    const afterDrag = await requestCount();
                    const overview = host.getByRole(kind === 'navigation' ? 'link' : 'tab', { name: 'Overview', exact: true });
                    await overview.click();
                    const afterPointer = await requestCount();
                    await overview.focus();
                    await page.keyboard.press('Enter');
                    const afterKeyboard = await requestCount();
                    assert(scroll >= 49);
                    assert.equal(outside, 'true');
                    assert.equal(afterDrag, 0);
                    assert.equal(afterPointer, subject === 'N1' ? 1 : 0);
                    assert.equal(afterKeyboard - afterPointer, 1);
                    assert.equal(await host.evaluate(el => el.state.selected), 'item-0');
                    observations.push({ kind, rtl, scroll, outside: true, afterDrag, afterPointer, afterKeyboard });
                } finally {
                    await page.close();
                }
            }
            console.log(JSON.stringify({ subject, head: binding.head, tree: binding.tree, chromium: browser.version(),
                bundleSha256: createHash('sha256').update(bundle.contents).digest('hex'), observations }));
        }
    } finally {
        await browser.close();
    }
}

main(...process.argv.slice(2)).catch(error => { console.error(error); process.exitCode = 1; });
