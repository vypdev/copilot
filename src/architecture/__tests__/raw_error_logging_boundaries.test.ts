import { relative, resolve, sep } from 'node:path';
import ts from 'typescript';

function repositoryPath(repositoryRoot: string, file: string): string {
    return relative(repositoryRoot, file).split(sep).join('/');
}

function resolvedSymbol(checker: ts.TypeChecker, node: ts.Node): ts.Symbol | undefined {
    const symbol = checker.getSymbolAtLocation(node);
    if (!symbol) return undefined;
    return symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
}

function containsUnsanitizedCaughtValue(
    node: ts.Node,
    symbol: ts.Symbol,
    checker: ts.TypeChecker,
    sanitizerSymbols: ReadonlySet<ts.Symbol>,
): boolean {
    let matches = false;
    const visit = (child: ts.Node): void => {
        if (matches) return;
        if (ts.isCallExpression(child)
            && sanitizerSymbols.has(resolvedSymbol(checker, child.expression) as ts.Symbol)) {
            return;
        }
        if (ts.isIdentifier(child) && checker.getSymbolAtLocation(child) === symbol) {
            matches = true;
            return;
        }
        ts.forEachChild(child, visit);
    };
    visit(node);
    return matches;
}

describe('raw error logging boundaries', () => {
    const repositoryRoot = resolve(__dirname, '../../..');
    const config = ts.readConfigFile(resolve(repositoryRoot, 'tsconfig.json'), ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, repositoryRoot);
    const program = ts.createProgram(parsed.fileNames, parsed.options);
    const checker = program.getTypeChecker();
    const loggingSources = [
        program.getSourceFile(resolve(repositoryRoot, 'src/application/ports/logging_ports.ts')),
        program.getSourceFile(resolve(repositoryRoot, 'src/utils/logger.ts')),
    ];
    const loggingSymbols = new Set(loggingSources.flatMap(source => [...(source?.statements ?? [])])
        .flatMap((statement) => ts.isFunctionDeclaration(statement)
            && statement.name
            && statement.name.text.startsWith('log')
            ? [checker.getSymbolAtLocation(statement.name)]
            : [])
        .filter((symbol): symbol is ts.Symbol => symbol !== undefined));
    const errorMapperSource = program.getSourceFile(
        resolve(repositoryRoot, 'src/application/errors/application_error.ts'),
    );
    const sanitizerSymbols = new Set((errorMapperSource?.statements ?? [])
        .flatMap(statement => ts.isFunctionDeclaration(statement)
            && statement.name?.text === 'toApplicationError'
            ? [checker.getSymbolAtLocation(statement.name)]
            : [])
        .filter((symbol): symbol is ts.Symbol => symbol !== undefined));

    it('never passes a caught value into application logging, including through interpolation or metadata', () => {
        const violations: string[] = [];

        for (const source of program.getSourceFiles()) {
            const sourcePath = repositoryPath(repositoryRoot, source.fileName);
            if (source.isDeclarationFile || !sourcePath.startsWith('src/')) continue;
            const visit = (node: ts.Node): void => {
                if (ts.isCatchClause(node) && node.variableDeclaration?.name
                    && ts.isIdentifier(node.variableDeclaration.name)) {
                    const caughtSymbol = checker.getSymbolAtLocation(node.variableDeclaration.name);
                    if (caughtSymbol) {
                        const inspectCatch = (child: ts.Node): void => {
                            if (ts.isCallExpression(child)
                                && loggingSymbols.has(resolvedSymbol(checker, child.expression) as ts.Symbol)
                                && child.arguments.some(argument => containsUnsanitizedCaughtValue(
                                    argument,
                                    caughtSymbol,
                                    checker,
                                    sanitizerSymbols,
                                ))) {
                                const position = source.getLineAndCharacterOfPosition(child.getStart(source));
                                violations.push(`${sourcePath}:${position.line + 1}`);
                            }
                            ts.forEachChild(child, inspectCatch);
                        };
                        inspectCatch(node.block);
                    }
                    return;
                }
                ts.forEachChild(node, visit);
            };
            visit(source);
        }

        expect(violations).toEqual([]);
    });
});
