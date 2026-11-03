import type { GitPushDenial } from '../domain/git_push_failure';
export const GIT_PUSH_DIAGNOSTIC_BYTES = 8_192;
/** Bounded suffix keeps the terminal remote rejection after progress output. */
export function captureGitPushDiagnostic(): { readonly stderr: (data: Buffer) => void; readonly classify: () => GitPushDenial } {
  let tail = Buffer.alloc(0);
  return {
    stderr: data => {
      const part = data.subarray(Math.max(0, data.length - GIT_PUSH_DIAGNOSTIC_BYTES));
      tail = Buffer.concat([tail.subarray(Math.max(0, tail.length - (GIT_PUSH_DIAGNOSTIC_BYTES - part.length))), part]);
    },
    classify: () => {
      const text = tail.toString('utf8').replace(/[`'"]/gu, '');
      // Path presence, arbitrary exception text and generic authorization errors are not scope proof.
      return /refusing to allow (?:a Personal Access Token|an OAuth App|a GitHub App) to (?:create or update|create|update) workflow\b[^\r\n]*\bwithout (?:workflow scope|workflows permission)\b/iu.test(text)
        ? 'workflow-write-required' : 'unclassified';
    },
  };
}
