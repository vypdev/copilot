// Pure, language-neutral policy shared by local validation and read-only doctor.
const EVIDENCE_FIELDS = new Set(['entrypoints', 'code', 'tests', 'documentation']);

function isSafeRelativePath(value) {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
    && !/[\\:*?"<>|\p{Cc}]/u.test(value)
    && value.split('/').every(segment => segment !== '' && segment !== '.'
      && segment !== '..' && segment.toLowerCase() !== '.git');
}

function matchesFieldBoundary(field, value) {
  if (!isSafeRelativePath(value)) return false;
  if (field === 'specs') return /^specs\/(?!README\.md$|_template\.md$|CATALOG\.md$).+\.md$/u.test(value);
  if (field === 'workflows') return /^(?:\.github|setup)\/workflows\/.+\.ya?ml$/u.test(value);
  // Authors declare semantic roles; folder names and extensions cannot prove them.
  return EVIDENCE_FIELDS.has(field);
}

module.exports = { isSafeRelativePath, matchesFieldBoundary };
