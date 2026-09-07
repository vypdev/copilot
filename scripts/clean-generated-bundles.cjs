#!/usr/bin/env node

const { rmSync } = require('node:fs');
const { dirname, join, relative, resolve, sep } = require('node:path');

const repositoryRoot = resolve(__dirname, '..');
const buildRoot = join(repositoryRoot, 'build');
const generatedBundles = ['github_action', 'cli', 'api']
  .map(bundle => join(buildRoot, bundle));

for (const bundlePath of generatedBundles) {
  const parent = dirname(bundlePath);
  const child = relative(buildRoot, bundlePath);
  if (parent !== buildRoot || !child || child === '..' || child.startsWith(`..${sep}`)) {
    throw new Error(`Refusing to clean unexpected generated bundle path: ${bundlePath}`);
  }
  rmSync(bundlePath, { recursive: true, force: true });
}
