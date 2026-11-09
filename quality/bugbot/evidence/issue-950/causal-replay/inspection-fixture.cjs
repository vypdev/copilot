'use strict';

const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
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

const lateAssignment = [
    'def create(store):',
    '    inspection = Inspection(store)',
    '    store = BetaDatabase()',
    '    return inspection',
].join('\n');

const alternateEntry = returned => `def wire(store: BetaDatabase):
    return Inspection(store)

def get_alpha():
    return ${returned}

def create(use_beta):
    if use_beta:
        return wire(BetaDatabase())
    return wire(get_alpha())
`;

module.exports = { alternateEntry, anchor, fixture, lateAssignment, request };
