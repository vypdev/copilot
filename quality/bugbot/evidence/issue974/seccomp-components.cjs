'use strict';

// Deterministic component evidence only. No Docker, CLI, model or kernel probe.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const bytes = require('./qualification-seccomp.cjs');
const provenance = require('./qualification-seccomp.source.json');
const { requireProfile } = require('./operation-containment.cjs');
const { withEngineFixture } = require('./engine-transport-components.cjs');
const hash = value => createHash('sha256').update(value).digest('hex');
const profile = JSON.parse(bytes), additions = profile.syscalls.slice(-13);
const added = name => additions.filter(rule => rule.names.includes(name));

for (const architecture of ['s390', 's390x']) test(
    'ev974-C27 reversed-ABI engine is rejected before the fixed clone filter can be used: ' + architecture, () => {
        // The reviewed filter stays byte-identical. On these ABIs arg0 is the
        // stack, so admission must reject them before any Engine operation.
        const digest = 'a'.repeat(64);
        const value = { schemaVersion: 1, image: 'sha256:' + digest, imageConfigSha256: digest,
            hostNodeSha256: digest, socketPath: '/owned/engine.sock', supervisorSha256: digest,
            workerUid: 502, workerGid: 20,
            engine: { version: 'fixture', apiVersion: '1.56', os: 'linux', arch: architecture, kernelVersion: 'fixture' } };
        assert.throws(() => requireProfile(value), /reversed.*s390.*ABI/u);
        assert.doesNotThrow(() => requireProfile({ ...value, engine: { ...value.engine, arch: 'arm64' } }));
        assert.doesNotThrow(() => requireProfile({ ...value, engine: { ...value.engine, arch: 'amd64' } }));
    });

test('ev974-C27 fixed seccomp preserves every Moby baseline field and rule', () => {
    assert.equal(typeof bytes, 'string');
    assert.equal(hash(bytes), 'fb324e146b2fb829afcaadd4786f6c21e2e40f0d850de6229d5eb995a088811b');
    const baseline = { ...profile, syscalls: profile.syscalls.slice(0, -13) };
    assert.equal(hash(JSON.stringify(baseline, null, 2) + '\n'),
        'b9aaf73b79aa9088c675399b494b358c579aa1221a722cf32da9aded5c4a40c1');
    assert.equal(baseline.defaultAction, 'SCMP_ACT_ERRNO');
    assert.equal(baseline.defaultErrnoRet, 1);
    assert.deepEqual(additions, provenance.additionalRules);
    assert.equal(provenance.proposedExportedProfileSha256, hash(bytes));
});

test('ev974-C27 clone additions admit only bubblewrap USER/MNT and optional PID IPC NET', () => {
    const fixed = 17 | 0x10000000 | 0x00020000;
    const optional = [0x20000000, 0x08000000, 0x40000000];
    const expected = Array.from({ length: 8 }, (_, mask) => optional.reduce(
        (flags, bit, index) => mask & (1 << index) ? flags | bit : flags, fixed)).sort((a, b) => a - b);
    const rules = added('clone');
    assert.equal(rules.length, 8);
    assert.deepEqual(rules.map(rule => rule.args[0].value).sort((a, b) => a - b), expected);
    for (const rule of rules) {
        assert.deepEqual(rule, { names: ['clone'], action: 'SCMP_ACT_ALLOW',
            args: [{ index: 0, value: rule.args[0].value, op: 'SCMP_CMP_EQ' }] });
        for (const forbidden of [0x04000000, 0x02000000, 0x00000080, 0x00008000]) {
            assert.equal(rule.args[0].value & forbidden, 0, 'UTS/CGROUP/TIME/PARENT flags stay excluded');
            assert(!expected.includes(rule.args[0].value | forbidden));
        }
        assert(!expected.includes(rule.args[0].value & ~0x10000000), 'host-user namespace clone is not added');
    }
});

test('ev974-C27 unshare additions reject extra namespace flags and filesystem-sharing flags', () => {
    const values = added('unshare').map(rule => rule.args[0].value);
    assert.deepEqual(values, [0x10000000, 0x50000000]);
    for (const rule of added('unshare')) {
        assert.deepEqual(rule, { names: ['unshare'], action: 'SCMP_ACT_ALLOW',
            args: [{ index: 0, value: rule.args[0].value, op: 'SCMP_CMP_EQ' }] });
        for (const extra of [0x00020000, 0x20000000, 0x08000000, 0x04000000, 0x00000200]) {
            assert(!values.includes(rule.args[0].value | extra));
        }
    }
});

