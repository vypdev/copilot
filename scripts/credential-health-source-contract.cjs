'use strict';

const inputs = Object.freeze(['pat', 'openai', 'anthropic', 'google', 'openrouter', 'cursor', 'opencode', 'codex-api-key']);
// Proposed source-repository operating policy. Review approval is recorded
// separately; this mutable condition is not a boundary against workflow editors.
const actors = Object.freeze(['1783618', '260864876']);
const triggeringActors = Object.freeze(['efraespada', 'vypbot']);

function sourceHealthCondition(input) {
  if (!inputs.some(name => 'check_' + name.replaceAll('-', '_') === input)) throw new Error('Unknown source health input.');
  return '${{ inputs.' + input
    + " && github.event_name == 'workflow_dispatch' && github.repository == 'vypdev/copilot'"
    + " && contains(fromJSON('" + JSON.stringify(actors) + "'), github.actor_id)"
    + " && contains(fromJSON('" + JSON.stringify(triggeringActors) + "'), github.triggering_actor)"
    + " && github.ref == format('refs/heads/{0}', github.event.repository.default_branch)"
    + " && github.workflow_ref == format('{0}/.github/workflows/copilot_credential_health.yml@{1}', github.repository, github.ref) }}";
}

function assertSourceHealthPolicy(workflow) {
  const jobs = inputs.map(name => 'verify-' + name);
  if (JSON.stringify(Object.keys(workflow.jobs ?? {}).sort()) !== JSON.stringify([...jobs].sort())
    || inputs.some(name => workflow.jobs['verify-' + name].if !== sourceHealthCondition('check_' + name.replaceAll('-', '_')))) {
    throw new Error('Source credential health must retain its reviewed actor/default-ref/workflow selection contract.');
  }
  if (inputs.some(name => JSON.stringify(workflow.jobs['verify-' + name]['runs-on'])
    !== JSON.stringify({ group: 'vypdev', labels: ['self-hosted', 'codex', 'Linux'] }))) {
    throw new Error('Source credential health must use runs-on self-hosted, codex, Linux with the vypdev group.');
  }
}

module.exports = { actors, triggeringActors, sourceHealthCondition, assertSourceHealthPolicy };
