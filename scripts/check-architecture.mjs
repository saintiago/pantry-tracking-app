import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const roots = ['frontend/src', 'backend/src', 'infrastructure/src', 'packages/domain/src'];
const budgets = JSON.parse(fs.readFileSync('scripts/architecture-budgets.json', 'utf8'));
const failures = [];
const normalize = (value) => value.split(path.sep).join('/');
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const name = normalize(path.join(directory, entry.name));
    if (entry.isDirectory()) return entry.name.startsWith('__') ? [] : walk(name);
    return /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [name] : [];
  });
}
const files = roots.flatMap(walk);
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const lines = source.trimEnd().split('\n').length;
  const limit = budgets[file] ?? 500;
  if (lines > limit)
    failures.push(`${file}: ${lines} lines exceeds ${limit}; extract a cohesive responsibility.`);
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const specifiers = [];
  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      specifiers.push(node.moduleSpecifier.text);
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    )
      specifiers.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  for (const specifier of specifiers) {
    const target = specifier.startsWith('.')
      ? normalize(path.normalize(path.join(path.dirname(file), specifier)))
      : specifier;
    if (/^backend\/src\/(http|db)\//.test(file) && target.startsWith('backend/src/handlers/')) {
      failures.push(
        `${file}: shared infrastructure cannot depend on feature handlers (${specifier}).`,
      );
    }
    if (
      file.startsWith('frontend/src/api/') &&
      /^frontend\/src\/(components|pages)\//.test(target)
    ) {
      failures.push(`${file}: API modules cannot depend on UI (${specifier}).`);
    }
    if (
      file.startsWith('frontend/src/domain/') &&
      !target.startsWith('frontend/src/domain/') &&
      target !== '@pantry/domain'
    ) {
      failures.push(
        `${file}: domain modules must be independent of transport and UI (${specifier}).`,
      );
    }
    if (file.startsWith('packages/domain/src/') && !target.startsWith('packages/domain/src/')) {
      failures.push(`${file}: shared domain must remain platform-independent (${specifier}).`);
    }
    if (
      (file.startsWith('backend/') && target.startsWith('frontend/')) ||
      (file.startsWith('frontend/') && target.startsWith('backend/'))
    ) {
      failures.push(
        `${file}: share contracts via @pantry/domain, not another application (${specifier}).`,
      );
    }
  }
}
for (const file of Object.keys(budgets)) {
  if (!files.includes(file)) failures.push(`Remove obsolete architecture budget: ${file}`);
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Architecture checks passed for ${files.length} production modules.`);
}