test('ev974-C27 filesystem setup adds only mount pivot_root and lazy umount without setns or clone3', () => {
    assert.deepEqual(additions.filter(rule => !['clone', 'unshare'].includes(rule.names[0])), [
        { names: ['mount'], action: 'SCMP_ACT_ALLOW' },
        { names: ['pivot_root'], action: 'SCMP_ACT_ALLOW' },
        { names: ['umount2'], action: 'SCMP_ACT_ALLOW', args: [{ index: 1, value: 2, op: 'SCMP_CMP_EQ' }] },
    ]);
    assert.deepEqual([...new Set(additions.flatMap(rule => rule.names))].sort(),
        ['clone', 'mount', 'pivot_root', 'umount2', 'unshare']);
});

test('ev974-C27 closed profile cannot override the fixed filter or add capabilities', () => {
    const digest = 'a'.repeat(64);
    const valid = { schemaVersion: 1, image: 'sha256:' + digest, imageConfigSha256: digest,
        hostNodeSha256: digest, socketPath: '/owned/engine.sock', supervisorSha256: digest,
        workerUid: 502, workerGid: 20,
        engine: { version: 'fixture', apiVersion: '1.56', os: 'linux', arch: 'arm64', kernelVersion: 'fixture' } };
    assert.doesNotThrow(() => requireProfile(valid));
    for (const extra of [{ seccomp: 'unconfined' }, { securityOpt: ['seccomp=' + bytes] },
        { capabilities: ['SYS_ADMIN'] }, { profilePath: '/foreign/filter.json' }]) {
        assert.throws(() => requireProfile({ ...valid, ...extra }), /closed containment profile/u);
    }
});

test('ev974-C27 actual HTTP create sends the fixed filter and preserves privilege boundaries', async () => {
    await withEngineFixture({ completeOnStart: true,
        environment: { SECCOMP_PROFILE: 'unconfined', DOCKER_HOST: 'tcp://foreign.invalid' } }, async f => {
        const scope = await f.create();
        assert.deepEqual(JSON.parse(JSON.stringify(f.config.HostConfig.SecurityOpt)),
            ['no-new-privileges:true', 'seccomp=' + bytes]);
        assert.equal(f.config.HostConfig.Privileged, false);
        assert.deepEqual(JSON.parse(JSON.stringify(f.config.HostConfig.CapDrop)), ['ALL']);
        assert.deepEqual(JSON.parse(JSON.stringify(f.config.HostConfig.CapAdd)), ['SETUID', 'SETGID']);
        assert.equal(f.config.HostConfig.PidMode, '');
        await scope.start(); await scope.wait(); await scope.remove();
        assert.equal(f.removed, true);
    });
});

for (const [name, securityOpt] of [
    ['missing filter', ['no-new-privileges:true']],
    ['changed filter bytes', ['no-new-privileges:true', 'seccomp=' + bytes.replace('SCMP_ACT_ERRNO', 'SCMP_ACT_ALLOW')]],
    ['unconfined filter', ['no-new-privileges:true', 'seccomp=unconfined']],
]) {
    test('ev974-C27 HTTP inspection rejects ' + name + ' before start or authority-bearing cleanup', async () => {
        await withEngineFixture({ inspect: actual => {
            actual.HostConfig = { ...actual.HostConfig, SecurityOpt: securityOpt };
        } }, async f => {
            const scope = await f.create();
            await assert.rejects(scope.start(), /scope configuration changed: SecurityOpt/u);
            await assert.rejects(scope.stop('failed'), /scope configuration changed: SecurityOpt/u);
            assert.equal(f.requests.some(row => row.route.endsWith('/start') || row.method === 'DELETE'), false);
        });
    });
}

function registerBootstrapControls(makeFixture) {
    for (const mode of ['missing', 'changed', 'symlink']) {
        test('ev974-C26 public bootstrap rejects ' + mode + ' fixed-filter module before imports or probes', t => {
            const f = makeFixture(t);
            const file = path.join(f.project, 'quality/bugbot/evidence/issue974/qualification-seccomp.cjs');
            if (mode === 'missing') fs.unlinkSync(file);
            else if (mode === 'changed') fs.appendFileSync(file, '\nthrow new Error("UNADMITTED_FILTER_EXECUTED");\n');
            else {
                const target = file + '.target'; fs.renameSync(file, target); fs.symlinkSync(target, file);
            }
            const result = f.launch();
            assert.notEqual(result.status, 0);
            assert.match(result.stderr, /driver differs|materialized driver differs|regular file|artifact symlink refused|ENOENT/u);
            assert.doesNotMatch(result.stderr, /UNADMITTED_FILTER_EXECUTED/u);
            assert(!fs.existsSync(f.marker) && !fs.existsSync(f.probe));
        });
    }
}

module.exports = { registerBootstrapControls };
