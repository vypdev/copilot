import {createHash} from 'node:crypto';
import {readFile, writeFile, realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL, fileURLToPath, URL} from 'node:url';

// Optional contributor qualification only; never imported by production or mandatory Node tests.
// Usage: node <this-file> <owned-temporary-sdk-root> <new-absolute-output.json>
const [requestedRoot, output] = process.argv.slice(2);
if (!requestedRoot || !output || !path.isAbsolute(requestedRoot) || !path.isAbsolute(output)
  || !path.basename(requestedRoot).startsWith('copilot-848-consumer-')) throw Error('Use an owned temporary SDK root and a new absolute output path');
const root = await realpath(requestedRoot);
const temporaryParents = new Set([await realpath(tmpdir())]);
if (process.platform !== 'win32') temporaryParents.add(await realpath('/tmp'));
if (!temporaryParents.has(path.dirname(root))) throw Error('The qualification SDK must be directly inside a system temporary directory');
const probe = fileURLToPath(new URL('./bugbot_async_statement_probe.mjs', import.meta.url));
const packageVersion = async name => JSON.parse(await readFile(path.join(root, 'frontend/node_modules', name, 'package.json'), 'utf8')).version;
for (const [name, expected] of Object.entries({lit: '3.3.3', playwright: '1.64.1', vitest: '5.0.5', vite: '8.3.5'})) {
  if (await packageVersion(name) !== expected) throw Error(`Qualification requires ${name}@${expected}; prepare the pinned SDK before retrying`);
}
const {createServer} = await import(pathToFileURL(path.join(root, 'frontend/node_modules/vite/dist/node/index.js')));
const {chromium} = await import(pathToFileURL(path.join(root, 'frontend/node_modules/playwright/index.mjs')));
const server = await createServer({configFile: false, root: path.join(root, 'frontend'), logLevel: 'error',
  cacheDir: path.join(root, '.qualification/owned-probe-vite'),
  resolve: {alias: [{find: /^lit$/, replacement: path.join(root, 'frontend/node_modules/lit/index.js')}]},
  server: {host: '127.0.0.1', port: 0, hmr: false, fs: {allow: [root, path.dirname(probe)]}},
  plugins: [{name: 'owned-probe-page', configureServer(value) {
    value.middlewares.use((request, response, next) => {
      if (request.url !== '/owned-848.html') return next();
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><html><head><title>Owned statement probe</title></head><body></body></html>');
    });
  }}],
});
let browser;
try {
  await server.listen();
  const address = server.httpServer.address();
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({headless: true});
  const context = await browser.newContext();
  const blocked = [];
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    blocked.push(url.origin); return route.abort();
  });
  const page = await context.newPage();
  await page.goto(origin + '/owned-848.html');
  const result = await page.evaluate(async source => {
    const module = await import(source);
    return {observations: await module.runProbe(), litElementVersions: globalThis.litElementVersions,
      reactiveElementVersions: globalThis.reactiveElementVersions, litHtmlVersions: globalThis.litHtmlVersions};
  }, '/@fs/' + probe.replaceAll('\\', '/').replace(/^\/+/, ''));
  const receipt = {at: new Date().toISOString(), node: process.version, lit: await packageVersion('lit'),
    playwright: await packageVersion('playwright'), vitest: await packageVersion('vitest'),
    browser: await browser.version(), probe: path.basename(probe),
    runner: path.basename(fileURLToPath(import.meta.url)),
    runnerSha256: createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex'),
    probeSha256: createHash('sha256').update(await readFile(probe)).digest('hex'),
    network: 'Only isolated loopback origin allowed in fresh browser context', blockedOrigins: blocked,
    scope: 'Actual pinned Lit on real Chromium; fixed authored probe, no corpus/consumer source evaluation. Not the original consumer test.', ...result};
  await writeFile(output, JSON.stringify(receipt, null, 2) + '\n', {flag: 'wx'});
  console.log(JSON.stringify(receipt));
  await context.close();
} finally {
  if (browser) await browser.close();
  await server.close();
}
