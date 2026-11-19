'use strict';

const assert = require('node:assert/strict');

const officialPackage = target => target === '@playwright/test' ? 'playwright' : target.toLowerCase();

function catalogPackagesInClaim(packages, claim) {
    return packages.filter(name => new RegExp(
        `(?:^|[^a-z0-9])${RegExp.escape(name)}(?=[^a-z0-9]|$)`, 'iu').test(claim));
}

function missingMaterialOfficialEvidence({ answer, dependencies, required, head, base, allowBase, normalize }) {
    const material = new Map();
    for (const dependency of dependencies) {
        const name = normalize(dependency.package);
        assert(/^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/u.test(name) && name.length <= 128, 'invalid-material-dependency');
        assert(dependency.revision === 'head' || allowBase, 'material-dependency-base-denied');
        assert(Number.isSafeInteger(dependency.premise) && dependency.premise > 0
            && dependency.premise <= answer.premises.length, 'invalid-material-dependency-premise');
        const sha = dependency.revision === 'head' ? head : base;
        const key = JSON.stringify([name, sha, dependency.premise]);
        assert(!material.has(key), 'duplicate-material-dependency');
        material.set(key, { name, sha, premise: dependency.premise });
    }
    if (answer.label === 'inconclusive') return [];
    for (const name of required) {
        if (![...material.values()].some(entry => entry.name === name && entry.sha === head)) {
            material.set(name, { name, sha: head });
        }
    }
    return [...material.values()].flatMap(({ name, sha, premise }) => {
        const citations = premise ? answer.premises[premise - 1].citations : answer.citations;
        return citations.some(citation => citation.kind === 'official' && citation.package === name && citation.sha === sha)
            ? [] : [{ issue: 'official-evidence-missing', package: name, sha, ...(premise ? { premise } : {}) }];
    });
}

module.exports = { catalogPackagesInClaim, missingMaterialOfficialEvidence, officialPackage };
