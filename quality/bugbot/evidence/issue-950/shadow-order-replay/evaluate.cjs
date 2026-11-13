'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { git } = require('../shadow-real-prs/broker.cjs');
const { localRuntime } = require('../shadow-verification/plan.json');

const [lab, ledger] = process.argv.slice(2);
const verifier = path.join(__dirname, '../shadow-closure-replay/evaluate.cjs');
const [integrity] = JSON.parse(execFileSync(process.execPath, [verifier, lab, ledger], { encoding: 'utf8' }));
const rows = fs.readFileSync(ledger, 'utf8').trim().split('\n').map(line => JSON.parse(line));
const { candidate, runtime, configuration } = rows.find(row => row.event === 'replay-plan');
const result = rows.find(row => row.event === 'finding-result');
const subjects = {
    24: { model: 'gpt-6-luna', head: 'e129e76e25deff7314efe3b72996d295cf73f7f3' },
    29: { model: 'gpt-6.1-sol', head: '57a8b4c6a9f52afb1ffc8e38275bcfd13575a3ae' },
};
assert.deepEqual({ model: integrity.model, head: candidate.headSha }, subjects[candidate.pullRequest]);
if (candidate.pullRequest === 24) assert.equal(runtime, localRuntime.python + ' ' + localRuntime.sqlite);
const repo = path.join(lab, candidate.repository.name + '.git');
const { answer } = result;
const citations = answer?.citations ?? [];
const covers = (proof, path, first, last = first) => proof.path === path && proof.first <= first && proof.last >= last;
const sqlite = 'backend/src/domus/infrastructure/sqlite.py';
const taskSchema = 'backend/src/domus/infrastructure/sqlite_task_schema.py';
const profileSchema = 'backend/src/domus/infrastructure/sqlite_member_profile_schema.py';
const order = (answer?.premises ?? []).flatMap(premise => premise.order.map(route => ({ claim: premise.claim, ...route })));
const matches = (evidence, first, last, excerpt) => evidence.some(({ citation, excerpt: quoted }) =>
    covers(citation, sqlite, first, last) && quoted.includes(excerpt));
for (const route of order) {
    for (const role of ['first', 'second', 'mechanism']) {
        for (const { citation, excerpt } of route[role]) {
            assert.equal(citation.kind, 'git');
            assert(citations.some(proof => proof.receipt === citation.receipt && proof.first === citation.first && proof.last === citation.last));
            const source = git(repo, ['show', citation.sha + ':' + citation.path]).split(/\r?\n/u);
            assert(source.slice(citation.first - 1, citation.last).join('\n').includes(excerpt.trim()));
        }
    }
}
const ranges = route => Object.fromEntries(['first', 'second', 'mechanism'].map(role => [role, route[role].map(({ citation, excerpt }) =>
    ({ path: citation.path, first: citation.first, last: citation.last, excerpt }))]));
if (candidate.pullRequest === 29) {
    console.log(JSON.stringify({ ...integrity, effort: configuration.effort,
        routes: order.map(route => ({ route: route.route, claim: route.claim, ranges: ranges(route) })),
        solMeetsCitationCriteria: integrity.verdictMatches && integrity.exactRanges.every(step => step.premises.length > 0),
    }, null, 2));
    process.exit(0);
}
const routes = order.map(route => ({
    route: route.route,
    claim: route.claim,
    firstOperation: route.first.some(({ citation }) => covers(citation, taskSchema, 5)),
    secondOperation: [8, 16].every(line => route.second.some(({ citation }) => covers(citation, profileSchema, line))),
    taskEntry: matches([...route.first, ...route.mechanism], 97, 97, 'TASK_STATEMENTS'),
    profileEntry: matches([...route.second, ...route.mechanism], 101, 101, 'PROFILE_STATEMENTS'),
    executionLoop: matches(route.mechanism, 370, 370, 'SCHEMA_STATEMENTS')
        && matches(route.mechanism, 371, 371, 'connection.execute'),
    createsIndexInMigration: matches(route.mechanism, 383, 383, 'version < 5')
        && matches(route.mechanism, 387, 387, 'PROFILE_STATEMENTS')
        && matches(route.mechanism, 389, 389, 'for statement in migration')
        && matches(route.mechanism, 390, 390, 'connection.execute'),
    ranges: ranges(route),
}));
const uniqueIndex = citations.some(proof => covers(proof, taskSchema, 5));
const officialRule = citations.some(proof => proof.kind === 'official' && proof.package === 'sqlite'
    && proof.version === localRuntime.sqlite && proof.versionScope === localRuntime.scope
    && (proof.first <= 144 && proof.last >= 147 || proof.first <= 230 && proof.last >= 233));
const freshOrder = routes.some(route => route.firstOperation && route.secondOperation
    && route.taskEntry && route.profileEntry && route.executionLoop);
const migrationMentioned = /\b(?:migrations?|upgrades?)\b/iu.test([answer?.reason, ...(answer?.premises ?? []).map(premise => premise.claim), ...order.map(route => route.route)].join(' '));

const laterTrackedIndexes = [[5, 55], [6, 79], [7, 39], [8, 61]].map(([version, line]) => {
    const file = `tests/fixtures/sqlite/v${version}.sql`;
    const cited = citations.some(proof => covers(proof, file, line))
        && git(repo, ['show', candidate.headSha + ':' + file]).split(/\r?\n/u)[line - 1]
            .includes('CREATE UNIQUE INDEX task_member_scope ON members(household_id,member_id)');
    return { version, file, line, cited };
});
const migrationEvidenceComplete = !migrationMentioned || (
    routes.some(route => route.firstOperation && route.secondOperation && route.createsIndexInMigration)
    && laterTrackedIndexes.every(entry => entry.cited)
);
console.log(JSON.stringify({
    ...integrity, effort: configuration.effort, uniqueIndex, officialRule, freshOrder, migrationMentioned, routes,
    laterTrackedIndexes, migrationEvidenceComplete,
    lunaMeetsCitationCriteria: integrity.verdictMatches && uniqueIndex && officialRule && freshOrder && migrationEvidenceComplete,
}, null, 2));
