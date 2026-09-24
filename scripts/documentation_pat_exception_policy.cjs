/** Ignore Markdown quote containers while retaining the visible fence/prose line. */
function visibleMarkdownLine(line) {
  const prefix = /^[ \t]*(?:>[ \t]*)*/u.exec(line)[0];
  return {
    content: line.slice(prefix.length),
    quoteDepth: (prefix.match(/>/gu) ?? []).length,
  };
}

/** Only the prose paragraph directly above an exceptional shell block can authorize it. */
function hasAdjacentInspectedPatPrerequisite(source, codeBlockStart) {
  const lines = source.slice(0, codeBlockStart).split(/\r?\n/u);
  const visible = [];
  let fence;
  for (const line of lines) {
    const { content: visibleLine, quoteDepth } = visibleMarkdownLine(line);
    if (fence && quoteDepth < fence.quoteDepth) fence = undefined;
    if (fence) {
      const closing = /^(`+|~+)[ \t]*$/u.exec(visibleLine);
      if (closing && closing[1][0] === fence.marker && closing[1].length >= fence.length) fence = undefined;
      visible.push({ kind: 'code' });
      continue;
    }
    const opening = /^(`{3,}|~{3,})/u.exec(visibleLine);
    if (opening) {
      fence = { marker: opening[1][0], length: opening[1].length, quoteDepth };
      visible.push({ kind: 'code' });
      continue;
    }
    visible.push({ kind: visibleLine.trim() ? 'prose' : 'blank', text: visibleLine });
  }
  if (fence) return false;
  let index = visible.length - 1;
  while (index >= 0 && visible[index].kind === 'blank') index -= 1;
  if (index < 0 || visible[index].kind !== 'prose') return false;
  const paragraph = [];
  while (index >= 0 && visible[index].kind === 'prose') {
    paragraph.unshift(visible[index].text);
    index -= 1;
  }
  const nearestParagraph = paragraph.join(' ').replace(/\s+/gu, ' ');
  return nearestParagraph.includes("inspect the displayed requirements against both PATs' settings")
    && nearestParagraph.includes('Only after confirming every required row');
}

/** Enumerate shell fences at any MDX indentation, without visiting fences inside code. */
function findShellExamples(source) {
  const examples = [];
  let fence;
  let offset = 0;
  for (const rawLine of source.split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    const { content: visibleLine, quoteDepth } = visibleMarkdownLine(line);
    if (fence && quoteDepth < fence.quoteDepth) {
      if (fence.shell) examples.push({ start: fence.start, body: source.slice(fence.bodyStart, offset) });
      fence = undefined;
    }
    if (fence) {
      const closing = /^(`+|~+)[ \t]*$/u.exec(visibleLine);
      if (closing && closing[1][0] === fence.marker && closing[1].length >= fence.length) {
        if (fence.shell) examples.push({ start: fence.start, body: source.slice(fence.bodyStart, offset) });
        fence = undefined;
      }
    } else {
      const opening = /^(`{3,}|~{3,})([^\r\n]*)$/u.exec(visibleLine);
      if (opening) {
        const language = opening[2].trim().split(/\s+/u)[0];
        fence = {
          marker: opening[1][0],
          length: opening[1].length,
          quoteDepth,
          shell: ['bash', 'sh', 'shell'].includes(language),
          start: offset,
          bodyStart: offset + rawLine.length + 1,
        };
      }
    }
    offset += rawLine.length + 1;
  }
  if (fence?.shell) examples.push({ start: fence.start, body: source.slice(fence.bodyStart) });
  return examples;
}

/** Apply the same exception rule to every public source, including the README. */
function publicPatDocumentationSources(readme, docsByFile) {
  return new Map([['README.md', readme], ...docsByFile]);
}

function findUnsafePatShellExamples(sources, acknowledgement) {
  const violations = [];
  for (const [file, source] of sources) {
    for (const example of findShellExamples(source)) {
      if (!example.body.includes(acknowledgement)) continue;
      if (hasAdjacentInspectedPatPrerequisite(source, example.start)) continue;
      violations.push({ file, line: source.slice(0, example.start).split('\n').length });
    }
  }
  return violations;
}

module.exports = {
  hasAdjacentInspectedPatPrerequisite,
  findShellExamples,
  publicPatDocumentationSources,
  findUnsafePatShellExamples,
};
