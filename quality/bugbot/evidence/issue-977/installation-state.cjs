'use strict';

// Read-only evidence classification for the reviewed installation proposal.
// It neither changes a target nor authorizes the existing setup installer.
const { createHash } = require('node:crypto');
const hash = value => createHash('sha256').update(value).digest('hex');

function installationState(plan, observed) {
    if (observed.repositoryId !== plan.destination.repositoryId
        || observed.repository !== plan.destination.repository) return 'incompatible';
    if (observed.defaultBranch !== plan.destination.defaultBranch
        || observed.head !== plan.destination.head) return 'stale-source';
    if (typeof observed.workflow === 'string') return hash(observed.workflow) === plan.proposedWorkflowSha256
        ? 'exact-installed-bytes' : 'incompatible';
    return observed.workflowParentReadable === true && Array.isArray(observed.workflowNames)
        && observed.workflowNames.length < 1000 && observed.workflowNames.every(name => typeof name === 'string')
        && !observed.workflowNames.includes(plan.path.split('/').at(-1)) ? 'absent' : 'unknown';
}

module.exports = { installationState };
