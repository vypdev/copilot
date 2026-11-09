'use strict';

const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { retrieve } = require('./retrieve.cjs');
const { assess, limits } = require('../tree-search/contract.cjs');
const { git } = require('../on-demand/contract.cjs');

const anchorPath = 'pkg/logic/inspection_target.py';
const anchor = { path: anchorPath, side: 'RIGHT', line: 8 };
const target = { scope: 'pkg', workspace: null, match: 'literal', query: 'def active_key(', start: null, end: null };
const request = { kind: 'searchTree', targets: [target] };

function fixture(t, constructors) {
    const cwd = mkdtempSync(path.join(tmpdir(), '950-causal-fixture-'));
    t.after(() => rmSync(cwd, { recursive: true, force: true }));
    const commit = label => git(cwd, '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false',
        '-c', 'user.name=Pilot', '-c', 'user.email=pilot@example.invalid', 'commit', '-qm', label);
    const write = (name, content) => {
        mkdirSync(path.dirname(path.join(cwd, name)), { recursive: true });
        writeFileSync(path.join(cwd, name), content);
    };
    git(cwd, 'init', '-q');
    write('README.md', 'fixture\n');
    git(cwd, 'add', '.');
    commit('base');
    const base = git(cwd, 'rev-parse', 'HEAD').trim();
    write(anchorPath, `def inspect_item(unit, key):
    current = unit.catalog.active_key(key)
    if current is None:
        return ()
    obj = unit.catalog.get(current)
    if obj is not None:
        chosen = ["show"]
        return chosen
    return ()
`);
    write('pkg/logic/inspection.py', `from dataclasses import dataclass
from pkg.logic.inspection_target import inspect_item
from pkg.ports import Transactions

@dataclass
class Inspection:
    store: Transactions

    def target(self, key):
        with self.store.read() as unit:
            return inspect_item(unit, key)
`);
    write('pkg/ports.py', `from typing import Protocol

class Port(Protocol):
    def active_key(self, key): ...

class Transactions(Protocol):
    def read(self): ...
`);
    for (const name of ['Alpha', 'Beta']) write(`pkg/adapters/${name.toLowerCase()}.py`, `
class ${name}Repo:
    def active_key(self, key):
        return key if key else None
    def get(self, key):
        return object()

class ${name}Unit:
    def __init__(self):
        self.catalog = ${name}Repo()

class ${name}Database:
    def read(self):
        yield ${name}Unit()
`);
    write('pkg/composition/runtime.py', `from pkg.logic.inspection import Inspection
from pkg.adapters.alpha import AlphaDatabase
from pkg.adapters.beta import BetaDatabase

${constructors}`);
    git(cwd, 'add', '.');
    commit('head');
    const binding = { operation: 'synthetic-operation', candidate: 'synthetic-candidate', scopes: [''],
        head: git(cwd, 'rev-parse', 'HEAD').trim(), tree: git(cwd, 'rev-parse', 'HEAD^{tree}').trim() };
    return { cwd, binding, options: { context: { base, anchor } } };
}

test('declaration and two implementations without an assembly link remain unresolved', t => {
    const { cwd, binding, options } = fixture(t, 'def create(store):\n    return Inspection(store)\n');
    const result = retrieve(cwd, binding, request, options);
    assert.equal(result.status, 'unresolved');
    assert.equal(result.reason, 'effective-constructor-unproven');
    assert.deepEqual(result.receipts, []);
});

test('two explicitly wired implementations remain ambiguous', t => {
    const { cwd, binding, options } = fixture(t, 'def first():\n    return Inspection(AlphaDatabase())\n\ndef second():\n    return Inspection(BetaDatabase())\n');
    const result = retrieve(cwd, binding, request, options);
    assert.equal(result.status, 'ambiguous');
    assert.equal(result.reason, 'effective-constructor-ambiguous');
    assert.deepEqual(result.paths, ['pkg/adapters/alpha.py', 'pkg/adapters/beta.py']);
    assert.deepEqual(result.receipts, []);
});

test('an imported concrete binding wins over unbound definitions and keeps the anchor', t => {
    const { cwd, binding, options } = fixture(t, 'def create():\n    return Inspection(BetaDatabase())\n');
    const result = retrieve(cwd, binding, request, options);
    assert.equal(result.status, 'provided', result.reason);
    assert.deepEqual(result.anchor, anchor);
    assert.equal(result.links.find(item => item.role === 'implementation').symbol, 'BetaRepo.active_key');
    assert(!result.receipts.some(item => item.path.endsWith('/alpha.py')));
});

test('discovery, Git opens and output share one hard budget', t => {
    const { cwd, binding, options } = fixture(t, 'def create():\n    return Inspection(BetaDatabase())\n');
    for (const [cap, reason] of [
        [{ treeEntries: 1 }, 'tree-entry-budget'],
        [{ openedFiles: 1 }, 'opened-file-budget'],
        [{ scanBytes: 200 }, 'scan-byte-budget'],
        [{ evidenceBytes: 400 }, 'evidence-packet-budget'],
    ]) {
        const result = retrieve(cwd, binding, request, { ...options, caps: { ...limits, ...cap } });
        assert.equal(result.status, 'budget');
        assert.equal(result.reason, reason);
        assert(!result.receipts?.length);
    }
});

test('the existing single round validates new receipts and rejects another request', async t => {
    const { cwd, binding, options } = fixture(t, 'def create():\n    return Inspection(BetaDatabase())\n');
    const askForSource = { candidate: binding.candidate, kind: 'request', verdict: null, citations: [],
        reason: 'Need pinned evidence.', nextStep: null, request };
    const acquire = req => retrieve(cwd, binding, req, options);
    const verdict = await assess({ binding, receipts: [], arm: 'on-demand', acquire, ask: ({ receipts, followup }) => {
        if (!followup) return askForSource;
        return { candidate: binding.candidate, kind: 'verdict', verdict: 'refuted',
            citations: [receipts.at(-1).id], reason: 'Deterministic response.', nextStep: null, request: null };
    } });
    assert.equal(verdict.verdict, 'refuted');
    await assert.rejects(assess({ binding, receipts: [], arm: 'on-demand', acquire, ask: () => askForSource }),
        { code: 'second-request' });
});
