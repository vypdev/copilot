'use strict';

const { requestProblem } = require('../tree-search/git-evidence.cjs');
const { sourceLimits } = require('../packet-audit/git-evidence.cjs');
const { sourceReader } = require('../detector-verifier-diagnostic/runner.cjs');
const { byteLength } = require('../v4/verification.cjs');
const { requestBytes } = require('../coverage-895-pilot/manifest.json');

const object = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const choice = (...values) => ({ type: 'string', enum: values });
const nullable = type => ({ type: [type, 'null'] });
const nil = { type: 'null' };
const text = { type: 'string' };
const line = { type: 'integer', minimum: 1 };
const scope = { type: 'string', description: 'Repository-relative scope. An authorized root is the empty string. Search also accepts a single dot for that root.' };
const target = object({ scope, workspace: nullable('string'), match: choice('lines', 'name', 'literal'),
    query: nullable('string'), start: nullable('integer'), end: nullable('integer') });
const lineTarget = object({ scope: { type: 'string', minLength: 1, description: 'An exact repository-relative file.' },
    workspace: nil, match: choice('lines'), query: nil, start: line,
    end: { ...line, description: `Inclusive end. The range must be ordered and contain at most ${sourceLimits.lines} lines.` } });
const searchTarget = match => object({ scope, workspace: nullable('string'), match: choice(match),
    query: match === 'name' ? { type: 'string', minLength: 1, pattern: '^[^/\\\\]+$',
        description: 'Exact basename including its extension when present. Wildcard characters are literal.' }
        : { type: 'string', minLength: 1, description: 'Text to find within files.' },
    start: nil, end: nil });
const targets = (items, maxItems) => ({ type: 'array', minItems: 1, maxItems, items });
const revision = choice('head');
const searchItem = { ...target, anyOf: [searchTarget('name'), searchTarget('literal')] };
const requestSchema = {
    ...object({ revision, kind: choice('readBlob', 'searchTree'), targets: targets(target, sourceLimits.maxTargets) }),
    type: ['object', 'null'],
    anyOf: [
        nil,
        object({ revision, kind: choice('readBlob'), targets: targets(lineTarget, 1) }),
        object({ revision, kind: choice('searchTree'), targets: targets(searchItem, sourceLimits.maxTargets) }),
    ],
};

const instructions = 'Return a final decision with request set to null or one typed request with decision set to null. Only the reviewed head is authorized. '
    + 'Use readBlob with one exact repository-relative file, match lines, inclusive start/end and null query/workspace. '
    + `The range may contain at most ${sourceLimits.lines} lines. Each fragment is limited to ${sourceLimits.fragmentBytes.toLocaleString('en-US')} UTF-8 bytes. Prefer short windows. `
    + `Use searchTree with one to ${sourceLimits.maxTargets} targets, a repository-relative scope and null start/end. Use scope "" for the authorized repository root. The single dot is a search alias for that root. `
    + 'Use match name for the exact basename including its extension when present. Name matching treats wildcard characters literally. Use match literal for text inside files. Use null workspace unless targeting a declared workspace.';

function admit(original, scopes, validate = requestProblem) {
    const denied = reason => ({ normalized: original, admission: { status: 'denied', reason } });
    if (!original || typeof original !== 'object' || Array.isArray(original)
        || Object.keys(original).sort().join(',') !== 'kind,revision,targets') return denied('request-shape');
    if (original.revision !== 'head') return denied('revision-not-authorized');
    if (byteLength(JSON.stringify(original)) > requestBytes) {
        return { normalized: original, admission: { status: 'budget', reason: 'request-envelope-budget' } };
    }
    let normalized = original;
    if (original.kind === 'searchTree' && scopes.includes('') && Array.isArray(original.targets)) {
        normalized = { ...original, targets: original.targets.map(target =>
            target?.scope === '.' ? { ...target, scope: '' } : target) };
    }
    const { revision: _, ...query } = normalized;
    return { normalized, admission: validate(query, scopes) ?? { status: 'admitted' } };
}

function read(cwd, binding, original) {
    const checked = admit(original, binding.scopes);
    if (checked.admission.status !== 'admitted') return { ...checked, result: null, usage: null };
    const reader = sourceReader({ cwd }, { head: binding });
    const result = reader.read(checked.normalized, false);
    return { ...checked, result, usage: reader.usage() };
}

module.exports = { admit, read, requestSchema, instructions };
