import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import {
  DEFAULT_ASSIGNMENT_RESOLVER_ID,
  experimentDefinitionFingerprint,
  getExperimentValidationIssues,
  type ExperimentDefinition,
  type VariantMetadata,
} from "@facet-smith/core";
import ts from "typescript";

const FACTORIES = new Set([
  "createClientExperiment",
  "createExperiment",
  "createNextExperiment",
  "defineExperiment",
]);
const MODULE_FACTORIES = new Map<string, ReadonlySet<string>>([
  ["@facet-smith/core", new Set(["defineExperiment"])],
  [
    "@facet-smith/react",
    new Set(["createClientExperiment", "createExperiment"]),
  ],
  ["@facet-smith/next/server", new Set(["createNextExperiment"])],
]);
const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".pnpm-store",
  ".turbo",
  ".vercel",
  "build",
  "coverage",
  "dist",
  "e2e",
  "node_modules",
  "out",
  "test",
  "tests",
  "vendor",
  "__tests__",
]);

export interface SourceLocation {
  readonly file: string;
  readonly line: number;
  readonly column: number;
}

export interface ManifestVariantMetadata extends VariantMetadata {
  readonly implementationHash?: string;
}

export interface ExperimentManifestEntry extends ExperimentDefinition<
  Record<string, ManifestVariantMetadata>
> {
  readonly resolverId: string;
  readonly source: SourceLocation;
}

export interface ExperimentManifest {
  readonly schemaVersion: 2;
  readonly experiments: readonly ExperimentManifestEntry[];
}

export type DiagnosticCode = "FS100" | "FS101" | "FS102" | "FS103";

export interface IntegrityDiagnostic {
  readonly code: DiagnosticCode;
  readonly severity: "error";
  readonly message: string;
  readonly path: string;
  readonly source: SourceLocation;
  readonly experimentId?: string;
}

export interface IntegrityResult {
  readonly schemaVersion: 2;
  readonly valid: boolean;
  readonly manifest: ExperimentManifest;
  readonly diagnostics: readonly IntegrityDiagnostic[];
}

function sourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) {
        files.push(...sourceFiles(resolve(directory, entry.name)));
      }
      continue;
    }
    if (entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name)) {
      files.push(resolve(directory, entry.name));
    }
  }
  return files.sort();
}

function propertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return undefined;
}

function property(
  object: ts.ObjectLiteralExpression,
  name: string,
): ts.Expression | undefined {
  for (const candidate of object.properties) {
    if (
      ts.isPropertyAssignment(candidate) &&
      propertyName(candidate.name) === name
    ) {
      return candidate.initializer;
    }
  }
  return undefined;
}

function stringLiteral(
  expression: ts.Expression | undefined,
): string | undefined {
  return expression &&
    (ts.isStringLiteral(expression) ||
      ts.isNoSubstitutionTemplateLiteral(expression))
    ? expression.text
    : undefined;
}

function numberLiteral(expression: ts.Expression): number | undefined {
  if (ts.isNumericLiteral(expression)) return Number(expression.text);
  if (
    ts.isPrefixUnaryExpression(expression) &&
    expression.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(expression.operand)
  ) {
    return -Number(expression.operand.text);
  }
  return undefined;
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isParenthesizedExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function implementationText(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  visited = new Set<ts.Symbol>(),
): string {
  const current = unwrapExpression(expression);
  if (
    ts.isArrowFunction(current) ||
    ts.isFunctionExpression(current) ||
    ts.isClassExpression(current)
  ) {
    return current.getText(current.getSourceFile());
  }

  const symbolNode = ts.isPropertyAccessExpression(current)
    ? current.name
    : ts.isIdentifier(current)
      ? current
      : undefined;
  let symbol = symbolNode ? checker.getSymbolAtLocation(symbolNode) : undefined;
  const imported = Boolean(symbol && (symbol.flags & ts.SymbolFlags.Alias) !== 0);
  if (imported && symbol) symbol = checker.getAliasedSymbol(symbol);
  if (symbol && !visited.has(symbol)) {
    visited.add(symbol);
    const declarations = symbol.declarations ?? [];
    if (imported) {
      const source = declarations.find(
        (declaration) => !declaration.getSourceFile().isDeclarationFile,
      )?.getSourceFile();
      if (source) return source.getFullText();
    }
    for (const declaration of declarations) {
      if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
        return implementationText(declaration.initializer, checker, visited);
      }
      if (
        ts.isFunctionDeclaration(declaration) ||
        ts.isClassDeclaration(declaration)
      ) {
        return declaration.getText(declaration.getSourceFile());
      }
    }
  }

  return current.getText(current.getSourceFile());
}

