export const SDD_QUESTION_KINDS = ['product-decision', 'external-prerequisite', 'action-postcondition'] as const;
export type SddQuestionKind = typeof SDD_QUESTION_KINDS[number];

export const SDD_CLARIFICATION_INSTRUCTIONS = [
  'Separate product decisions and external repository prerequisites from Action-owned publication and readiness.',
  'Ask about a missing prerequisite merge, selected base evidence, or an unresolved product, security, or ownership decision. Keep such questions separate.',
  'The current issue branch is created or verified by the Action after SDD drafting and validation. Source implementation waits for verified SDD publication and the exact linked branch.',
  'Never ask a maintainer to confirm that this issue’s managed branch, first SDD commit, or readiness already exists. Omit those Action-owned postconditions from questions.',
  'Classify each blocking question as product-decision or external-prerequisite. Use action-postcondition only to identify a workflow outcome if it must be represented. It cannot authorize any mutation.',
].join(' ');

const independentPrerequisite = /\b(?:merg\w*|pull requests?|prs?\s*#?\d+|dependenc\w*|fusion\w*|integraci[oó]n previa|dependencia\w*)\b/u;
const productChoice = /\b(?:which|what|how should|who should|qu[eé]|cu[aá]l|qui[eé]n)\s+(?:policy|behavior|scope|owner|permissions?|pol[ií]tica|comportamiento|alcance|permisos?)\b/u;
const externalBranch = /\b(?:upstream|external|another|separate|extern[ao]|otra)\s+(?:feature\s+)?(?:branch|rama)\b/u;
const ownLifecycle = /\b(?:(?:managed|action[- ]owned|exact|issue)[- ]+(?:issue[- ]+)?branch|rama[^.?!]{0,55}(?:gestionada|exacta|de (?:esta |la )?issue)|first sdd commit|sdd publication|sdd.{0,24}published|publicaci[oó]n del sdd|primer commit del sdd)\b/u;
const asksAboutAction = /(?:^|,\s*)(?:(?:can|could)\s+you\s+confirm\s+(?:whether|that)\s+(?:the )?(?:action|managed branch)|(?:has|did|will|can)\s+(?:the )?action\b|(?:ha|cre[oó]|puede)\s+(?:la )?acci[oó]n\b|(?:is|has|does|est[aá])\s+(?:the |this |la |el )?(?:managed|action[- ]owned|exact|issue|rama|sdd|first sdd))\b/u;
const lifecycleOutcome = /\b(?:admit\w*|publish\w*|exist\w*|creat\w*|available|ready|link\w*|verif\w*|prepar\w*|admitid\w*|public\w*|cread\w*|disponible|vinculad\w*)\b/u;

/** Remove only direct questions about this issue's own Action outcome. */
export function blockingSddQuestions<T extends { readonly text: string; readonly kind?: SddQuestionKind; readonly suggestion?: string }>(
  questions: readonly T[],
): readonly T[] {
  return questions.flatMap(question => {
    const text = question.text.normalize('NFKC').toLowerCase();
    const hasIndependentDecision = independentPrerequisite.test(text) || productChoice.test(text) || externalBranch.test(text);
    if (hasIndependentDecision) {
      // Keep the genuine prerequisite when the model tacks on a second,
      // independently phrased question about the current managed branch.
      const separators = /(?:[?;]\s+|,?\s+(?:and|y)\s+)/giu;
      for (const separator of question.text.matchAll(separators)) {
        const tail = question.text.slice(separator.index + separator[0].length).normalize('NFKC').toLowerCase();
        if (asksAboutAction.test(tail) && ownLifecycle.test(tail) && lifecycleOutcome.test(tail)
          && !independentPrerequisite.test(tail) && !productChoice.test(tail) && !externalBranch.test(tail)) {
          const prefix = question.text.slice(0, separator.index).trimEnd();
          if (prefix.length >= 12 && (independentPrerequisite.test(prefix.toLowerCase()) || productChoice.test(prefix.toLowerCase())
            || externalBranch.test(prefix.toLowerCase()))) return [{ ...question, text: prefix + '?', suggestion: undefined }];
        }
      }
      return [question];
    }
    return ownLifecycle.test(text) && asksAboutAction.test(text)
      && (lifecycleOutcome.test(text) || question.kind === 'action-postcondition') ? [] : [question];
  });
}
