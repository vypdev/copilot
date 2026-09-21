/** Only the prose paragraph directly above an exceptional shell block can authorize it. */
function hasAdjacentInspectedPatPrerequisite(source, codeBlockStart) {
  const nearestParagraph = source.slice(0, codeBlockStart).trimEnd()
    .split(/\n\s*\n/u).at(-1)?.replace(/\s+/g, ' ') ?? '';
  return nearestParagraph.includes("inspect the displayed requirements against both PATs' settings")
    && nearestParagraph.includes('Only after confirming every required row');
}

module.exports = { hasAdjacentInspectedPatPrerequisite };
