'use strict';

// Test-only serialization/ownership port. All card decisions use the installed policy.
const { publishBugbotStatusCard } = require('../../../../../src/application/policies/bugbot_status_card_publication_policy');

function publishCard(wakeup, lane) {
    return publishBugbotStatusCard(wakeup, {
        exclusive: (repositoryId, pullNumber, operation) => lane.exclusive(repositoryId, pullNumber, writer => operation({
            ...writer,
            async read() {
                const snapshot = await writer.read();
                const canonical = snapshot?.canonical;
                return canonical && (!canonical.trusted || typeof canonical.body !== 'string') ? undefined : snapshot;
            },
        })),
    });
}

module.exports = { publishCard };
