import { bugbotPatchBindsText } from '../bugbot_patch_binding_policy';

it.each([
    ['@@ -1 +1 @@\n-old\n+new\n', 'old\n', 'new\n', true],
    ['@@ -1 +1 @@\n-old\n+wrong\n', 'old\n', 'new\n', false],
    ['@@ -1 +1 @@\n-wrong\n+new\n', 'old\n', 'new\n', false],
    ['@@ -0,0 +1 @@\n+new\n', '', 'new\n', true],
    ['@@ -1 +0,0 @@\n-old\n', 'old\n', '', true],
    ['@@ -1 +1 @@\n-old\n No newline at end of file\n+new\n', 'old', 'new\n', false],
    ['@@ -1 +1 @@\n-old\n\\ No newline at end of file\n+new\n', 'old', 'new\n', true],
    ['@@ -1 +1 @@\n-old\n+new\n\\ No newline at end of file\n', 'old\n', 'new', true],
    ['@@ -1 +1 @@\n-old\n+new\n', 'old', 'new', false],
    ['@@ -2,0 +3 @@\n+inserted\n', 'one\ntwo\n', 'one\ntwo\ninserted\n', true],
    ['@@ -3 +2,0 @@\n-third\n', 'one\ntwo\nthird\n', 'one\ntwo\n', true],
    ['@@ -2 +2 @@\n-old\n+new\n', 'prefix\nold\ntail\n', 'prefix\nnew\ntail\n', true],
    ['@@ -2 +2 @@\n-old\n+new\n', 'prefix\nold\nforeign\n', 'prefix\nnew\ntail\n', false],
    ['@@ -2 +2 @@\n-old\n+new\n', 'foreign\nold\ntail\n', 'prefix\nnew\ntail\n', false],
    ['@@ -1 +2 @@\n-old\n+new\n', 'old\n', 'prefix\nnew\n', false],
    ['@@ -0 +1 @@\n-old\n+new\n', 'old\n', 'new\n', false],
    ['@@ -1 +0 @@\n-old\n+new\n', 'old\n', 'new\n', false],
    ['@@ -1 +1 @@\n-old\n', 'old\n', 'new\n', false],
    ['@@ -1 +1 @@\n-old\n+new\n+extra\n', 'old\n', 'new\n', false],
    ['@@ -1 +1 @@\n old\n', 'old\n', 'old\n', true],
    ['@@ -1 +1 @@\n old\n\\ No newline at end of file\n', 'old', 'old', true],
    ['bad\n', 'old\n', 'new\n', false],
    ['@@ -1 +1 @@\n-old\n+new\n@@ -1 +1 @@\n-old\n+new\n', 'old\n', 'new\n', false],
] as const)('binds exact immutable text for %s', (patch, oldText, currentText, expected) => {
    expect(bugbotPatchBindsText(patch, oldText, currentText)).toBe(expected);
});

it('rejects a new hunk that would hide incomplete counts from its preceding hunk', () => {
    expect(bugbotPatchBindsText('@@ -1,2 +1,2 @@\n-a\n+b\n@@ -3 +3 @@\n-c\n+d\n', 'a\nc\n', 'b\nd\n')).toBe(false);
});
