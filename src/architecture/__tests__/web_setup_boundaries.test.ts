import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import ts from 'typescript';

const root = resolve(__dirname, '..', '..', '..');

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sources(path) : entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

function browserSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? browserSources(path) : /\.(svelte|ts)$/.test(entry.name) ? [path] : [];
  });
}

function moduleImports(path: string, text = readFileSync(path, 'utf8')): Array<{ specifier: string; typeOnly: boolean }> {
  const raw = text;
  const source = path.endsWith('.svelte')
    ? [...raw.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]).join('\n')
    : raw;
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const dependencies: Array<{ specifier: string; typeOnly: boolean }> = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const named = node.importClause?.namedBindings;
      dependencies.push({ specifier: node.moduleSpecifier.text,
        typeOnly: node.importClause?.isTypeOnly === true || (named && ts.isNamedImports(named)
          && named.elements.length > 0 && named.elements.every(element => element.isTypeOnly)) === true });
      return;
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const named = node.exportClause;
      dependencies.push({ specifier: node.moduleSpecifier.text,
        typeOnly: node.isTypeOnly || (named && ts.isNamedExports(named)
          && named.elements.length > 0 && named.elements.every(element => element.isTypeOnly)) === true });
      return;
    }
    if (ts.isCallExpression(node) && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])
      && ((ts.isIdentifier(node.expression) && node.expression.text === 'require')
        || node.expression.kind === ts.SyntaxKind.ImportKeyword)) {
      dependencies.push({ specifier: node.arguments[0].text, typeOnly: false });
    }
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)
      && ts.isStringLiteral(node.argument.literal)) {
      dependencies.push({ specifier: node.argument.literal.text, typeOnly: true });
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return dependencies;
}

