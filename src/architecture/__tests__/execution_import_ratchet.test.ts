import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

type ExecutionConsumerRole =
    | 'aggregate-construction'
    | 'entrypoint'
    | 'route-contract'
    | 'route-coordinator';

interface ExecutionImportBaseline {
    readonly maximum: number;
    readonly consumers: readonly {
        readonly file: string;
        readonly role: ExecutionConsumerRole;
        readonly justification: string;
    }[];
}

const ALLOWED_ROLES = new Set<ExecutionConsumerRole>([
    'aggregate-construction',
    'entrypoint',
    'route-contract',
    'route-coordinator',
]);
const EXECUTION_CONSUMER_CEILING = 13;

function expectedRole(file: string): ExecutionConsumerRole {
    if (file === 'src/actions/execution_builder.ts' || file === 'src/actions/github_action_execution.ts') {
        return 'aggregate-construction';
    }
    if (file === 'src/application/ports/main_run_route_ports.ts') return 'route-contract';
    if (file.startsWith('src/application/usecases/')) return 'route-coordinator';
    return 'entrypoint';
}

function repositoryPath(repositoryRoot: string, file: string): string {
    return relative(repositoryRoot, file).split(sep).join('/');
}

function resolveAliasedSymbol(checker: ts.TypeChecker, node: ts.Identifier): ts.Symbol | undefined {
    const symbol = checker.getSymbolAtLocation(node);
    if (!symbol) return undefined;
    return symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
}

function findExecutionConsumers(
    program: ts.Program,
    executionFile: string,
    include: (source: ts.SourceFile) => boolean,
): string[] {
    const checker = program.getTypeChecker();
    const executionSource = program.getSourceFile(executionFile);
    const declaration = executionSource?.statements.find(
        (statement): statement is ts.ClassDeclaration => ts.isClassDeclaration(statement)
            && statement.name?.text === 'Execution',
    );
    const executionSymbol = declaration?.name
        ? checker.getSymbolAtLocation(declaration.name)
        : undefined;
    if (!executionSource || !executionSymbol) throw new Error('Could not resolve the Execution model symbol.');

    return program.getSourceFiles()
        .filter(source => !source.isDeclarationFile && source.fileName !== executionSource.fileName)
        .filter(include)
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
        .map(source => source.fileName)
        .sort();
}

describe('Execution import ratchet', () => {
    const repositoryRoot = resolve(__dirname, '../../..');
    const configPath = resolve(repositoryRoot, 'tsconfig.json');
    const executionFile = resolve(repositoryRoot, 'src/data/model/execution.ts');
    const baselinePath = resolve(__dirname, '../execution_import_baseline.json');
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as ExecutionImportBaseline;
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, repositoryRoot);
    const program = ts.createProgram(parsed.fileNames, parsed.options);
    const baselineFiles = baseline.consumers.map(consumer => consumer.file);

    it('uses a deterministic, justified and closed boundary schema', () => {
        expect(config.error).toBeUndefined();
        expect(parsed.errors).toEqual([]);
        expect(baselineFiles).toEqual([...baselineFiles].sort());
        expect(new Set(baselineFiles).size).toBe(baselineFiles.length);
        expect(baseline.maximum).toBe(baseline.consumers.length);
        expect(baseline.maximum).toBeLessThanOrEqual(EXECUTION_CONSUMER_CEILING);
        expect(baseline.consumers.every(consumer => ALLOWED_ROLES.has(consumer.role))).toBe(true);
        expect(baseline.consumers.map(({ file, role }) => ({ file, role }))).toEqual(
            baseline.consumers.map(({ file }) => ({ file, role: expectedRole(file) })),
        );
        expect(baseline.consumers.every(consumer => consumer.justification.trim().length >= 24)).toBe(true);
    });

    it('matches the exact shrinking inventory so consumers cannot grow, move, or disappear silently', () => {
        const currentConsumers = findExecutionConsumers(
            program,
            executionFile,
            source => repositoryPath(repositoryRoot, source.fileName).startsWith('src/'),
        ).map(file => repositoryPath(repositoryRoot, file));

        expect(currentConsumers).toEqual(baselineFiles);
        expect(currentConsumers).toHaveLength(baseline.maximum);
    });

    it('detects renamed imports, re-exports, type aliases and utility-type indirection', () => {
        const fixtureDirectory = mkdtempSync(join(repositoryRoot, '.execution-alias-'));
        const barrelFile = join(fixtureDirectory, 'execution_alias_barrel.ts');
        const fixtureFile = join(fixtureDirectory, 'execution_alias_bypass.ts');
        try {
            const barrel = readFileSync(
                resolve(__dirname, '../__fixtures__/execution_alias_barrel.fixture'),
                'utf8',
            ).split('__EXECUTION_MODULE__').join(executionFile.replace(/\\/g, '/'));
            const fixture = readFileSync(
                resolve(__dirname, '../__fixtures__/execution_alias_bypass.fixture'),
                'utf8',
            ).split('__ALIAS_MODULE__').join(barrelFile.replace(/\\/g, '/'));
            writeFileSync(barrelFile, barrel, 'utf8');
            writeFileSync(fixtureFile, fixture, 'utf8');
            const fixtureProgram = ts.createProgram([...parsed.fileNames, barrelFile, fixtureFile], parsed.options);
            expect(fixtureProgram.getSyntacticDiagnostics()).toEqual([]);
            expect(fixtureProgram.getSemanticDiagnostics()).toEqual([]);
            expect(findExecutionConsumers(
                fixtureProgram,
                executionFile,
                source => source.fileName === barrelFile || source.fileName === fixtureFile,
            )).toEqual([barrelFile, fixtureFile]);
        } finally {
            rmSync(fixtureDirectory, { recursive: true, force: true });
        }
    });

    it('keeps issue and pull-request leaf workflows free of aggregate and credential authority', () => {
        const checker = program.getTypeChecker();
        const executionSource = program.getSourceFile(executionFile);
        const declaration = executionSource?.statements.find(
            (statement): statement is ts.ClassDeclaration => ts.isClassDeclaration(statement)
                && statement.name?.text === 'Execution',
        );
        const executionSymbol = declaration?.name ? checker.getSymbolAtLocation(declaration.name) : undefined;
        if (!executionSymbol) throw new Error('Could not resolve the Execution model symbol.');
        const prefixes = [
            'src/application/usecases/steps/issue/',
            'src/application/usecases/steps/pull_request/',
        ];
        const violations: string[] = [];
        for (const source of program.getSourceFiles()) {
            const path = repositoryPath(repositoryRoot, source.fileName);
            if (!prefixes.some(prefix => path.startsWith(prefix)) || path.includes('/__tests__/')) continue;
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

    it('keeps projected workflow and lifecycle contracts credential- and aggregate-free', () => {
        const contextPaths = new Set([
            'src/application/usecases/issue_workflow_context.ts',
            'src/application/usecases/pull_request_workflow_context.ts',
            'src/application/usecases/actions/lifecycle_synchronization_context.ts',
        ]);
        const forbiddenFields = new Set(['token', 'tokens', 'credential', 'credentials', 'owner', 'repo', 'repository']);
        const forbiddenTypes = new Set(['Execution', 'ExecutionInputs', 'Tokens', 'Labels']);
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
                    if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)
                        && forbiddenTypes.has(node.typeName.text)) {
                        violations.push(`${path}:${statement.name.text}:${node.typeName.text}`);
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
