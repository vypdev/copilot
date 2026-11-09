'use strict';

const path = require('node:path').posix;
const ts = require('typescript');

function find(node, test) {
    const matches = [];
    const visit = child => {
        if (test(child)) matches.push(child);
        ts.forEachChild(child, visit);
    };
    visit(node);
    return matches;
}

const one = items => items.length === 1 ? items[0] : undefined;
const enclosing = (node, test) => {
    for (let parent = node.parent; parent; parent = parent.parent) if (test(parent)) return parent;
};
const line = (file, offset) => file.getLineAndCharacterOfPosition(offset).line + 1;
const inside = (file, root) => !root || file === root || file.startsWith(root + '/');

function sourceRoot(file, text, anchorLine) {
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);
    const mappedField = find(source, node => ts.isPropertyAccessExpression(node)
        && line(source, node.getStart()) <= anchorLine && line(source, node.end - 1) >= anchorLine
        && mapCall(enclosing(node, ts.isArrowFunction)?.parent));
    if (!mappedField.length) return;
    let root = path.dirname(file);
    for (const node of source.statements) {
        if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)
            || !/^\.\.?\//u.test(node.moduleSpecifier.text)) continue;
        const target = path.normalize(path.join(path.dirname(file), node.moduleSpecifier.text));
        while (root !== '.' && !inside(target, root)) root = path.dirname(root);
    }
    return root === '.' ? '' : root;
}

function parse(files) {
    const options = { target: ts.ScriptTarget.ES2022, moduleResolution: ts.ModuleResolutionKind.Node10,
        strict: true, types: [], lib: ['lib.es2022.d.ts'] };
    const host = ts.createCompilerHost(options);
    const library = host.getDefaultLibLocation().replace(/\\/gu, '/');
    const libraryFile = file => path.dirname(file) === library && /^lib[.a-z0-9]+\.d\.ts$/u.test(path.basename(file));
    const sourceText = file => files.get(file.slice(1))?.text;
    host.getCurrentDirectory = () => '/';
    host.realpath = file => file;
    host.directoryExists = () => true;
    host.getDirectories = () => [];
    host.fileExists = file => files.has(file.slice(1)) || libraryFile(file) && ts.sys.fileExists(file);
    host.readFile = file => sourceText(file) ?? (libraryFile(file) ? ts.sys.readFile(file) : undefined);
    host.getSourceFile = (file, version) => {
        const text = host.readFile(file);
        return text === undefined ? undefined : ts.createSourceFile(file, text, version, true);
    };
    return ts.createProgram([...files.keys()].map(file => '/' + file), options, host);
}

function mapCall(node) {
    if (node && ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && node.expression.name.text === 'map' && node.arguments.length === 1 && ts.isArrowFunction(node.arguments[0])) {
        return { collection: node.expression.expression, callback: node.arguments[0] };
    }
}

function eventName(span) {
    const template = span.parent;
    const index = template.templateSpans.indexOf(span);
    const preceding = index === 0 ? template.head : template.templateSpans[index - 1].literal;
    return /@([\w-]+)=\s*$/u.exec(preceding.text)?.[1];
}

const returns = block => block && ts.isBlock(block) ? block.statements.filter(ts.isReturnStatement) : [];

function objectProperty(expr, name) {
    return expr && ts.isObjectLiteralExpression(expr)
        ? one(expr.properties.filter(item => item.name?.getText() === name)) : undefined;
}

