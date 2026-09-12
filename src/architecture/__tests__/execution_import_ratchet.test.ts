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
});
