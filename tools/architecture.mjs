import ts from 'typescript';
import { realpathSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, readJson, listFiles } from './project.mjs';

const slash = path => path.replaceAll('\\', '/');

export function architectureErrors(root, modules) {
  const configPath = resolve(root, 'tsconfig.json');
  const loaded = ts.readConfigFile(configPath, ts.sys.readFile);
  if (loaded.error) return ['ARCHITECTURE_CONFIG'];
  const config = ts.parseJsonConfigFileContent(loaded.config, ts.sys, root);
  if (config.errors.length) return ['ARCHITECTURE_CONFIG'];
  const program = ts.createProgram(config.fileNames, config.options);
  const errors = [];
  const location = file => slash(relative(root, realpathSync(file)));
  // TypeScript uses forward slashes even on Windows; filesystem paths need a
  // shared real-path representation before build membership is compared.
  const sourceFiles = new Set(config.fileNames.map(location));
  for (const file of listFiles(root).filter(path => /^src\/.*\.[cm]?[jt]sx?$/.test(path))) {
    if (!sourceFiles.has(location(resolve(root, file)))) errors.push(`SOURCE_OUTSIDE_BUILD:${file}`);
  }
  const edges = new Map();
  for (const source of program.getSourceFiles()) {
    if (!sourceFiles.has(location(source.fileName))) continue;
    const importer = location(source.fileName);
    const parts = importer.split('/');
    const from = parts[1];
    if (parts[0] !== 'src' || !modules.modules[from]) {
      errors.push(`UNDECLARED_MODULE:${importer}`); continue;
    }
    const spec = modules.modules[from];
    const checkTarget = target => {
      const resolution = ts.resolveModuleName(target, source.fileName, config.options, ts.sys).resolvedModule;
      if (!resolution) {
        if (!(spec.allowed_external ?? []).includes(target)) errors.push(`UNRESOLVED_IMPORT:${importer}`);
        return;
      }
      const destination = location(resolution.resolvedFileName);
      const targetParts = destination.split('/');
      if (targetParts[0] !== 'src' || !modules.modules[targetParts[1]]) {
        if (!(resolution.isExternalLibraryImport && (spec.allowed_external ?? []).includes(target))) {
          errors.push(`OUTSIDE_MODULES:${importer}`);
        }
        return;
      }
      const to = targetParts[1];
      if (to === from) return;
      if (!spec.allowed_imports.includes(to)) errors.push(`DISALLOWED_DEPENDENCY:${importer}->${to}`);
      if (targetParts.length !== 3 || targetParts[2] !== 'index.ts') errors.push(`PRIVATE_MODULE_IMPORT:${importer}`);
      if (!edges.has(from)) edges.set(from, new Set());
      edges.get(from).add(to);
    };
    for (const ref of source.referencedFiles) checkTarget(ref.fileName);
    for (const ref of source.typeReferenceDirectives) checkTarget(ref.fileName);
    const visit = node => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
        if (ts.isStringLiteralLike(node.moduleSpecifier)) checkTarget(node.moduleSpecifier.text);
      } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
        checkTarget(node.argument.literal.text);
      } else if (ts.isImportEqualsDeclaration(node)) {
        errors.push(`IMPORT_EQUALS_NOT_ALLOWED:${importer}`);
      } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
        errors.push(`DYNAMIC_IMPORT_NOT_ALLOWED:${importer}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  const active = new Set();
  const visited = new Set();
  const walk = module => {
    if (active.has(module)) { errors.push(`MODULE_CYCLE:${module}`); return; }
    if (visited.has(module)) return;
    active.add(module);
    for (const target of edges.get(module) ?? []) walk(target);
    active.delete(module); visited.add(module);
  };
  for (const module of edges.keys()) walk(module);
  return [...new Set(errors)].sort();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const errors = architectureErrors(ROOT, readJson('module-map.json'));
    if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
    else console.log('PASS: TypeScript-resolved public module imports, aliases, re-exports, type imports and cycles.');
  } catch (error) {
    console.error(`ARCHITECTURE_ERROR:${error.name}`); process.exitCode = 1;
  }
}