function localModule(from: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  const base = resolve(dirname(from), specifier);
  return [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.svelte`, join(base, 'index.ts')]
    .find(candidate => existsSync(candidate));
}

describe('local web setup architecture', () => {
  test('dependency reader includes re-exports, require, dynamic import and type-only forms', () => {
    expect(moduleImports('fixture.ts', `
      import { type Input } from './types';
      export * from './runtime';
      export { Adapter } from './adapter';
      export type { Contract } from './contract';
      export { type View } from './view';
      const runtime = require('./commonjs');
      const later = import('./lazy');
      type LazyType = import('./type-import').Shape;
    `)).toEqual([
      { specifier: './types', typeOnly: true },
      { specifier: './runtime', typeOnly: false },
      { specifier: './adapter', typeOnly: false },
      { specifier: './contract', typeOnly: true },
      { specifier: './view', typeOnly: true },
      { specifier: './commonjs', typeOnly: false },
      { specifier: './lazy', typeOnly: false },
      { specifier: './type-import', typeOnly: true },
    ]);
  });
  test('browser imports only redacted application contracts, as types, across the actual dependency graph', () => {
    const browser = join(root, 'web', 'src');
    const contract = join(root, 'src', 'application', 'contracts', 'web_setup_view');
    for (const path of browserSources(browser)) {
      for (const imported of moduleImports(path)) {
        const target = imported.specifier.startsWith('.') ? resolve(dirname(path), imported.specifier) : '';
        if (target.startsWith(`${join(root, 'src')}${sep}`)) {
          expect(imported.typeOnly).toBe(true);
          expect(target).toBe(contract);
        }
        if (path.includes(`${sep}components${sep}`) || path.includes(`${sep}lib${sep}`)) {
          expect(target).not.toContain(`${sep}session${sep}`);
        }
      }
    }
  });

  test('new setup application decisions have no transitive path to CLI, infrastructure, or browser adapters', () => {
    const useCases = ['prepare_setup_pat_intent_use_case', 'verify_setup_pat_bootstrap_use_case',
      'audit_configured_setup_pat_use_case', 'verify_web_setup_apply_use_case', 'setup_session_coordinator', 'manage_setup_use_case']
      .map(name => join(root, 'src', 'application', 'usecases', 'setup', `${name}.ts`));
    const visited = new Set<string>();
    const traverse = (path: string): void => {
      if (visited.has(path)) return;
      visited.add(path);
      for (const imported of moduleImports(path)) {
        const target = localModule(path, imported.specifier);
        if (!target) continue;
        for (const forbidden of ['cli', 'infrastructure', 'actions', 'web']) {
          expect(target.startsWith(`${join(root, 'src', forbidden)}${sep}`) || target.startsWith(`${join(root, forbidden)}${sep}`)).toBe(false);
        }
        traverse(target);
      }
    };
    for (const entry of useCases) traverse(entry);
    expect(visited.size).toBeGreaterThan(useCases.length);
    const command = readFileSync(join(root, 'src', 'cli', 'commands', 'setup.ts'), 'utf8');
    const execution = readFileSync(join(root, 'src', 'cli', 'commands', 'setup_execution.ts'), 'utf8');
    expect(command).toContain('.action(executeSetupCommand)');
    expect(command.split('\n').length).toBeLessThanOrEqual(65);
    expect(execution).toContain('new SetupSessionCoordinator(');
    expect(execution).not.toMatch(/journey\?\.finish\('complete'\)|journey\?\.finish\('partial'\)/);
  });
  test('domain and application never import browser, HTTP server, or terminal adapters', () => {
    for (const path of [...sources(join(root, 'src', 'domain')), ...sources(join(root, 'src', 'application'))]) {
      const text = readFileSync(path, 'utf8');
      expect(text).not.toMatch(/from ['"](?:svelte|vite|node:http|node:child_process|.*(?:web_setup_server|web_setup_adapters|setup_terminal_driver|setup_question_renderer))['"]/);
    }
  });

  test('browser presenters cannot acquire transport, provider, or persistent-secret responsibilities', () => {
    const browser = join(root, 'web', 'src');
    for (const path of browserSources(browser)) {
      const ui = readFileSync(path, 'utf8');
      expect(ui).not.toMatch(/setup_token_permission_policy|github_identity|runLocalAction|setup_credentials_use_case|localStorage|sessionStorage/);
      if (!path.endsWith(join('session', 'setupSession.ts'))) {
        expect(ui).not.toMatch(/\bfetch\s*\(|\/api\/|X-Setup-Capability/);
      }
      if (path.endsWith('.svelte')) {
        expect(ui).not.toMatch(/from ['"](?:node:|.*(?:infrastructure|cli\/commands|cli\/web_setup_server))/);
      }
    }
    expect(readFileSync(join(browser, 'App.svelte'), 'utf8')).toContain('createSetupSession');
    expect(readFileSync(join(browser, 'App.svelte'), 'utf8')).toContain('void session.poll()');
    expect(readFileSync(join(browser, 'App.svelte'), 'utf8')).toContain('promptRevision={$session.view.promptRevision!}');
    expect(readFileSync(join(browser, 'components', 'PromptCard.svelte'), 'utf8')).toContain('CredentialPrompt');
    expect(readFileSync(join(browser, 'components', 'PromptCard.svelte'), 'utf8')).toContain('{#key promptRevision}');
  });

  test('page shell and presenters remain small and styles have one explicit entrypoint', () => {
    const browser = join(root, 'web', 'src');
    expect(readFileSync(join(browser, 'App.svelte'), 'utf8').split('\n').length).toBeLessThanOrEqual(100);
    expect(readFileSync(join(browser, 'session', 'setupSession.ts'), 'utf8').split('\n').length).toBeLessThanOrEqual(180);
    for (const path of browserSources(join(browser, 'components'))) {
      expect(readFileSync(path, 'utf8').split('\n').length).toBeLessThanOrEqual(90);
    }
    const css = readFileSync(join(browser, 'style.css'), 'utf8');
    for (const layer of ['tokens', 'foundation', 'layout', 'controls', 'feedback', 'responsive']) {
      expect(css).toContain(`@import './styles/${layer}.css'`);
    }
  });
});

test('configuration management modules remain bounded', () => {
 for (const file of ['src/cli/setup_management_adapter.ts','src/infrastructure/setup_management_workspace_adapter.ts','src/application/usecases/setup/manage_setup_use_case.ts','src/application/policies/setup_management_policy.ts','src/application/policies/setup_quick_settings_policy.ts']) expect(readFileSync(join(root,file),'utf8').split('\n').length).toBeLessThanOrEqual(220);
});
