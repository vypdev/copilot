import type { AgentConfiguration } from '../../ports/agent_configuration_ports';
import type { FindingsQueryPort } from '../../ports/agent_findings_ports';
import { ApplicationError } from '../../errors/application_error';
import {
  SDD_MIN_DRAFT_CHARACTERS, SDD_MAX_DRAFT_CHARACTERS, SDD_MAX_UPDATE_CHARACTERS,
  type SddPlan,
} from '../../../domain/pre_branch_sdd';

/** A provider schema and one bounded size repair share the writer's immutable limits. */
export async function draftSddMarkdown(
  agent: FindingsQueryPort,
  configuration: AgentConfiguration,
  plan: SddPlan,
  prompt: string,
): Promise<string> {
  const maximum = plan.action === 'update' ? SDD_MAX_UPDATE_CHARACTERS : SDD_MAX_DRAFT_CHARACTERS;
  const schema = {
    type: 'object',
    properties: { markdown: { type: 'string', minLength: SDD_MIN_DRAFT_CHARACTERS, maxLength: maximum } },
    required: ['markdown'], additionalProperties: false,
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    const value = await agent.query({
      configuration, agentId: 'pre-branch-sdd-draft',
      prompt: attempt === 0 ? prompt : `${prompt}\n\nThe previous response exceeded the ${maximum}-character draft limit. Regenerate a concise complete draft for this same owner and plan. Preserve all resolved requirements, architecture, numeric test budget, documentation and acceptance. Target at most ${Math.floor(maximum * 2 / 3)} characters. Do not change ownership or truncate a requirement. Return only the required JSON.`,
      options: { expectJson: true, schemaName: 'pre_branch_sdd_draft', schema },
    });
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || typeof (value as { markdown?: unknown }).markdown !== 'string') {
      throw new ApplicationError('validation.invalid-input', 'The drafting agent returned no SDD Markdown.');
    }
    const markdown = (value as { markdown: string }).markdown;
    if (markdown.length <= maximum) return markdown;
  }
  throw new ApplicationError('validation.invalid-input', 'The SDD draft exceeded its size limit after one bounded repair.', {
    recovery: { id: 'sdd-draft-size-exceeded', variables: {} },
  });
}
