import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

function repositoryPath(repositoryRoot: string, file: string): string {
    return relative(repositoryRoot, file).split(sep).join('/');
}

function resolvedSymbol(checker: ts.TypeChecker, node: ts.Node): ts.Symbol | undefined {
    const symbol = checker.getSymbolAtLocation(node);
    if (!symbol) return undefined;
    return symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
}

function containsTaintedValue(
    node: ts.Node,
    taintedSymbols: ReadonlySet<ts.Symbol>,
    checker: ts.TypeChecker,
    sanitizerSymbols: ReadonlySet<ts.Symbol>,
): boolean {
    let matches = false;
    const visit = (child: ts.Node): void => {
        if (matches) return;
        if (ts.isCallExpression(child)
            && sanitizerSymbols.has(resolvedSymbol(checker, child.expression) as ts.Symbol)) return;
        if (ts.isIdentifier(child)) {
            const symbol = checker.getSymbolAtLocation(child);
            if (symbol && taintedSymbols.has(symbol)) {
                matches = true;
                return;
            }
        }
        ts.forEachChild(child, visit);
    };
    visit(node);
    return matches;
}

function collectCatchTaint(
    clause: ts.CatchClause,
    caughtSymbol: ts.Symbol,
    checker: ts.TypeChecker,
    sanitizerSymbols: ReadonlySet<ts.Symbol>,
): ReadonlySet<ts.Symbol> {
    const tainted = new Set<ts.Symbol>([caughtSymbol]);
    let changed = true;
    while (changed) {
        changed = false;
        const visit = (node: ts.Node): void => {
            const assignment = localAssignment(node);
            if (assignment && containsTaintedValue(assignment.value, tainted, checker, sanitizerSymbols)) {
                const symbol = checker.getSymbolAtLocation(assignment.identifier);
                if (symbol && !tainted.has(symbol)) {
                    tainted.add(symbol);
                    changed = true;
                }
            }
            ts.forEachChild(node, visit);
        };
        visit(clause.block);
    }
    return tainted;
}

function localAssignment(node: ts.Node): {
    readonly identifier: ts.Identifier;
    readonly value: ts.Expression;
} | undefined {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        return { identifier: node.name, value: node.initializer };
    }
    if (ts.isBinaryExpression(node)
        && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
        && ts.isIdentifier(node.left)) {
        return { identifier: node.left, value: node.right };
    }
    return undefined;
}

function isConsoleLoggingCall(expression: ts.Expression): boolean {
    return ts.isPropertyAccessExpression(expression)
        && ts.isIdentifier(expression.expression)
        && expression.expression.text === 'console'
        && ['debug', 'error', 'info', 'log', 'warn'].includes(expression.name.text);
}

function isLoggingCall(
    call: ts.CallExpression,
    loggingSymbols: ReadonlySet<ts.Symbol>,
    checker: ts.TypeChecker,
): boolean {
    return loggingSymbols.has(resolvedSymbol(checker, call.expression) as ts.Symbol)
        || isConsoleLoggingCall(call.expression);
}

interface LoggingAnalysisContext {
    readonly checker: ts.TypeChecker;
    readonly loggingSymbols: ReadonlySet<ts.Symbol>;
    readonly repositoryRoot: string;
    readonly sanitizerSymbols: ReadonlySet<ts.Symbol>;
}

function catchLoggingViolations(
    clause: ts.CatchClause,
    caughtSymbol: ts.Symbol,
    source: ts.SourceFile,
    context: LoggingAnalysisContext,
): string[] {
    const violations: string[] = [];
    const taintedSymbols = collectCatchTaint(
        clause,
        caughtSymbol,
        context.checker,
        context.sanitizerSymbols,
    );
    const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node)
            && isLoggingCall(node, context.loggingSymbols, context.checker)
            && node.arguments.some(argument => containsTaintedValue(
                argument,
                taintedSymbols,
                context.checker,
                context.sanitizerSymbols,
            ))) {
            const position = source.getLineAndCharacterOfPosition(node.getStart(source));
            violations.push(`${repositoryPath(context.repositoryRoot, source.fileName)}:${position.line + 1}`);
        }
        ts.forEachChild(node, visit);
    };
    visit(clause.block);
    return violations;
}

function functionSymbols(
    source: ts.SourceFile | undefined,
    checker: ts.TypeChecker,
    matches: (name: string) => boolean,
): ReadonlySet<ts.Symbol> {
    return new Set((source?.statements ?? [])
        .flatMap(statement => ts.isFunctionDeclaration(statement)
            && statement.name
            && matches(statement.name.text)
            ? [checker.getSymbolAtLocation(statement.name)]
            : [])
        .filter((symbol): symbol is ts.Symbol => symbol !== undefined));
}

