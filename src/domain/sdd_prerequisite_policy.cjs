/** Structural prerequisite checks, shared by filesystem and immutable-tree doctor. */
function validateSddPrerequisiteDocuments(standard, template, requiredHeadings) {
  const visibleStandard = visibleMarkdown(standard);
  const visibleTemplate = visibleMarkdown(template);
  return hasNumberedSections(visibleStandard, 8) && /\bMUST\b/u.test(visibleStandard)
    && hasNumberedSections(visibleTemplate, 20)
    && requiredHeadings.every(heading => visibleTemplate.split('\n').some(line => line.startsWith(heading)));
}

function hasNumberedSections(source, count) {
  if (!/^# \S/u.test(source)) return false;
  const headings = [...source.matchAll(/^## ([1-9]\d*)\. [^\n]+$/gmu)];
  return headings.length === count && headings.every((heading, index) => {
    const end = headings[index + 1]?.index ?? source.length;
    return Number(heading[1]) === index + 1
      && /[\p{L}\p{N}]/u.test(source.slice(heading.index + heading[0].length, end));
  });
}

function visibleMarkdown(value) {
  if (typeof value !== 'string') return '';
  let fence;
  return value.replace(/<!--[^]*?(?:-->|$)/gu, '\n').replace(/\r\n/gu, '\n').split('\n').map(line => {
    const boundary = /^ {0,3}(`{3,}|~{3,})/u.exec(line);
    if (boundary) {
      if (!fence) fence = boundary[1];
      else if (boundary[1][0] === fence[0] && boundary[1].length >= fence.length) fence = undefined;
      return '';
    }
    return fence ? '' : line;
  }).join('\n');
}

module.exports = { validateSddPrerequisiteDocuments };
