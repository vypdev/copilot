'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { realpathSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { fixtures } = require('../coverage-895-pilot/fixture.cjs');
const { git } = require('../on-demand/contract.cjs');
const { digest } = require('../v4/verification.cjs');

const [labArg, outputArg] = process.argv.slice(2);
const lab = path.resolve(labArg), output = path.resolve(outputArg);
const sessions = fixtures(lab, path.join(lab, 'archives'));
const story = 'stories/button.stories.ts';
const roles = { cli: 'exclude-tested-and-untested', provider: 'v8-source-filter', writer: 'summary-writer' };

for (const [subject, session] of Object.entries(sessions)) {
    const members = Object.entries(roles).map(([role, link]) => {
        const proof = session.initial.find(p => p.link === link);
        assert(proof);
        const specifier = proof.package === 'vitest' ? 'vitest/node' : proof.package;
        const args = ['--experimental-import-meta-resolve', '--input-type=module', '-e',
            'console.log(import.meta.resolve(process.argv[1], process.argv[2] || undefined))', specifier];
        if (role === 'writer') {
            const provider = sessions[subject].initial.find(p => p.link === 'v8-source-filter');
            const root = realpathSync(path.join(session.cwd, 'node_modules', provider.package));
            args.push(require('node:url').pathToFileURL(path.join(root, provider.file)).href);
        }
        const entry = require('node:url').fileURLToPath(execFileSync(process.execPath, args,
            { cwd: session.cwd, timeout: 2000, encoding: 'utf8' }).trim());
        assert(entry.endsWith('/' + proof.entry));
        return { role, path: path.join(entry.slice(0, -(proof.entry.length + 1)), proof.file), sha256: proof.fileSha256 };
    });
    const { head, tree, lockBlob, operation, candidate } = session.identity;
    const command = JSON.parse(git(session.cwd, 'show', head + ':package.json')).scripts.test;
    const gitSources = Object.fromEntries([story, '.storybook/main.ts', 'vitest.config.ts', 'tooling/coverage.mjs',
        'tests/coverage-evidence.test.mjs', 'package.json', 'pnpm-lock.yaml'].map(file => {
        const locator = head + ':' + file;
        return [file, { blob: git(session.cwd, 'rev-parse', locator).trim(),
            sha256: digest(git(session.cwd, 'show', locator)) }];
    }));
    writeFileSync(path.join(output, subject + '-binding.json'), JSON.stringify({
        head, tree, lockBlob, operation, candidate, command, story, gitSources, resolutions: session.resolutions,
        members, output: path.join(output, subject + '-trace.jsonl'),
    }, null, 2) + '\n');
}