function loggingAnalysisContext(
    program: ts.Program,
    repositoryRoot: string,
): LoggingAnalysisContext {
    const checker = program.getTypeChecker();
    const loggingSources = [
        program.getSourceFile(resolve(repositoryRoot, 'src/application/ports/logging_ports.ts')),
        program.getSourceFile(resolve(repositoryRoot, 'src/utils/logger.ts')),
    ];
    const loggingSymbols = new Set(loggingSources.flatMap(source => [
        ...functionSymbols(source, checker, name => name.startsWith('log')),
    ]));
    const errorMapperSource = program.getSourceFile(
        resolve(repositoryRoot, 'src/application/errors/application_error.ts'),
    );
    return {
        checker,
        loggingSymbols,
        repositoryRoot,
        sanitizerSymbols: functionSymbols(
            errorMapperSource,
            checker,
            name => name === 'toApplicationError',
        ),
    };
}

function caughtError(
    node: ts.Node,
    checker: ts.TypeChecker,
): { readonly clause: ts.CatchClause; readonly symbol: ts.Symbol } | undefined {
    if (!ts.isCatchClause(node)) return undefined;
    const caughtName = node.variableDeclaration?.name;
    if (!caughtName || !ts.isIdentifier(caughtName)) return undefined;
    const symbol = checker.getSymbolAtLocation(caughtName);
    return symbol ? { clause: node, symbol } : undefined;
}

function sourceLoggingViolations(
    source: ts.SourceFile,
    context: LoggingAnalysisContext,
): string[] {
    const violations: string[] = [];
    const visit = (node: ts.Node): void => {
        const caught = caughtError(node, context.checker);
        if (caught) {
            violations.push(...catchLoggingViolations(caught.clause, caught.symbol, source, context));
            return;
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
    return violations;
}

function rawErrorLoggingViolations(
    program: ts.Program,
    repositoryRoot: string,
    include: (source: ts.SourceFile) => boolean,
): string[] {
    const context = loggingAnalysisContext(program, repositoryRoot);
    return program.getSourceFiles()
        .filter(source => !source.isDeclarationFile && include(source))
        .flatMap(source => sourceLoggingViolations(source, context));
}

describe('raw error logging boundaries', () => {
    const repositoryRoot = resolve(__dirname, '../../..');
    const config = ts.readConfigFile(resolve(repositoryRoot, 'tsconfig.json'), ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, repositoryRoot);
    const program = ts.createProgram(parsed.fileNames, parsed.options);

    it('never passes direct or locally derived caught values into application logging', () => {
        expect(rawErrorLoggingViolations(
            program,
            repositoryRoot,
            source => repositoryPath(repositoryRoot, source.fileName).startsWith('src/'),
        )).toEqual([]);
    });

    it.each([
        ['direct', 'logError(error);'],
        ['interpolated', 'logError(`failed: ${error}`);'],
        ['declared alias', 'const message = error instanceof Error ? error.message : String(error); logError(message);'],
        ['assigned alias', "let message = 'fixed'; message = String(error); logError(message);"],
        ['console alias', 'const message = String(error); console.error(message);'],
    ])('detects a %s caught-value flow', (_name, statement) => {
        expect(analyzeFixture(statement)).toHaveLength(1);
    });

    it('allows a caught value only after semantic error mapping', () => {
        expect(analyzeFixture(
            "const semanticError = toApplicationError(error, 'unexpected', 'Operation failed.'); logError(semanticError);",
        )).toEqual([]);
    });

    function analyzeFixture(statement: string): string[] {
        const fixtureDirectory = mkdtempSync(join(tmpdir(), 'copilot-error-taint-'));
        const fixtureFile = join(fixtureDirectory, 'raw_error_fixture.ts');
        try {
            const loggingModule = resolve(repositoryRoot, 'src/application/ports/logging_ports').replace(/\\/g, '/');
            const errorModule = resolve(repositoryRoot, 'src/application/errors/application_error').replace(/\\/g, '/');
            writeFileSync(fixtureFile, [
                `import { logError } from '${loggingModule}';`,
                `import { toApplicationError } from '${errorModule}';`,
                'export function fixture(): void {',
                '  try { throw new Error("secret"); } catch (error) {',
                `    ${statement}`,
                '  }',
                '}',
            ].join('\n'), 'utf8');
            const fixtureProgram = ts.createProgram([...parsed.fileNames, fixtureFile], parsed.options);
            return rawErrorLoggingViolations(
                fixtureProgram,
                repositoryRoot,
                source => source.fileName === fixtureFile,
            );
        } finally {
            rmSync(fixtureDirectory, { recursive: true, force: true });
        }
    }
});
