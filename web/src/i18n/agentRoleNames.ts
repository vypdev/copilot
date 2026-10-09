import type { SetupLocale } from './catalog';

export const agentRoleNames: Readonly<Record<SetupLocale, Readonly<Record<string, string>>>> = {
  en: { planner: 'Planner', findings: 'Findings analyst', reviewer: 'Reviewer', fixer: 'Fixer', tester: 'Tester' },
  es: { planner: 'Planificador', findings: 'Analista de hallazgos', reviewer: 'Revisor', fixer: 'Corrector', tester: 'Probador' },
  fr: { planner: 'Planificateur', findings: 'Analyste des problèmes', reviewer: 'Réviseur', fixer: 'Correcteur', tester: 'Testeur' },
  pt: { planner: 'Planeador', findings: 'Analista de problemas', reviewer: 'Revisor', fixer: 'Corretor', tester: 'Testador' },
};

export function agentRoleName(role: string, locale: SetupLocale): string {
  return agentRoleNames[locale][role] ?? role;
}
