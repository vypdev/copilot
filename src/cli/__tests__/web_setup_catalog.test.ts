import { en, es, setupCatalogs, setupLocales, stageLabel, tr } from '../../../web/src/i18n/catalog';
import { permissionName, permissionStatus, permissionTerm, permissionTermCatalogs } from '../../../web/src/i18n/permissionTerms';
import { isQuestionOptionLocalized, optionCatalogs, questionOptionLabel } from '../../../web/src/i18n/questionOptions';
import { setupQuestionContentInventory } from '../../application/policies/setup_questionnaire_policy';
import { permissionCopy, permissionCopyCatalogs, isKnownPermissionCopy } from '../../../web/src/i18n/permissionCopy';
import { permissionEvidence } from '../../../web/src/i18n/permissionEvidence';
import { permissionTexts } from '../../../web/src/i18n/permissions/en';
import * as ts from 'typescript';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { promptCopyCatalogs, localizedPromptChoice, localizedPromptCopy } from '../../../web/src/i18n/promptCopy';
import { messageCopyCatalogs, localizedMessage } from '../../../web/src/i18n/messageCopy';
import { localizedSessionError, sessionErrorCatalogs } from '../../../web/src/i18n/sessionErrors';
import { localizedPlanWarning, planWarningCatalogs } from '../../../web/src/i18n/planWarningCopy';
import { agentRoleName, agentRoleNames } from '../../../web/src/i18n/agentRoleNames';
import { projectTransitionKey } from '../../../web/src/i18n/projectTransitions';
import { validationCopy } from '../web_setup_adapters';
import { translatedQuestionLabel } from '../../application/policies/setup_question_labels_fr_pt';
import { permissionProgressCopy, permissionProgressError } from '../../../web/src/i18n/permissionProgress';

