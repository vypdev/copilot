const {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} = require('node:fs');
const { dirname, isAbsolute, join, relative, resolve, sep } = require('node:path');

const repositoryRoot = resolve(__dirname, '..');
const bundlePaths = ['github_action', 'cli', 'api']
  .map(bundle => join(repositoryRoot, 'build', bundle, 'index.js'));

for (const bundlePath of bundlePaths) {
  const source = readFileSync(bundlePath, 'utf8');
  const normalized = source.replace(/[\t ]+$/gmu, '');
  if (normalized !== source) writeFileSync(bundlePath, normalized);
}

// The action and CLI packages publish only their bundled entry points. ncc also
// emits declaration trees for them, but those trees are neither part of the npm
// package nor stable across cold and warm compiler runs. Keeping them in git
// makes an otherwise identical build fail validation on a clean CI runner.
for (const bundle of ['github_action', 'cli']) {
  const bundleRoot = join(repositoryRoot, 'build', bundle);
  for (const entry of readdirSync(bundleRoot, { withFileTypes: true })) {
    if (entry.name === 'index.js') continue;
    const generatedPath = join(bundleRoot, entry.name);
    if (!isInside(bundleRoot, generatedPath)) {
      throw new Error(`Refusing to remove unexpected generated path: ${generatedPath}`);
    }
    rmSync(generatedPath, { recursive: true, force: true });
  }
}

const apiDeclarationRoot = join(repositoryRoot, 'build', 'api', 'src');
const apiEntryDeclaration = join(apiDeclarationRoot, 'api.d.ts');
const requiredDeclarations = collectRequiredDeclarations(apiEntryDeclaration);
const allDeclarations = listFiles(apiDeclarationRoot).filter(file => file.endsWith('.d.ts'));
for (const declaration of allDeclarations) {
  if (!requiredDeclarations.has(declaration)) unlinkSync(declaration);
}
removeEmptyDirectories(apiDeclarationRoot);

function collectRequiredDeclarations(entryFile) {
  const required = new Set();
  const pending = [entryFile];
  while (pending.length > 0) {
    const declaration = pending.pop();
    if (!declaration || required.has(declaration)) continue;
    if (!isInside(apiDeclarationRoot, declaration) || !existsSync(declaration)) {
      throw new Error(`Generated API declaration is missing: ${relative(repositoryRoot, declaration)}.`);
    }
    required.add(declaration);
    for (const specifier of relativeDeclarationSpecifiers(readFileSync(declaration, 'utf8'))) {
      const dependency = resolveDeclaration(declaration, specifier);
      if (!dependency) {
        throw new Error(`Cannot resolve declaration ${specifier} from ${relative(repositoryRoot, declaration)}.`);
      }
      pending.push(dependency);
    }
  }
  return required;
}

function relativeDeclarationSpecifiers(source) {
  const specifiers = new Set();
  const patterns = [
    /\b(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/gu,
    /<reference\s+path=['"]([^'"]+)['"]/gu,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]?.startsWith('.')) specifiers.add(match[1]);
    }
  }
  return specifiers;
}

function resolveDeclaration(importer, specifier) {
  const base = resolve(dirname(importer), specifier.replace(/\.(?:js|ts)$/u, ''));
  const candidates = [`${base}.d.ts`, join(base, 'index.d.ts')];
  return candidates.find(candidate => isInside(apiDeclarationRoot, candidate) && isFile(candidate));
}

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

function removeEmptyDirectories(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) removeEmptyDirectories(join(directory, entry.name));
  }
  if (directory !== apiDeclarationRoot && readdirSync(directory).length === 0) rmdirSync(directory);
}

function isFile(path) {
  return existsSync(path) && statSync(path).isFile();
}

function isInside(root, path) {
  const child = relative(root, path);
  return child !== '' && child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child);
}