function implementationHash(
  expression: ts.Expression,
  checker: ts.TypeChecker,
): string {
  const normalized = implementationText(expression, checker)
    .replaceAll("\r\n", "\n")
    .trim();
  return `sha256:${createHash("sha256").update(normalized).digest("hex")}`;
}

function staticResolverId(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  visited = new Set<ts.Symbol>(),
): string | undefined {
  const current = unwrapExpression(expression);
  if (ts.isObjectLiteralExpression(current)) {
    return stringLiteral(property(current, "id"));
  }
  if (ts.isIdentifier(current)) {
    let symbol = checker.getSymbolAtLocation(current);
    if (symbol && (symbol.flags & ts.SymbolFlags.Alias) !== 0) {
      symbol = checker.getAliasedSymbol(symbol);
    }
    if (symbol && !visited.has(symbol)) {
      visited.add(symbol);
      for (const declaration of symbol.declarations ?? []) {
        if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
          const resolved = staticResolverId(
            declaration.initializer,
            checker,
            visited,
          );
          if (resolved) return resolved;
        }
      }
    }
  }
  const type = checker.getTypeAtLocation(current);
  const id = type.getProperty("id");
  if (!id) return undefined;
  const idType = checker.getTypeOfSymbolAtLocation(id, current);
  return idType.isStringLiteral() ? idType.value : undefined;
}

function moduleSpecifier(node: ts.Node): string | undefined {
  let current: ts.Node | undefined = node;
  while (
    current &&
    !ts.isImportDeclaration(current) &&
    !ts.isExportDeclaration(current)
  ) {
    current = current.parent;
  }
  return current?.moduleSpecifier && ts.isStringLiteral(current.moduleSpecifier)
    ? current.moduleSpecifier.text
    : undefined;
}

function isSupportedFactory(moduleName: string, name: string): boolean {
  return (
    FACTORIES.has(name) && Boolean(MODULE_FACTORIES.get(moduleName)?.has(name))
  );
}

function localModuleSource(
  program: ts.Program,
  containingFile: string,
  moduleName: string,
): ts.SourceFile | undefined {
  if (!moduleName.startsWith(".")) return undefined;
  const base = resolve(dirname(containingFile), moduleName);
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    resolve(base, "index.ts"),
    resolve(base, "index.tsx"),
    resolve(base, "index.js"),
    resolve(base, "index.jsx"),
  ]) {
    const source = program.getSourceFile(candidate);
    if (source) return source;
  }
  return undefined;
}

function factoryFromLocalExport(
  source: ts.SourceFile,
  exportedName: string,
  program: ts.Program,
  visited: Set<string>,
): string | undefined {
  const key = `${source.fileName}\u0000${exportedName}`;
  if (visited.has(key)) return undefined;
  visited.add(key);
  for (const statement of source.statements) {
    if (
      !ts.isExportDeclaration(statement) ||
      !statement.exportClause ||
      !ts.isNamedExports(statement.exportClause)
    ) {
      continue;
    }
    for (const element of statement.exportClause.elements) {
      if (element.name.text !== exportedName) continue;
      const originName = element.propertyName?.text ?? element.name.text;
      const originModule = moduleSpecifier(statement);
      if (originModule && isSupportedFactory(originModule, originName)) {
        return originName;
      }
      if (originModule) {
        const nested = localModuleSource(
          program,
          source.fileName,
          originModule,
        );
        if (nested) {
          const factory = factoryFromLocalExport(
            nested,
            originName,
            program,
            visited,
          );
          if (factory) return factory;
        }
      }
    }
  }
  return undefined;
}

