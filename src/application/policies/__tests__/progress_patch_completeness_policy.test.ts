import { isCompleteProgressPatch as complete } from '../progress_patch_completeness_policy';

describe('complete unified progress patches', () => {
    it.each([
        ['@@ -1 +1 @@\n-old\n+new', 1, 1],
        ['@@ -0,0 +1,2 @@\n+a\n+b', 2, 0],
        ['@@ -1,2 +0,0 @@\n-a\n-b', 0, 2],
        ['@@ -1,2 +1,2 @@ context\n same\n-old\n+new', 1, 1],
        ['@@ -1 +1 @@\n-a\n+b\n\\ No newline at end of file', 1, 1],
        ['@@ -1 +1 @@\n-a\n+b\n', 1, 1],
        ['@@ -1 +1 @@\n-a\n+b\n@@ -8 +8 @@\n-c\n+d', 2, 2],
        ['@@ -1 +1 @@\n-🧪\r\n+é\r', 1, 1],
    ])('admits complete patch %#', (patch, add, remove) => { expect(complete(patch, Number(add), Number(remove))).toBe(true); });
    it.each([
        ['@@ -0,0 +0,0 @@', 0, 0], ['@@ -1 +1 @@\n same', 0, 0], [undefined, 0, 0], ['', 0, 0], [123, 0, 0], ['-old\n+new', 1, 1],
        ['@@ -1 +1 @@\n-a', 1, 1], ['@@ -1 +1 @@\n+b', 1, 1],
        ['@@ -1 +1 @@\n-a\n+b', 2, 1], ['@@ -1 +1 @@\n-a\n+b', 1, 2],
        ['@@ -1 +1 @@\n-a\n+b', 0, 0], ['@@ -1 +1 @@\n-a\n+b\n+c', 2, 1],
        ['@@ -1 +1 @@\n-a\n+b\n-c', 1, 2], ['@@ -1 +1 @@\ninvalid', 1, 1],
        ['@@ -1,2 +1,2 @@\n-a\n+b\n@@ -3 +3 @@\n-c\n+d', 2, 2],
        ['@@ -1,99999999999999999 +1 @@', 0, 0],
        ['@@ -1 +1,99999999999999999 @@', 0, 0],
        ['@@ -1 +1 @@\n same\n extra', 0, 0],
    ])('rejects omitted, malformed or cumulatively truncated patch %#', (patch, add, remove) => { expect(complete(patch, Number(add), Number(remove))).toBe(false); });
});
