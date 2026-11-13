'use strict';

const assert = require('node:assert/strict');
const path = require('node:path').posix;
const vm = require('node:vm');
const ts = require('typescript');
const { git } = require('../on-demand/contract.cjs');
const quantityTrees = require('../module-diagnostic/held-out.lock.json');
const pageTrees = require('../partial-diagnostic/held-out.lock.json');

const copy = value => JSON.parse(JSON.stringify(value));
const html = (strings, ...values) => ({ strings, values });
class Element {
    events = [];
    dispatchEvent(event) { this.events.push(copy(event)); }
}
class Event {
    constructor(type, { detail }) { Object.assign(this, { type, detail }); }
}

function pinned(directory, subject, locked) {
    const cwd = path.join(directory, subject);
    const { head, tree } = locked[subject].binding;
    assert.equal(git(cwd, 'rev-parse', 'HEAD').trim(), head);
    assert.equal(git(cwd, 'rev-parse', 'HEAD^{tree}').trim(), tree);
    const source = file => git(cwd, 'show', head + ':' + file);
    const modules = new Map();
    function load(file) {
        if (modules.has(file)) return modules.get(file);
        assert(file.startsWith('frontend/src/') && file.endsWith('.ts'));
        const exports = {};
        modules.set(file, exports);
        const code = ts.transpileModule(source(file), {
            compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
        }).outputText;
        vm.runInNewContext(code, { exports, TextEncoder, CustomEvent: Event, customElements: { define() {} }, require(specifier) {
            if (specifier === 'lit') return { LitElement: Element, html, css: html, nothing: null };
            if (specifier === 'lit/directives/live.js') return { live: value => value };
            assert(specifier.startsWith('.'), specifier);
            return load(path.join(path.dirname(file), specifier + '.ts'));
        } }, { timeout: 750, contextCodeGeneration: { strings: false, wasm: false } });
        return exports;
    }
    return { cwd, head, tree, source, load };
}

function action(rendered, attribute, label) {
    const handlers = [];
    const visit = value => {
        if (Array.isArray(value)) return value.forEach(visit);
        if (!value?.strings || !value?.values) return;
        value.values.forEach((part, index) => {
            if (value.strings[index].trimEnd().endsWith('@' + attribute + '=')
                && typeof part === 'function' && (label === undefined || value.values[index + 1] === label)) handlers.push(part);
            visit(part);
        });
    };
    visit(rendered);
    assert.equal(handlers.length, 1);
    return handlers[0];
}

function wireDetail(precision) {
    const binding = { household_id: 'home', reference_id: 'ref', product_id: 'product', unit_id: 'unit',
        location_id: 'location', revision: 1, precision, label: 'Material' };
    const definition = { definition_id: 'definition', household_id: 'home',
        content: { title: 'Work', description: '', priority: 'normal', tags: [] },
        created_at: 100, overrides: {}, state: 'active', revision: 1,
        materials: [{ line_id: 'material', binding, planned_quantity: '1' }] };
    const work = { occurrence_id: 'work', household_id: 'home', definition_snapshot: definition, created_at: 100,
        state: 'in_progress', revision: 1, assignee_ids: [], prerequisite_ids: [],
        required_subtask_ids: [], due_at: null, current_cycle_id: null, current_cycle_revision: null, state_reason: '' };
    const rules = { claim_allowed: true, eligible_roles: ['adult'], verification: 'role_default',
        adult_performer_may_approve: true, task_scoped_material_consumption: true, material_recording: 'review_on_completion',
        point_value_minor: 0, dependency_gate: 'performed' };
    return { work, rules, task_policy_revision: 1, requirements: [], cycle: null, allowed_actions: ['complete'],
        consumer_delivery: 'unconfirmed', materials: [], dependency_reviews: { items: [], next_cursor: null },
        dependency_review_required: false };
}

const presentation = 'frontend/src/presentation/domus-tasks.ts';
function quantity(directory, subject) {
    const { head, tree, load } = pinned(directory, subject, quantityTrees);
    const { DomusTasks } = load(presentation);
    const { taskDetail } = load('frontend/src/adapters/task-values.ts');
    const { administrationJSON } = load('frontend/src/adapters/json-values.ts');
    const decode = precision => taskDetail(administrationJSON(JSON.stringify(wireDetail(precision))), 'work', 'home');
    const detail = decode(6);
    assert.equal(detail.materials[0].precision, 6);
    assert.throws(() => decode(7), { code: 'invalid_response' });
    const inputs = [['en', '1.12345', '1.12345'], ['en', '1.123456', subject === 'H1' ? '1.123456' : null],
        ['es', '1,123456', subject === 'H1' ? '1.123456' : null], ['en', '1.1234567', null]];
    const observed = inputs.map(([locale, raw, expected]) => {
        const element = new DomusTasks();
        element.language = locale;
        element.view = { phase: 'ready', busy: false, readOnly: false, records: [], detail };
        action(element.workDetail(), 'input')({ target: { value: raw } });
        action(element.workDetail(), 'submit')({ preventDefault() {} });
        const emitted = element.events[0]?.detail.materialUsages[0].quantity ?? null;
        assert.equal(emitted, expected);
        assert.equal(element.events.length, expected === null ? 0 : 1);
        assert.equal(element.quantityError, expected === null ? 'material' : null);
        if (expected !== null) assert.equal(element.events[0].type, 'domus-task-intent');
        return { locale, raw, emitted, quantityError: element.quantityError };
    });
    return { subject, head, tree, decoderAccepts: 6, decoderRejects: 7, observed };
}

