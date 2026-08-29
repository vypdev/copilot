const { spawnSync } = require('node:child_process');

const buildPaths = ['build/cli', 'build/github_action'];

function runGit(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result.stdout.trim();
}

const modified = runGit(['diff', '--name-only', '--', ...buildPaths]);
const untracked = runGit(['ls-files', '--others', '--exclude-standard', '--', ...buildPaths]);
const differences = [modified, untracked].filter(Boolean).join('\n');

if (differences) {
  console.error('Generated bundles are out of sync. Run `pnpm run build` and commit the resulting build/ changes.');
  console.error(differences);
  process.exit(1);
}

console.log('Generated bundles are synchronized with the checked-in source.');
