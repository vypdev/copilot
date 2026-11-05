export const SDD_QUESTION_KINDS = ['product-decision', 'external-prerequisite', 'action-postcondition'] as const;
export type SddQuestionKind = typeof SDD_QUESTION_KINDS[number];

export const SDD_CLARIFICATION_INSTRUCTIONS = [
  'Separate product decisions and external repository prerequisites from Action-owned publication and readiness.',
  'Ask about a missing prerequisite merge, selected base evidence, or an unresolved product, security, or ownership decision. Keep such questions separate.',
  'The current issue branch is created or verified by the Action after SDD drafting and validation. Source implementation waits for verified SDD publication and the exact linked branch.',
  'Never ask a maintainer to confirm that this issue’s managed branch, first SDD commit, or readiness already exists. Omit those Action-owned postconditions from questions.',
  'Classify each blocking question as product-decision or external-prerequisite. Use action-postcondition only to identify a workflow outcome if it must be represented. It cannot authorize any mutation.',
].join(' ');

/** Drop only a question about this issue's own lifecycle. Independent decisions stay blocking. */
export function blockingSddQuestions<T extends { readonly text: string; readonly kind?: SddQuestionKind }>(
  questions: readonly T[],
): readonly T[] {
  return questions.filter(question => {
    const text = question.text.normalize('NFKC').toLowerCase();
    // An external merge or a product choice remains a prerequisite even in a mixed question.
    if (/\b(?:merg\w*|pull requests?|prs?\s*#?\d+|dependenc\w*|fusion\w*|integraci[oó]n previa|dependencia\w*)\b/u.test(text)
      || /\b(?:which|what|how should|who should|qu[eé]|cu[aá]l|qui[eé]n)\s+(?:policy|behavior|scope|owner|permissions?|pol[ií]tica|comportamiento|alcance|permisos?)\b/u.test(text)
      || /\b(?:upstream|external|another|separate|extern[ao]|otra)\s+(?:feature\s+)?(?:branch|rama)\b/u.test(text)) return true;
    const ownBranch = /\b(?:(?:managed|action[- ]owned|exact|issue)[- ]+(?:issue[- ]+)?branch|rama[^.?!]{0,55}(?:gestionada|exacta|de (?:esta |la )?issue))\b/u.test(text)
      || /\b(?:action|acci[oó]n)\b[^.?!]{0,110}\b(?:branch|rama)\b/u.test(text);
    const publication = /\b(?:first sdd commit|sdd publication|sdd.{0,24}published|publicaci[oó]n del sdd|primer commit del sdd)\b/u.test(text);
    const ready = /\b(?:already|admitted|publish\w*|exist\w*|creat\w*|available|ready|link\w*|verif\w*|prepar\w*|admitid\w*|public\w*|cread\w*|disponible|vinculad\w*)\b/u.test(text);
    return !((ownBranch || publication) && (ready || question.kind === 'action-postcondition'));
  });
}
