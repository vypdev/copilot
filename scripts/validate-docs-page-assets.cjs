const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const docsRoot = path.join(root, 'docs');
const navigation = JSON.parse(fs.readFileSync(path.join(root, 'docs.json'), 'utf8'));
const iconCatalog = JSON.parse(fs.readFileSync(path.join(__dirname, 'docs-page-icons.json'), 'utf8'));
const allowedIcons = new Set(iconCatalog.icons);
const allowedComponents = new Set([
  'Accordion', 'AccordionGroup', 'Card', 'CardGroup', 'Image', 'Info', 'Step', 'Steps', 'Tab', 'Tabs', 'Warning'
]);

const files = [];
function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(full);
    else if (entry.name.endsWith('.mdx')) files.push(full);
  }
}
collect(docsRoot);

const errors = [];
const iconOccurrences = [];
function visit(node, source) {
  if (Array.isArray(node)) return node.forEach(item => visit(item, source));
  if (!node || typeof node !== 'object') return;
  if (typeof node.icon === 'string') iconOccurrences.push([source, node.icon]);
  Object.entries(node).forEach(([key, value]) => visit(value, source));
}
visit(navigation, 'docs.json');

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const relative = path.relative(root, file);
  for (const match of source.matchAll(/^\s*<([A-Z][A-Za-z0-9]*)\b/gm)) {
    if (!allowedComponents.has(match[1])) errors.push(`${relative}: unsupported component <${match[1]}>`);
  }
  for (const match of source.matchAll(/\bicon=["']([^"']+)["']/g)) iconOccurrences.push([relative, match[1]]);
}
for (const [source, icon] of iconOccurrences) {
  if (!allowedIcons.has(icon)) errors.push(`${source}: unsupported icon "${icon}"`);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`docs-page component/icon validation: PASS (${files.length} MDX files, ${iconOccurrences.length} icon uses)`);
