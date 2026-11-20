'use strict';

// Test-only source construction. The public bootstrap authenticates every byte
// of the disposable driver (including an optional controlled-provider wrapper)
// before importing it. Production launch routes and admission remain unchanged.
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const proof = require('../execution-provenance.cjs');

const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const root = path.resolve(__dirname, '../../../../..');

function authenticatedFixture(t, manifest, driverSuffix = '') {
    const directory = fs.mkdtempSync(path.join(tmpdir(), 'bugbot-authenticated-fixture-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const checkout = path.join(directory, 'implementation'), bin = path.join(directory, 'bin');
    fs.mkdirSync(bin);
    const gitExecutable = proof.trustedGitExecutable();
    const git = (...args) => execFileSync(gitExecutable, ['-C', checkout, ...args],
        { env: proof.gitEnvironment(), encoding: 'utf8' }).trim();
    execFileSync(gitExecutable, ['clone', '--quiet', '--shared', '--template=', root, checkout],
        { env: proof.gitEnvironment() });
    const sourcePaths = ['src', 'pnpm-lock.yaml', 'tsconfig.json', 'package.json'];
    for (const relative of sourcePaths) {
        fs.rmSync(path.join(checkout, relative), { recursive: true, force: true });
        fs.cpSync(path.join(root, relative), path.join(checkout, relative), { recursive: true });
    }
    const driverPaths = require('./run.cjs').normalFlowDrivers.map(file => {
        const relative = path.relative(root, path.join(__dirname, file));
        fs.writeFileSync(path.join(checkout, relative), fs.readFileSync(path.join(root, relative)));
        return relative;
    });
    fs.appendFileSync(path.join(checkout, path.relative(root, path.join(__dirname, 'run.cjs'))),
        driverSuffix);
    fs.cpSync(path.join(root, 'node_modules'), path.join(checkout, 'node_modules'),
        { recursive: true, verbatimSymlinks: true, mode: fs.constants.COPYFILE_FICLONE });
    const commit = message => git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
        '-c', 'core.hooksPath=/dev/null', 'commit', '--quiet', '-m', message);
    git('add', '--', ...sourcePaths, ...driverPaths);
    // A clean committed source already supplies this pin. Any new snapshot
    // commit belongs only to the disposable fixture, never a delivery ref.
    if (git('diff', '--cached', '--name-only')) commit('Pin current synthetic source and admitted driver snapshot');
    const implementation = git('rev-parse', 'HEAD');
    const forbidden = path.join(directory, 'model-invoked'), executable = path.join(bin, 'codex');
    fs.writeFileSync(executable, '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "codex-cli fixture"; exit 0; fi\n'
        + 'touch "$MODEL_FORBIDDEN"\nexit 91\n', { mode: 0o700 });
    const pinned = { ...manifest, implementation,
        runtime: { ...proof.runtimeIdentity(checkout), executable, codex: 'codex-cli fixture', codexSha256: hash(executable) },
        drivers: Object.fromEntries(require('./run.cjs').normalFlowDrivers.map(file =>
            [file, hash(path.join(checkout, path.relative(root, path.join(__dirname, file))))])) };
    const relative = 'quality/bugbot/evidence/issue-950/normal-flow-shadow/authenticated.fixture.json';
    fs.writeFileSync(path.join(checkout, relative), JSON.stringify(pinned));
    git('add', '--', relative);
    commit('Commit synthetic fixture plan before public bootstrap admission');
    const revision = git('rev-parse', 'HEAD'), bootstrap = path.join(directory, 'reviewed-bootstrap.cjs');
    fs.writeFileSync(bootstrap, execFileSync(gitExecutable, ['-C', checkout, 'show',
        revision + ':quality/bugbot/evidence/issue-950/qualification-bootstrap.cjs'], { env: proof.gitEnvironment() }));
    const pins = { revision, planSha256: hash(path.join(checkout, relative)), bootstrapSha256: hash(bootstrap) };
    return { directory, checkout, forbidden, pins,
        launch(lab, number, output, cwd = directory) {
            const result = spawnSync(process.execPath, [bootstrap, checkout, revision, relative,
                pins.planSha256, pins.bootstrapSha256, 'normal-flow', lab, String(number), output], {
                cwd, encoding: 'utf8', env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH,
                    MODEL_FORBIDDEN: forbidden },
            });
            assert.equal(fs.existsSync(forbidden), false, 'controlled fixture must never invoke a model');
            return result;
        },
    };
}

module.exports = { authenticatedFixture };