const messages = 'frontend/src/presentation/task-messages.ts';
const controllerPath = 'frontend/src/application/task-controller.ts';
const testPath = 'frontend/tests/task-component.test.ts';

async function pagination(directory, subject) {
    const { cwd, head, tree, load, source } = pinned(directory, subject, pageTrees);
    if (subject === 'P2') assert.deepEqual(git(cwd, 'diff', '--name-only', pageTrees.P1.binding.head, head).trim().split('\n'), [messages]);
    const { DomusTasks } = load(presentation);
    const { TaskController } = load(controllerPath);
    const { taskMessage } = load(messages);
    const labels = ['en', 'es'].map(locale => taskMessage('more', locale));
    assert.deepEqual(labels, subject === 'P1' ? ['Next page', 'Página siguiente'] : ['Load more', 'Cargar más']);
    const context = { installationId: 'i', channel: 'test', subject: 's' };
    const read = value => ({ result: Promise.resolve(value), cancel() {} });
    const cursors = [];
    let identityReads = 0, accessReads = 0;
    const controller = new TaskController('test', { session() {
        identityReads++;
        return read({ deployment: 'test', context, access: 'full', serverTime: 1, expiresAt: 100, householdApiAvailable: true });
    } }, { access() {
        accessReads++;
        return read({ householdId: 'h', memberId: 'm' });
    }, list(_context, cursor) {
        cursors.push(cursor);
        const name = cursor ? 'work-next' : 'work-first';
        return read({ items: [{ occurrenceId: name, title: name, state: 'available', dueAt: null }], nextCursor: cursor ? null : 'next' });
    } }, { detach() {}, open() { return []; } }, { now() { return 1; }, anchor() {} }, {});
    await controller.refresh();
    const states = [Array.from(controller.view.page.items, item => item.title)];
    for (const [index, locale] of ['en', 'es'].entries()) {
        const element = new DomusTasks();
        element.language = locale;
        element.view = controller.view;
        action(element.render(), 'click', labels[index])();
        assert.deepEqual(element.events, [{ type: 'domus-task-intent', detail: { type: 'more' } }]);
    }
    await controller.more();
    states.push(Array.from(controller.view.page.items, item => item.title));
    await controller.refresh();
    states.push(Array.from(controller.view.page.items, item => item.title));
    assert.deepEqual(states, [['work-first'], ['work-next'], ['work-first']]);
    assert.deepEqual(cursors, [null, 'next', null]);
    assert.equal(identityReads, 3);
    assert.equal(accessReads, 3);
    const wiring = source('frontend/src/composition/entry-page.ts');
    assert(wiring.includes("addEventListener('domus-task-intent'") && wiring.includes("case 'more': await active.taskWork(controller => controller.more())"));
    const pinnedNavigationLabel = /No tasks on this page'\); f.button\('([^']+)'\).click\(\)/u.exec(source(testPath))?.[1];
    assert.equal(pinnedNavigationLabel, 'Next page');
    const navigationCopy = labels[0] === pinnedNavigationLabel;
    return { subject, head, tree, labels, states, cursors, identityReads, accessReads,
        behavior: { replacesCurrentPage: 'confirmed', refreshReturnsFirstPage: 'confirmed' },
        copy: { interpretation: navigationCopy ? 'next-page-navigation' : 'suggests-accumulation',
            pinnedNavigationLabel, matchesPinnedNavigationTest: navigationCopy },
        evidenceOfAccumulationRequirement: 'missing',
        findingVerdict: navigationCopy ? 'refuted' : 'inconclusive',
        ...(!navigationCopy && { missingPremise: 'Independent evidence that the product requires retaining earlier tasks.' }) };
}

async function main(known, reserved) {
    assert(known && reserved, 'Pass the checkout parents for H1/H2 and P1/P2.');
    for (const subject of Object.keys(quantityTrees)) console.log(JSON.stringify(quantity(known, subject)));
    for (const subject of Object.keys(pageTrees)) console.log(JSON.stringify(await pagination(reserved, subject)));
}

if (require.main === module) main(...process.argv.slice(2)).catch(error => { console.error(error); process.exitCode = 1; });
