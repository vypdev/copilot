import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getGitRepositoryRoot, isGitRepositoryRoot } from '../cli_context';

describe('canonical checkout root for setup plans', () => {
  test('repository-relative files resolve from the root even when launched in a child directory', () => {
    const checkout = mkdtempSync(join(tmpdir(), 'copilot-setup-root-test-'));
    try {
      execFileSync('git', ['init', '-q', checkout]);
      const child = join(checkout, 'nested');
      mkdirSync(child);
      expect(getGitRepositoryRoot(child)).toBe(getGitRepositoryRoot(checkout));
      expect(isGitRepositoryRoot(child)).toBe(false);
      expect(isGitRepositoryRoot(checkout)).toBe(true);
    } finally {
      rmSync(checkout, { recursive: true, force: true });
    }
  });

  test('an unrelated directory has no checkout root', () => {
    const outside = mkdtempSync(join(tmpdir(), 'copilot-not-a-checkout-'));
    try {
      expect(() => getGitRepositoryRoot(outside)).toThrow();
      expect(isGitRepositoryRoot(outside)).toBe(false);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
