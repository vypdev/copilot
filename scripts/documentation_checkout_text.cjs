function normalizeDocumentationPath(value) {
  return String(value).replaceAll('\\', '/');
}

function normalizeDocumentationText(value) {
  return value.replace(/\r\n/g, '\n');
}

module.exports = { normalizeDocumentationPath, normalizeDocumentationText };