function factoryFromSymbol(
  symbol: ts.Symbol | undefined,
  checker: ts.TypeChecker,
  program: ts.Program,
  visited = new Set<ts.Symbol>(),
): string | undefined {
  if (!symbol || visited.has(symbol)) return undefined;
  visited.add(symbol);
  for (const declaration of symbol.declarations ?? []) {
    if (
      ts.isImportSpecifier(declaration) ||
      ts.isExportSpecifier(declaration)
    ) {
      const moduleName = moduleSpecifier(declaration);
      const importedName =
        declaration.propertyName?.text ?? declaration.name.text;
      if (moduleName && isSupportedFactory(moduleName, importedName)) {
        return importedName;
      }
      if (moduleName && ts.isImportSpecifier(declaration)) {
        const source = localModuleSource(
          program,
          declaration.getSourceFile().fileName,
          moduleName,
        );
        if (source) {
          const factory = factoryFromLocalExport(
            source,
            importedName,
            program,
            new Set(),
          );
          if (factory) return factory;
        }
      }
    }
  }
  if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) {
    const aliased = checker.getAliasedSymbol(symbol);
    if (aliased !== symbol)
      return factoryFromSymbol(aliased, checker, program, visited);
  }
  return undefined;
}

function importedFactoryName(
  expression: ts.LeftHandSideExpression,
  checker: ts.TypeChecker,
  program: ts.Program,
): string | undefined {
  if (ts.isIdentifier(expression)) {
    return factoryFromSymbol(
      checker.getSymbolAtLocation(expression),
      checker,
      program,
    );
  }
  if (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression)
  ) {
    const propertyFactory = factoryFromSymbol(
      checker.getSymbolAtLocation(expression.name),
      checker,
      program,
    );
    if (propertyFactory) return propertyFactory;
    const namespaceDeclaration = checker
      .getSymbolAtLocation(expression.expression)
      ?.declarations?.find(ts.isNamespaceImport);
    if (!namespaceDeclaration) return undefined;
    const moduleName = moduleSpecifier(namespaceDeclaration);
    if (moduleName && isSupportedFactory(moduleName, expression.name.text)) {
      return expression.name.text;
    }
    const source = moduleName
      ? localModuleSource(
          program,
          namespaceDeclaration.getSourceFile().fileName,
          moduleName,
        )
      : undefined;
    return source
      ? factoryFromLocalExport(source, expression.name.text, program, new Set())
      : undefined;
  }
  return undefined;
}

function factoryName(
  call: ts.CallExpression,
  checker: ts.TypeChecker,
  program: ts.Program,
): string | undefined {
  const expression = ts.isCallExpression(call.expression)
    ? call.expression.expression
    : call.expression;
  return importedFactoryName(expression, checker, program);
}

function sourceLocation(
  root: string,
  source: ts.SourceFile,
  node: ts.Node,
): SourceLocation {
  const position = source.getLineAndCharacterOfPosition(node.getStart(source));
  return {
    file: relative(root, source.fileName).replaceAll("\\", "/"),
    line: position.line + 1,
    column: position.character + 1,
  };
}

function staticDefinition(
  object: ts.ObjectLiteralExpression,
  checker: ts.TypeChecker,
): ExperimentDefinition<Record<string, ManifestVariantMetadata>> | undefined {
  const id = stringLiteral(property(object, "id"));
  const iteration = stringLiteral(property(object, "iteration"));
  const defaultVariant = stringLiteral(property(object, "defaultVariant"));
  const variantsNode = property(object, "variants");
  const allocationNode = property(object, "allocation");
  const saltNode = property(object, "salt");
  if (
    id === undefined ||
    iteration === undefined ||
    defaultVariant === undefined ||
    !variantsNode ||
    !ts.isObjectLiteralExpression(variantsNode) ||
    (allocationNode !== undefined &&
      !ts.isObjectLiteralExpression(allocationNode)) ||
    (saltNode !== undefined && stringLiteral(saltNode) === undefined)
  ) {
    return undefined;
  }

  const variants: Record<string, ManifestVariantMetadata> = {};
  for (const variantNode of variantsNode.properties) {
    if (!ts.isPropertyAssignment(variantNode)) return undefined;
    const variantId = propertyName(variantNode.name);
    if (!variantId || !ts.isObjectLiteralExpression(variantNode.initializer)) {
      return undefined;
    }
    const revision = stringLiteral(
      property(variantNode.initializer, "revision"),
    );
    if (revision === undefined) return undefined;
    const component = property(variantNode.initializer, "component");
    variants[variantId] = {
      revision,
      ...(component === undefined
        ? {}
        : { implementationHash: implementationHash(component, checker) }),
    };
  }

  let allocation: Record<string, number> | undefined;
  if (allocationNode && ts.isObjectLiteralExpression(allocationNode)) {
    allocation = {};
    for (const allocationProperty of allocationNode.properties) {
      if (!ts.isPropertyAssignment(allocationProperty)) return undefined;
      const variantId = propertyName(allocationProperty.name);
      const weight = numberLiteral(allocationProperty.initializer);
      if (!variantId || weight === undefined) return undefined;
      allocation[variantId] = weight;
    }
  }

  return {
    id,
    iteration,
    defaultVariant,
    variants,
    ...(allocation === undefined ? {} : { allocation }),
    ...(saltNode === undefined ? {} : { salt: stringLiteral(saltNode)! }),
  };
}

