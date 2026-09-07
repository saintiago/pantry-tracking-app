import fs from 'node:fs';
import path from 'node:path';

function markdownFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? markdownFiles(file) : file.endsWith('.md') ? [file] : [];
  });
}

const files = ['AGENTS.md', 'CLAUDE.md', 'README.md', ...markdownFiles('docs')];
const failures = [];
for (const file of files) {
  const bytes = fs.readFileSync(file);
  let source;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    failures.push(`${file}: must use UTF-8.`);
    continue;
  }
  if (bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) {
    failures.push(`${file}: remove the UTF-8 BOM.`);
  }
  // Check local inline Markdown links outside fenced examples. External links and
  // anchors are deliberately excluded: this gate is deterministic and works offline.
  source = source.replace(/```[\s\S]*?```/g, '');
  for (const match of source.matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1].replace(/^<|>$/g, '').split('#')[0];
    if (!target || /^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('/')) continue;
    if (!fs.existsSync(path.resolve(path.dirname(file), target))) {
      failures.push(`${file}: broken local link ${target}`);
    }
  }
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Documentation checks passed for ${files.length} guides.`);
}
