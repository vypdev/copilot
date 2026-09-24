/** Only the prose paragraph directly above an exceptional shell block can authorize it. */
function hasAdjacentInspectedPatPrerequisite(source, codeBlockStart) {
  const lines = source.slice(0, codeBlockStart).split(/\r?\n/u);
  const visible = [];
  let fence;
  for (const line of lines) {
    if (fence) {
      const closing = /^ {0,3}(`+|~+)[ \t]*$/u.exec(line);
      if (closing && closing[1][0] === fence.marker && closing[1].length >= fence.length) fence = undefined;
      visible.push({ kind: 'code' });
      continue;
    }
    const opening = /^ {0,3}(`{3,}|~{3,})/u.exec(line);
    if (opening) {
      fence = { marker: opening[1][0], length: opening[1].length };
      visible.push({ kind: 'code' });
      continue;
    }
    visible.push({ kind: line.trim() ? 'prose' : 'blank', text: line });
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

module.exports = { hasAdjacentInspectedPatPrerequisite };