function follow(files, anchor, request) {
    const program = parse(files);
    const checker = program.getTypeChecker();
    const source = program.getSourceFile('/' + anchor.path);
    if (program.getSyntacticDiagnostics(source).length) return;
    const symbol = node => node && checker.getSymbolAtLocation(node);
    const property = node => ts.isPropertyAccessExpression(node) ? symbol(node.name) : undefined;
    const declaration = node => {
        const binding = symbol(node);
        return binding && (binding.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(binding) : binding).valueDeclaration;
    };
    const initializer = node => node && ts.isVariableDeclaration(node) && (node.parent.flags & ts.NodeFlags.Const)
        ? node.initializer : undefined;
    const output = item => ts.isPropertyAssignment(item) ? item.initializer : ts.isShorthandPropertyAssignment(item) ? item.name : undefined;
    const unfreeze = node => {
        if (!node || !ts.isCallExpression(node) || node.arguments.length !== 1 || !ts.isPropertyAccessExpression(node.expression)
            || node.expression.name.text !== 'freeze') return node;
        const declaration = property(node.expression)?.declarations;
        return declaration?.length && declaration.every(item => program.isSourceFileDefaultLibrary(item.getSourceFile()))
            ? node.arguments[0] : node;
    };
    const fileNodes = program.getRootFileNames().map(file => program.getSourceFile(file));

    const atAnchor = find(source, node => ts.isPropertyAccessExpression(node)
        && line(source, node.getStart()) <= anchor.line && line(source, node.end - 1) >= anchor.line
        && property(node)?.valueDeclaration && ts.isPropertySignature(property(node).valueDeclaration));
    const field = one([...new Set(atAnchor.map(property))]);
    if (!field) return;
    const use = atAnchor[0];
    const method = enclosing(use, ts.isMethodDeclaration);
    const owner = enclosing(use, ts.isClassDeclaration);
    const map = mapCall(enclosing(use, ts.isArrowFunction)?.parent);
    if (!method || !owner || !map || !ts.isPropertyAccessExpression(map.collection)
        || symbol(use.expression) !== symbol(map.callback.parameters[0]?.name)) return;
    const collection = property(map.collection);
    const collectionType = collection?.valueDeclaration?.parent;
    if (!collectionType || !ts.isInterfaceDeclaration(collectionType)) return;

    const handlers = find(method, ts.isTemplateSpan).filter(eventName);
    const inputs = handlers.filter(span => eventName(span) === 'input' && enclosing(span, ts.isArrowFunction) === map.callback);
    const submission = handlers.filter(span => eventName(span) === 'submit').flatMap(span => find(span.expression, ts.isCallExpression).flatMap(call => {
        const handler = ts.isPropertyAccessExpression(call.expression) && declaration(call.expression.name);
        return handler && handler.parent === owner && handler !== method && ts.isMethodDeclaration(handler)
            ? [{ span, handler }] : [];
    }));
    const links = submission.flatMap(({ span, handler }) => find(handler, ts.isCallExpression).flatMap(call => {
        const helper = ts.isIdentifier(call.expression) && declaration(call.expression);
        const loop = enclosing(call, ts.isForOfStatement);
        if (!helper || !ts.isFunctionDeclaration(helper) || !helper.body || helper.parent !== source
            || !loop || property(loop.expression) !== collection || !call.arguments.some(arg => property(arg) === field)) return [];
        return find(call, ts.isElementAccessExpression).flatMap(access => {
            const storage = property(access.expression);
            const key = property(access.argumentExpression);
            if (!storage || !key) return [];
            return inputs.flatMap(input => {
                if (!ts.isArrowFunction(input.expression)) return [];
                const parameter = symbol(input.expression.parameters[0]?.name);
                const writes = find(input.expression, node => ts.isBinaryExpression(node)
                    && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && property(node.left) === storage);
                const keyedWrites = writes.flatMap(write => find(write.right, node => ts.isPropertyAssignment(node)
                    && ts.isComputedPropertyName(node.name) && property(node.name.expression) === key
                    && find(node.initializer, value => ts.isPropertyAccessExpression(value) && value.name.text === 'value'
                        && parameter && find(value.expression, child => ts.isIdentifier(child) && symbol(child) === parameter).length > 0).length > 0));
                return keyedWrites.map(() => ({ span, handler, input, helper }));
            });
        });
    }));
    const link = one(links);
    if (!link) return;
    const parserCalls = find(link.helper, ts.isCallExpression).flatMap(call => {
        if (!ts.isIdentifier(call.expression)) return [];
        const imports = symbol(call.expression)?.declarations ?? [];
        const imported = one(imports.filter(ts.isImportSpecifier));
        const specifier = imported && enclosing(imported, ts.isImportDeclaration)?.moduleSpecifier;
        const parser = declaration(call.expression);
        return specifier && ts.isStringLiteral(specifier) && /^\.\.?\//u.test(specifier.text)
            && parser && ts.isFunctionDeclaration(parser) && parser.body && files.has(parser.getSourceFile().fileName.slice(1))
            ? [{ imported: enclosing(imported, ts.isImportDeclaration), parser, name: call.expression.text }] : [];
    });
    const parserLink = one(parserCalls);
    if (!parserLink) return;
    const parserFile = parserLink.parser.getSourceFile().fileName.slice(1);
    const requested = request.targets.some(target => target.workspace === null && target.match === 'literal'
        && inside(parserFile, target.scope) && target.query.match(/[A-Za-z_$][\w$]*/gu)?.some(name => name === parserLink.name || name === parserLink.parser.name?.text));
    if (!requested) return;

    const producers = fileNodes.flatMap(file => file.statements.filter(node => ts.isFunctionDeclaration(node)
        && node.body && node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
        && node.type && checker.getTypeAtLocation(node.type).symbol === symbol(collectionType.name)));
    const producer = one(producers);
    if (!producer) return { reason: producers.length ? 'ambiguous-decoder' : 'decoder-unresolved' };
    const result = one(returns(producer.body));
    const collectionProp = objectProperty(unfreeze(result?.expression), collection.getName());
    const value = collectionProp && output(collectionProp);
    const collectionMap = mapCall(initializer(declaration(unfreeze(value))));
    const entry = collectionMap && one(returns(collectionMap.callback.body));
    const fieldProp = objectProperty(unfreeze(entry?.expression), field.getName());
    const fieldValue = fieldProp && output(fieldProp);
    const origin = fieldValue && (ts.isShorthandPropertyAssignment(fieldProp)
        ? checker.getShorthandAssignmentValueSymbol(fieldProp)?.valueDeclaration : declaration(fieldValue));
    if (!origin || !initializer(origin) || enclosing(origin, ts.isArrowFunction) !== collectionMap.callback) return;
    if ([parserLink.parser, producer].some(node => program.getSyntacticDiagnostics(node.getSourceFile()).length)) return;

    const inputTemplate = link.input.parent;
    const templateSpans = inputTemplate.templateSpans;
    const literals = [inputTemplate.head, ...templateSpans.slice(0, templateSpans.indexOf(link.input)).map(span => span.literal)];
    const opening = literals.flatMap(part => [...part.getText().matchAll(/<[a-z][\w-]*(?=[\s>])/gu)]
        .map(match => part.getStart() + match.index)).at(-1);
    if (opening === undefined) return;
    const presentation = [parserLink.imported, link.helper, link.handler, link.span, map.collection, use];
    const view = declaration(map.collection.expression);
    if (view && initializer(view) && view.getSourceFile() === source) presentation.push(view);
    const decoderFile = producer.getSourceFile();
    const spans = [
        { file: source, nodes: presentation, ranges: [{ start: line(source, opening), end: line(source, link.input.end - 1) }] },
        { file: parserLink.parser.getSourceFile(), nodes: [parserLink.parser], ranges: [] },
        { file: decoderFile, nodes: [collectionMap.callback.parent.parent, result],
            ranges: [{ start: line(decoderFile, producer.getStart()), end: line(decoderFile, producer.body.getStart()) }] },
    ];
    for (const node of [field.valueDeclaration.parent, collectionType]) {
        const file = node.getSourceFile();
        if (!files.has(file.fileName.slice(1)) || program.getSyntacticDiagnostics(file).length) return;
        const proof = spans.find(item => item.file === file);
        if (proof) proof.nodes.push(node);
        else spans.push({ file, nodes: [node], ranges: [] });
    }
    return { spans };
}

function rangesFor({ file, nodes, ranges }) {
    const ordered = ranges.concat(nodes.map(node => ({ start: line(file, node.getStart()), end: line(file, node.end - 1) })))
        .sort((a, b) => a.start - b.start || a.end - b.end);
    const merged = [];
    for (const range of ordered) {
        const previous = merged.at(-1);
        if (previous && range.start <= previous.end + 1) previous.end = Math.max(previous.end, range.end);
        else merged.push({ ...range });
    }
    return merged;
}

module.exports = { follow, rangesFor, sourceRoot };