describe('web setup localization catalog', () => {
  test('permission progress and bounded errors have four complete localized paths', () => {
    for (const locale of setupLocales) {
      for (const phase of ['pending', 'checking', 'creating', 'reading', 'deleting', 'verified', 'failed', 'skipped'] as const) {
        expect(permissionProgressCopy(locale, phase).trim()).not.toBe('');
      }
      expect(permissionProgressError(locale, 'http-403')).toBe({ en: 'GitHub HTTP 403',
        es: 'Error HTTP 403 de GitHub', fr: 'Erreur HTTP 403 de GitHub',
        pt: 'Erro HTTP 403 do GitHub' }[locale]);
      expect(permissionProgressError(locale, 'issue-closed-42')).toContain('42');
      expect(permissionProgressError(locale, 'issue-unresolved-42')).toContain('42');
      for (const detail of ['unavailable', 'cleanup-pending', 'secret-collision', 'unsupported'] as const) {
        expect(permissionProgressError(locale, detail).trim()).not.toBe('');
      }
      expect(permissionProgressError(locale, 'secret provider body')).not.toContain('secret provider body');
    }
  });
  test('English is the default and only the four selected locales are advertised', () => {
    expect(setupLocales).toEqual(['en', 'es', 'fr', 'pt']);
    expect(es).toBe(setupCatalogs.es);
    const keys = Object.keys(en).sort();
    for (const locale of setupLocales) {
      expect(Object.keys(setupCatalogs[locale]).sort()).toEqual(keys);
      for (const key of keys) {
        const value = setupCatalogs[locale][key as keyof typeof en];
        expect(value.trim()).not.toBe('');
        expect([...value.matchAll(/\{([a-zA-Z]\w*)\}/gu)].map(match => match[1]).sort())
          .toEqual([...en[key as keyof typeof en].matchAll(/\{([a-zA-Z]\w*)\}/gu)].map(match => match[1]).sort());
      }
    }
  });

  test('every locale warns about the non-atomic GitHub Secret write check', () => {
    for (const locale of setupLocales) {
      const warning = tr('planSecretProbeLimit', locale);
      expect(warning).toMatch(/GitHub/u);
      expect(warning).toMatch(/Secret/u);
      expect(warning.length).toBeGreaterThan(100);
    }
  });

  test('shared question labels route English and Spanish without leaking terminal selector hints', () => {
    const question = { stateId: 'capabilities' as const, id: 'features.issues', label: 'Issue workflows (Space toggles, Enter confirms)',
      kind: 'boolean' as const, defaultValue: true };
    expect(translatedQuestionLabel(question, 'en')).toBe('Issue workflows');
    expect(translatedQuestionLabel(question, 'es')).not.toContain('Space toggles');
  });

  test('unsupported runtime locale falls back to complete English copy', () => {
    expect(tr('blockedTitle', 'invalid' as typeof setupLocales[number])).toBe(en.blockedTitle);
  });

  test('interpolation and stage names follow the selected locale', () => {
    expect(tr('reviewPass', 'es', { pass: '2' })).toContain('pasada 2');
    expect(tr('reviewPass', 'en')).not.toContain('{pass}');
    expect(stageLabel('Setup PAT', 'fr')).toBe(tr('setupPat', 'fr'));
    expect(stageLabel('unrecognized', 'en')).toBe(tr('gettingReady', 'en'));
  });

  test('public permission and prompt copy translate known text and omit missing placeholders safely', () => {
    const known = 'Inspect selected Projects and their Status options; setup does not edit Project items.';
    expect(permissionCopy('es', known)).toContain('Status');
    expect(permissionCopy('en', known)).toBe(known);
    expect(permissionCopy('fr', 'Provider-generated detail')).toBe(tr('permissionUnknown', 'fr'));
    expect(localizedPromptCopy({ kind: 'choice', title: 'raw', choices: [], copyId: 'setupPat.confirmAccount',
      copyValues: { account: 'bot' } }, 'es')?.title).toContain('bot');
    expect(localizedPromptCopy({ kind: 'choice', title: 'raw', choices: [], copyId: 'setupPat.confirmAccount' }, 'en')?.title)
      .not.toContain('{account}');
    expect(localizedPromptCopy({ kind: 'choice', title: 'raw', choices: [] }, 'es')).toBeUndefined();
    expect(localizedPromptCopy({ kind: 'choice', title: 'raw', choices: [], copyId: 'credential.existing',
      copyValues: { status: 'valid' } }, 'fr')?.title).toContain('Valide');
    expect(localizedPromptCopy({ kind: 'choice', title: 'raw', choices: [], copyId: 'credential.existing',
      copyValues: { status: 'provider-specific' } }, 'es')?.title).toContain('provider-specific');
    expect(localizedPromptChoice({ kind: 'choice', title: 'raw', choices: ['Fallback'], copyId: 'credential.apiKey' }, 'es', 0))
      .toBe('Fallback');
  });

  test('PAT confirmation targets only unverified required grants in all web locales', () => {
    for (const locale of setupLocales) {
      const copy = localizedPromptCopy({ kind: 'choice', title: 'raw', choices: ['No, stop', 'Yes, I checked them'],
        copyId: 'setupPat.confirmUnverifiedAccess' }, locale);
      expect(copy?.title.trim()).not.toBe('');
      expect(copy?.description).toMatch(/Projects/u);
      expect(copy?.description).toMatch(locale === 'en' ? /Verified rows already passed/u
        : locale === 'es' ? /Verificados ya pasaron/u
        : locale === 'fr' ? /Vérifiées ont déjà passé/u : /Verificadas já passaram/u);
      expect(copy?.description).toMatch(locale === 'en' ? /only if that row is Unverifiable/u
        : locale === 'es' ? /solo si esa fila aparece como No verificable/u
        : locale === 'fr' ? /seulement si cette ligne est Non vérifiable/u
        : /apenas se essa linha estiver Não verificável/u);
    }
  });

  test('permission evidence never turns an inconclusive read or write into a verified claim', () => {
    const base = { scope: 'organization' as const, permission: 'Projects', level: 'read' as const, applicability: 'required' as const };
    for (const locale of setupLocales) {
      expect(permissionEvidence({ ...base, status: 'verified' }, locale))
        .toBe(tr('permissionEvidencePrivateProject', locale));
      expect(permissionEvidence({ ...base, permission: 'Members', status: 'verified' }, locale))
        .toBe(tr('permissionEvidenceVerified', locale));
      expect(permissionEvidence({ ...base, status: 'missing' }, locale))
        .toBe(tr('permissionEvidenceMissing', locale));
      expect(permissionEvidence({ ...base, level: 'write', status: 'unverifiable' }, locale))
        .toBe(tr('permissionEvidenceWrite', locale));
      expect(permissionEvidence({ ...base, status: 'unverifiable', publicReadEvidence: 'public-organization-projects' }, locale))
        .toBe(tr('permissionEvidencePublicProjects', locale));
      expect(permissionEvidence({ ...base, status: 'unverifiable', publicReadEvidence: 'public-repository' }, locale))
        .toBe(tr('permissionEvidencePublic', locale));
      expect(permissionEvidence({ ...base, status: 'unverifiable' }, locale))
        .toBe(tr('permissionEvidenceUnknownRead', locale));
    }
  });

  test('every known questionnaire validation has localized copy and unknown text cannot leak English into other locales', () => {
    const messages = [
      'This is the first question in this pass. Review it or cancel setup.',
      'A trusted check was selected more than once.',
      'The saved Status value is not available in every selected Project. Choose a listed Status option.',
      'Selected Projects have no common Status option. Choose compatible Projects or configure them separately.',
      'Choose at most 10 Projects; separate numbers or URLs with commas.',
      'A Project URL needs a known repository owner; enter its positive number instead.',
      'Use a GitHub Project URL belonging to acme, without query parameters.',
      'Enter a valid GitHub Project URL or positive Project number.',
      'Enter the positive Project number from its GitHub URL, not a PVT_ GraphQL ID.',
      'Project numbers must be positive integers at most 2147483647.',
      'Project 7 was selected more than once.',
      'Issue automation is required by an explicit release or hotfix override. Keep Issues enabled or edit your configuration.',
      'The release workflow must remain enabled because it is fixed by your configuration. Match that choice or edit your configuration.',
      'The hotfix workflow must remain disabled because it is fixed by your configuration. Match that choice or edit your configuration.',
    ];
    for (const message of messages) {
      const copy = validationCopy(message);
      expect(copy).toBeDefined();
      for (const locale of ['es', 'fr', 'pt'] as const) {
        expect(localizedMessage({ tone: 'warning', text: message, copyId: copy!.id, copyValues: copy!.values }, locale))
          .not.toBe(message);
      }
    }
    expect(localizedMessage({ tone: 'warning', text: 'unexpected English diagnostic' }, 'es')).toBe(tr('unknownLocalError', 'es'));
  });

  test('every non-English preview explicitly discloses untranslated setup text', () => {
    for (const locale of setupLocales.filter(item => item !== 'en')) {
      expect(tr('translationPreviewTitle', locale).trim()).not.toBe('');
      expect(tr('translationPreviewBody', locale)).not.toEqual(en.translationPreviewBody);
    }
  });

  test('permission metadata uses translated labels without changing permission identities', () => {
    for (const section of ['names', 'terms'] as const) {
      const keys = Object.keys(permissionTermCatalogs[section].en).sort();
      for (const locale of setupLocales) expect(Object.keys(permissionTermCatalogs[section][locale]).sort()).toEqual(keys);
    }
    for (const locale of setupLocales) {
      for (const term of ['repository', 'organization', 'read', 'write', 'required', 'conditional', 'verified', 'missing', 'unverifiable'] as const) {
        expect(permissionTerm(locale, term).trim()).not.toBe('');
      }
    }
    expect(permissionTerm('es', 'write')).toBe('Escritura');
    expect(permissionTerm('fr', 'unverifiable')).toBe('Non vérifiable');
    expect(permissionStatus('es', 'verified')).toBe('Verificado');
    expect(permissionStatus('es', 'unknown-status')).toBeUndefined();
    for (const locale of setupLocales) {
      for (const name of ['Metadata', 'Contents', 'Secrets', 'Variables', 'Issues', 'Actions', 'Checks', 'Administration', 'Workflows', 'Issue Types', 'Projects', 'Pull requests', 'Members']) {
        expect(permissionName(locale, name).trim()).not.toBe('');
      }
    }
    expect(permissionName('es', 'Checks')).toBe('Comprobaciones');
    expect(permissionName('fr', 'Workflows')).toBe('Flux de travail');
    expect(permissionName('es', 'Unknown')).toBe('Unknown');
  });

  test('static question options have the same keys in every translated catalog', () => {
    const keys = Object.keys(optionCatalogs.es).sort();
    for (const locale of ['fr', 'pt'] as const) {
      expect(Object.keys(optionCatalogs[locale]).sort()).toEqual(keys);
    }
    for (const question of setupQuestionContentInventory()) {
      for (const choice of question.choices ?? []) {
        for (const locale of ['es', 'fr', 'pt'] as const) {
          expect(isQuestionOptionLocalized(question.id, choice, locale)).toBe(true);
        }
      }
    }
    expect(questionOptionLabel('issueWorkflows.enabled', 'feature — Feature', 'fr')).toBe('feature — Fonctionnalité');
    expect(questionOptionLabel('repository.reconciliationCleanup', 'all', 'pt')).toBe('Todos os ramos temporários');
    expect(questionOptionLabel('agents.findings.provider', 'codex', 'es')).toBe('codex');
    expect(isQuestionOptionLocalized('pullRequestApproval.coverage.checkName', 'Coverage from GitHub', 'fr')).toBe(true);
  });

  test('plan review names every agent role in each supported language', () => {
    for (const locale of setupLocales) {
      expect(Object.keys(agentRoleNames[locale]).sort()).toEqual(Object.keys(agentRoleNames.en).sort());
      for (const role of ['planner', 'findings', 'reviewer', 'fixer', 'tester']) {
        expect(agentRoleName(role, locale).trim()).not.toBe('');
      }
    }
    expect(agentRoleName('planner', 'es')).toBe('Planificador');
    expect(agentRoleName('findings', 'fr')).toBe('Analyste des problèmes');
  });

  test('question and plan presenters share the same localized Project Status transition labels', () => {
    expect(Object.keys(projectTransitionKey).sort()).toEqual([
      'issueCreated', 'issueInProgress', 'pullRequestCreated', 'pullRequestInProgress',
    ]);
    for (const locale of setupLocales) {
      for (const key of Object.values(projectTransitionKey)) expect(tr(key, locale).trim()).not.toBe('');
    }
  });

  test('every literal permission reason and condition has exactly one translated key', () => {
    const emitted = new Set<string>();
    for (const source of [
      '../../application/policies/setup_token_permission_policy.ts',
      '../../application/usecases/setup/verify_setup_pat_bootstrap_use_case.ts',
    ]) {
      const path = resolve(__dirname, source);
      const file = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
      const collect = (node: ts.Node): void => {
        if (ts.isStringLiteral(node)) emitted.add(node.text);
        else ts.forEachChild(node, collect);
      };
      const visit = (node: ts.Node): void => {
        if (ts.isPropertyAssignment(node) && ['reason', 'condition'].includes(node.name.getText(file))) collect(node.initializer);
        ts.forEachChild(node, visit);
      };
      visit(file);
    }
    expect([...permissionTexts].sort()).toEqual([...emitted].sort());
    for (const locale of ['es', 'fr', 'pt'] as const) {
      expect(Object.keys(permissionCopyCatalogs[locale]).sort()).toEqual([...permissionTexts].sort());
      for (const text of permissionTexts) {
        expect(isKnownPermissionCopy(text)).toBe(true);
        expect(permissionCopyCatalogs[locale][text].trim()).not.toBe('');
        expect(permissionCopyCatalogs[locale][text]).not.toBe(text);
      }
    }
  });

  test('every prompt has the same translated keys, placeholders and choice count', () => {
    const ids = Object.keys(promptCopyCatalogs.en).sort();
    for (const locale of setupLocales) {
      expect(Object.keys(promptCopyCatalogs[locale]).sort()).toEqual(ids);
      for (const id of ids) {
        const source = promptCopyCatalogs.en[id as keyof typeof promptCopyCatalogs.en];
        const copy = promptCopyCatalogs[locale][id as keyof typeof promptCopyCatalogs.en];
        expect(copy.title.trim()).not.toBe('');
        expect(copy.description.trim()).not.toBe('');
        for (const field of ['title', 'description'] as const) {
          const placeholders = (value: string) => [...value.matchAll(/\{([a-zA-Z]\w*)\}/gu)].map(match => match[1]).sort();
          expect(placeholders(copy[field])).toEqual(placeholders(source[field]));
          if (locale !== 'en') expect(copy[field]).not.toBe(source[field]);
        }
        expect(copy.choices?.length ?? 0).toBe(source.choices?.length ?? 0);
      }
    }
    const prompt = { kind: 'choice' as const, title: 'How will you provide your setup PAT?', choices: ['Guided GitHub link', 'Manual PAT'], copyId: 'setupPat.method' as const };
    expect(localizedPromptChoice(prompt, 'fr', 0)).toBe('Lien GitHub guidé');
    expect(prompt.choices[0]).toBe('Guided GitHub link');
  });

  test('progress and validation messages have identical semantic keys and placeholders', () => {
    const ids = Object.keys(messageCopyCatalogs.en).sort();
    const placeholders = (value: string) => [...value.matchAll(/\{([a-zA-Z]\w*)\}/gu)].map(match => match[1]).sort();
    for (const locale of setupLocales) {
      expect(Object.keys(messageCopyCatalogs[locale]).sort()).toEqual(ids);
      for (const id of ids) {
        const source = messageCopyCatalogs.en[id as keyof typeof messageCopyCatalogs.en];
        const translated = messageCopyCatalogs[locale][id as keyof typeof messageCopyCatalogs.en];
        expect(translated.trim()).not.toBe('');
        expect(placeholders(translated)).toEqual(placeholders(source));
        if (locale !== 'en') expect(translated).not.toBe(source);
      }
    }
    expect(localizedMessage({ tone: 'info', text: 'Plan ready', copyId: 'plan.ready', copyValues: { files: '2', variables: '1', secrets: '3' } }, 'es'))
      .toContain('2 archivos, 1 Variables y 3 nombres');
    const preview = localizedMessage({ tone: 'info', text: 'raw English', copyId: 'permission.preview', copyValues: {
      issues: 'feature|bugfix', approval: 'guarded', secrets: 'repository', variables: 'off', projects: 'none',
    } }, 'es');
    expect(preview).toContain('Funcionalidad, Corrección');
    expect(preview).toContain('Aprobar solo con garantías');
    expect(preview).not.toContain('raw English');
    expect(localizedMessage({ tone: 'warning', text: 'raw English', copyId: 'credential.checks',
      copyValues: { count: '2', names: 'BOT_PAT, API_KEY' }, credentialChecks: [
        { name: 'BOT_PAT', status: 'valid' }, { name: 'API_KEY', status: 'unverifiable' },
      ] }, 'fr')).toContain('API_KEY: Invérifiable sans nouvelle valeur');
  });

  test('local session errors have exact key parity and a translated unknown-error fallback', () => {
    const keys = Object.keys(sessionErrorCatalogs.en).sort();
    for (const locale of setupLocales) {
      expect(Object.keys(sessionErrorCatalogs[locale]).sort()).toEqual(keys);
      for (const key of keys) {
        const value = sessionErrorCatalogs[locale][key as keyof typeof sessionErrorCatalogs.en];
        expect(value.trim()).not.toBe('');
        if (locale !== 'en') expect(value).not.toBe(sessionErrorCatalogs.en[key as keyof typeof sessionErrorCatalogs.en]);
      }
      expect(localizedSessionError('unrecognized server detail', locale)).toBe(tr('unknownLocalError', locale));
    }
    expect(localizedSessionError('Incorrect pairing code. Check the terminal.', 'es').toLowerCase()).toContain('código');
  });

  test('every static HTTP error and final doctor/back failure has reviewed four-language copy', () => {
    const server = readFileSync(resolve(__dirname, '../web_setup_server.ts'), 'utf8');
    const errors = new Set([...server.matchAll(/error:\s*'([^']+)'/gu)].map(match => match[1]));
    for (const extra of ['No earlier question is available here.', 'Read-only verification failed. Check the terminal.',
      'Read-only verification is unavailable or already running.', 'Could not retry discovery.',
      'Could not return to the previous question.', 'Read-only verification failed.']) errors.add(extra);
    for (const error of errors) {
      expect(Object.prototype.hasOwnProperty.call(sessionErrorCatalogs.en, error)).toBe(true);
      for (const locale of ['es', 'fr', 'pt'] as const) {
        expect(localizedSessionError(error, locale)).not.toBe(tr('unknownLocalError', locale));
      }
    }
  });

  test('all current plan warnings have exactly one translation per language', () => {
    const path = resolve(__dirname, '../../application/policies/setup_configuration_plan.ts');
    const file = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
    const emitted = new Set<string>();
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && node.expression.getText(file) === 'warnings.push' && ts.isStringLiteral(node.arguments[0])) {
        emitted.add(node.arguments[0].text);
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
    expect(Object.keys(planWarningCatalogs.en).sort()).toEqual([...emitted].sort());
    for (const locale of setupLocales) {
      expect(Object.keys(planWarningCatalogs[locale]).sort()).toEqual([...emitted].sort());
      for (const warning of emitted) {
        const translated = localizedPlanWarning(warning, locale);
        expect(translated.trim()).not.toBe('');
        if (locale !== 'en') expect(translated).not.toBe(warning);
      }
    }
    expect(localizedPlanWarning('Unreviewed English warning', 'es')).toBe(tr('planUnknownWarning', 'es'));
  });

  test('unknown server-side validation is not mislabeled as a known translated rule', () => {
    expect(validationCopy('A future validation rule.')).toBeUndefined();
  });

  test('localized release and hotfix warnings distinguish installed automation from disabled events', () => {
    const warnings = [
      'Release automation is installed, but release issue events are disabled by the selected issue workflow profile.',
      'Hotfix automation is installed, but hotfix issue events are disabled by the selected issue workflow profile.',
    ];
    const installedPhrases = { en: 'is installed', es: 'ya está instalada', fr: 'est déjà installée', pt: 'já está instalada' } as const;
    for (const locale of setupLocales) {
      for (const warning of warnings) {
        const translated = localizedPlanWarning(warning, locale);
        expect(translated).toContain(installedPhrases[locale]);
        expect(translated).toMatch(/disable|desactiva|désactive|desativa/u);
      }
    }
  });
});
