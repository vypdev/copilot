import { readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import ts from 'typescript';

interface ExecutionImportBaseline {
    readonly maximum: number;
    readonly files: readonly string[];
}

function repositoryPath(repositoryRoot: string, file: string): string {
    return relative(repositoryRoot, file).split(sep).join('/');
}

function resolveAliasedSymbol(checker: ts.TypeChecker, node: ts.Identifier): ts.Symbol | undefined {
    const symbol = checker.getSymbolAtLocation(node);
    if (!symbol) {
        return undefined;
    }
    return symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
}

describe('Execution import ratchet', () => {
    const repositoryRoot = resolve(__dirname, '../../..');
    const configPath = resolve(repositoryRoot, 'tsconfig.json');
    const baselinePath = resolve(__dirname, '../execution_import_baseline.json');
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as ExecutionImportBaseline;
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, repositoryRoot);
    const program = ts.createProgram(parsed.fileNames, parsed.options);
    const checker = program.getTypeChecker();
    const executionSource = program.getSourceFile(resolve(repositoryRoot, 'src/data/model/execution.ts'));
    const executionDeclaration = executionSource?.statements.find(
        (statement): statement is ts.ClassDeclaration => ts.isClassDeclaration(statement)
            && statement.name?.text === 'Execution',
    );
    const executionSymbol = executionDeclaration?.name
        ? checker.getSymbolAtLocation(executionDeclaration.name)
        : undefined;

    it('starts from a valid, deterministic baseline', () => {
        expect(config.error).toBeUndefined();
        expect(parsed.errors).toEqual([]);
        expect(executionSymbol).toBeDefined();
        expect(baseline.files).toEqual([...baseline.files].sort());
        expect(new Set(baseline.files).size).toBe(baseline.files.length);
        expect(baseline.maximum).toBe(baseline.files.length);
    });

    it('matches the exact shrinking inventory so consumers cannot grow, move, or disappear silently', () => {
        if (!executionSymbol || !executionSource) {
            throw new Error('Could not resolve the Execution model symbol.');
        }

        const currentConsumers = program.getSourceFiles()
            .filter(source => !source.isDeclarationFile && source.fileName !== executionSource.fileName)
            .filter(source => repositoryPath(repositoryRoot, source.fileName).startsWith('src/'))
            .filter((source) => {
                let consumesExecution = false;
                const visit = (node: ts.Node): void => {
                    if (!consumesExecution && ts.isIdentifier(node)
                        && resolveAliasedSymbol(checker, node) === executionSymbol) {
                        consumesExecution = true;
                        return;
                    }
                    ts.forEachChild(node, visit);
                };
                visit(source);
                return consumesExecution;
            })
            .map(source => repositoryPath(repositoryRoot, source.fileName))
            .sort();
        expect(currentConsumers).toEqual(baseline.files);
        expect(currentConsumers).toHaveLength(baseline.maximum);
    });

    it('keeps issue and pull-request leaf workflows free of aggregate and credential authority', () => {
        if (!executionSymbol) throw new Error('Could not resolve the Execution model symbol.');
        const prefixes = [
            'src/application/usecases/steps/issue/',
            'src/application/usecases/steps/pull_request/',
        ];
        const violations: string[] = [];
        for (const source of program.getSourceFiles()) {
            const path = repositoryPath(repositoryRoot, source.fileName);
            if (!prefixes.some((prefix) => path.startsWith(prefix)) || path.includes('/__tests__/')) continue;
            const visit = (node: ts.Node): void => {
                if (ts.isIdentifier(node) && resolveAliasedSymbol(checker, node) === executionSymbol) {
                    violations.push(`${path}:Execution`);
                }
                if (ts.isPropertyAccessExpression(node)
                    && ['token', 'tokens', 'owner', 'repo'].includes(node.name.text)) {
                    violations.push(`${path}:${node.name.text}`);
                }
                if (ts.isIdentifier(node) && node.text === 'invokeExplicit') {
                    violations.push(`${path}:invokeExplicit`);
                }
                ts.forEachChild(node, visit);
            };
            visit(source);
        }
        expect(violations).toEqual([]);
    });

    it('keeps projected issue and pull-request request contracts credential-free', () => {
        const contextPaths = new Set([
            'src/application/usecases/issue_workflow_context.ts',
            'src/application/usecases/pull_request_workflow_context.ts',
        ]);
        const forbiddenFields = new Set(['token', 'tokens', 'credential', 'credentials', 'owner', 'repo', 'repository']);
        const violations: string[] = [];
        for (const source of program.getSourceFiles()) {
            const path = repositoryPath(repositoryRoot, source.fileName);
            if (!contextPaths.has(path)) continue;
            for (const statement of source.statements) {
                if (!ts.isInterfaceDeclaration(statement)
                    || statement.name.text.endsWith('Source')
                    || !/(?:Context|Request|Outcome|Patch)$/u.test(statement.name.text)) continue;
                const visit = (node: ts.Node): void => {
                    if (ts.isPropertySignature(node)) {
                        const name = ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)
                            ? node.name.text
                            : undefined;
                        if (name && forbiddenFields.has(name)) {
                            violations.push(`${path}:${statement.name.text}.${name}`);
                        }
                    }
                    ts.forEachChild(node, visit);
                };
                visit(statement);
            }
        }
        expect(violations).toEqual([]);
    });

    it('keeps push, single-action, and deployment contexts free of repository credentials', () => {
        const contextPaths = new Set([
            'src/application/usecases/push_single_action_contexts.ts',
            'src/application/ports/deployment_orchestration_ports.ts',
        ]);
        const inspectedInterfaces = new Set([
            'DeploymentPublicationContext',
            'ProgressContext',
            'RecommendStepsContext',
            'InactivityContext',
            'BranchObservationContext',
            'UserRequestContext',
            'BranchSyncContext',
            'CommitNotificationContext',
            'ChangeSizeContext',
            'AgentActivityContext',
            'InitialSetupContext',
            'DeploymentOrchestrationContext',
        ]);
        const forbiddenFields = new Set(['token', 'tokens', 'credential', 'credentials']);
        const allowedSensitiveFacts = new Set(['InitialSetupContext.setupCredentials']);
        const visited = new Set<string>();
        const violations: string[] = [];

        for (const source of program.getSourceFiles()) {
            const path = repositoryPath(repositoryRoot, source.fileName);
            if (!contextPaths.has(path)) continue;
            for (const statement of source.statements) {
                if (!ts.isInterfaceDeclaration(statement) || !inspectedInterfaces.has(statement.name.text)) continue;
                visited.add(statement.name.text);
                const visit = (node: ts.Node): void => {
                    if (ts.isPropertySignature(node)) {
                        const name = ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)
                            ? node.name.text
                            : undefined;
                        const key = name ? `${statement.name.text}.${name}` : undefined;
                        if (name && forbiddenFields.has(name) && key && !allowedSensitiveFacts.has(key)) {
                            violations.push(`${path}:${key}`);
                        }
                    }
                    ts.forEachChild(node, visit);
                };
                visit(statement);
            }
        }

        expect([...visited].sort()).toEqual([...inspectedInterfaces].sort());
        expect(violations).toEqual([]);
    });
});
