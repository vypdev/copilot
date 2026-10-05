const yaml = require('js-yaml');

function hasValidMdxFrontmatter(content) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  if (!match) return false;
  try {
    const metadata = yaml.load(match[1]);
    return typeof metadata?.title === 'string' && metadata.title.trim().length > 0;
  } catch {
    return false;
  }
}

module.exports = { hasValidMdxFrontmatter };