export function scanExperimentSources(cwd = process.cwd()): IntegrityResult {
  const root = resolve(cwd);
  const experiments: ExperimentManifestEntry[] = [];
  const diagnostics: IntegrityDiagnostic[] = [];
  const files = sourceFiles(root);
  const program = ts.createProgram({
    rootNames: files,
    options: {
      allowJs: true,
      checkJs: false,
      jsx: ts.JsxEmit.Preserve,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const checker = program.getTypeChecker();

  for (const file of files) {
    const source = program.getSourceFile(file);
    if (!source || source.isDeclarationFile) continue;
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        factoryName(node, checker, program) &&
        !(
          node.arguments.length === 0 &&
          ts.isCallExpression(node.parent) &&
          node.parent.expression === node
        )
      ) {
        const argument = node.arguments[0];
        const location = sourceLocation(root, source, node);
        if (!argument || !ts.isObjectLiteralExpression(argument)) {
          diagnostics.push({
            code: "FS100",
            severity: "error",
            message:
              "Experiment definitions must use a static object literal so agents and CI can inspect them.",
            path: "definition",
            source: location,
          });
        } else {
          const resolverExpression = node.arguments[1];
          const resolverId = resolverExpression
            ? staticResolverId(resolverExpression, checker)
            : DEFAULT_ASSIGNMENT_RESOLVER_ID;
          if (resolverId === undefined) {
            diagnostics.push({
              code: "FS103",
              severity: "error",
              message:
                "Assignment resolver IDs must be static string literals so agents and CI can inspect assignment identity.",
              path: "resolver.id",
              source: location,
            });
            return;
          }
          const definition = staticDefinition(argument, checker);
          if (!definition) {
            diagnostics.push({
              code: "FS100",
              severity: "error",
              message:
                "Experiment identity, variants, revisions, and any source allocation must be static literals.",
              path: "definition",
              source: location,
            });
          } else {
            const issues = getExperimentValidationIssues(definition, {
              id: resolverId,
            });
            for (const issue of issues) {
              diagnostics.push({
                code: "FS101",
                severity: "error",
                message: issue.message,
                path: issue.path,
                source: location,
                experimentId: definition.id,
              });
            }
            experiments.push({ ...definition, resolverId, source: location });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  const definitionsById = new Map<
    string,
    { source: SourceLocation; fingerprint: string }
  >();
  for (const experiment of experiments) {
    const fingerprint = experimentDefinitionFingerprint(experiment);
    const existing = definitionsById.get(experiment.id);
    if (existing !== undefined) {
      const differs = fingerprint !== existing.fingerprint;
      diagnostics.push({
        code: "FS102",
        severity: "error",
        message: `${differs ? "Conflicting" : "Duplicate"} definitions use experiment ID "${experiment.id}"; first declared at ${existing.source.file}:${existing.source.line}.`,
        path: "id",
        source: experiment.source,
        experimentId: experiment.id,
      });
    } else {
      definitionsById.set(experiment.id, {
        source: experiment.source,
        fingerprint,
      });
    }
  }

  experiments.sort(
    (left, right) =>
      left.id.localeCompare(right.id) ||
      left.source.file.localeCompare(right.source.file),
  );
  diagnostics.sort(
    (left, right) =>
      left.source.file.localeCompare(right.source.file) ||
      left.source.line - right.source.line ||
      left.code.localeCompare(right.code),
  );
  return {
    schemaVersion: 2,
    valid: diagnostics.length === 0,
    manifest: { schemaVersion: 2, experiments },
    diagnostics,
  };
}
