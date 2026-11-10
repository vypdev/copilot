'use strict';

const { requestProblem: legacyProblem } = require('../tree-search/git-evidence.cjs');
const { byteLength } = require('../v4/verification.cjs');

const patternBytes = 120;
const isFilteredLiteral = target => target?.match === 'literal' && target.query !== null && typeof target.query === 'object';
const pathPattern = target => target.match === 'pathPattern' ? target.query
    : isFilteredLiteral(target) ? target.query.pathPattern : null;
const denied = reason => ({ status: 'denied', reason });

function requestProblem(request, scopes) {
    if (!Array.isArray(request?.targets)) return legacyProblem(request, scopes);
    // Use the existing shape, target-count, scope and literal-text validation.
    const targets = request.targets.map(target => {
        if (target?.match === 'pathPattern') return { ...target, match: 'literal', query: 'path pattern' };
        if (isFilteredLiteral(target)) return { ...target, query: target.query.text };
        return target;
    });
    const problem = legacyProblem({ ...request, targets }, scopes);
    if (problem) return problem;
    for (const target of request.targets) {
        if (target.match !== 'pathPattern' && !isFilteredLiteral(target)) continue;
        if (target.workspace !== null) return denied('pattern-workspace-denied');
        if (isFilteredLiteral(target) && (Array.isArray(target.query)
            || Object.keys(target.query).sort().join(',') !== 'pathPattern,text')) return denied('request-shape');
        const pattern = pathPattern(target);
        if (typeof pattern !== 'string' || !pattern.trim() || /[\x00-\x1f\x7f\\:]/u.test(pattern)
            || pattern.includes('**') || pattern.split('/').some(part => !part || ['.', '..', '.git'].includes(part.toLowerCase()))) {
            return denied('path-pattern-denied');
        }
        if (byteLength(pattern) > patternBytes) return { status: 'budget', reason: 'path-pattern-byte-budget' };
    }
    return null;
}

// A star can consume only characters in this segment. Track its last position
// to retry with one more character instead of building a backtracking regex.
function matchSegment(value, pattern) {
    const chars = [...value];
    let i = 0, j = 0, star = -1, consumed = 0;
    while (i < chars.length) {
        if (pattern[j] === '*') {
            star = j++;
            consumed = i;
        } else if (pattern[j] === '?' || pattern[j] === chars[i]) {
            i++;
            j++;
        } else if (star !== -1) {
            i = ++consumed;
            j = star + 1;
        } else return false;
    }
    while (pattern[j] === '*') j++;
    return j === pattern.length;
}

function matchPath(path, segments) {
    const parts = path.split('/');
    return parts.length === segments.length && segments.every((segment, index) => matchSegment(parts[index], segment));
}

module.exports = { requestProblem, pathPattern, matchPath, patternBytes };
