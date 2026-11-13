'use strict';

const assert = require('node:assert/strict');
const legacy = require('../git-request-replay/adapter.cjs');
const { receipt } = require('../on-demand/contract.cjs');
const { retrieve, sourceLimits } = require('./git-evidence.cjs');
const { requestProblem, patternBytes } = require('./path-pattern.cjs');

const object = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const string = { type: 'string', minLength: 1 };
const pattern = { ...string, maxLength: patternBytes, description: 'Scope-relative path. Use * for zero or more characters and ? for one character within a segment. No recursive wildcard, absolute paths, or dot, parent or .git segments.' };
const filtered = object({ text: string, pathPattern: pattern });
const requestSchema = structuredClone(legacy.requestSchema);
const base = requestSchema.properties.targets.items;
const search = requestSchema.anyOf[2].properties.targets.items;
const targetFields = {
    ...base.properties,
    match: { ...base.properties.match, enum: [...base.properties.match.enum, 'pathPattern'] },
    query: { ...filtered, type: ['string', 'object', 'null'] },
};
base.properties = targetFields;
search.properties = targetFields;
const literal = search.anyOf[1];
const noWorkspace = { type: 'null' };
search.anyOf.push(
    object({ ...literal.properties, workspace: noWorkspace, match: { type: 'string', enum: ['pathPattern'] }, query: pattern }),
    object({ ...literal.properties, workspace: noWorkspace, query: filtered }),
);

const instructions = legacy.instructions
    + ' To find a file by path, use match pathPattern with a scope-relative pattern as query, for example "config/*-local?.json". '
    + 'To search text only in matching files, use match literal with query like {"text":"loadSettings(","pathPattern":"src/*.ts"}. '
    + 'For these two forms set workspace to null. * matches zero or more characters and ? matches one character within a segment. '
    + 'Patterns match the whole path relative to scope, cannot recurse with **, and cannot use absolute paths or dot, parent or .git segments.';

function read(cwd, binding, original) {
    const checked = legacy.admit(original, binding.scopes, requestProblem);
    if (checked.admission.status !== 'admitted') return { ...checked, result: null, usage: null };
    const { revision: _, ...query } = checked.normalized;
    const result = retrieve(cwd, binding, query);
    const budget = result.budget;
    const usage = budget ? { treeEntries: budget.treeEntries, openedFiles: budget.openedFiles, matches: budget.matches,
        evidenceBytes: budget.evidenceBytes, sourceBytes: budget.sourceBytes, elapsedMs: budget.elapsedMs,
        receipts: result.receipts.length, accounted: true } : null;
    for (const proof of result.receipts ?? []) assert.deepEqual(receipt(binding, proof), proof, 'receipt-integrity');
    return { ...checked, result, usage };
}

module.exports = { read, requestSchema, instructions, sourceLimits };
