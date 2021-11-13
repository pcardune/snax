import { CompilerError } from './errors.js';
import * as AST from './spec-gen.js';

function getNextImportDecl(fromNode: AST.File | AST.ModuleDecl):
  | undefined
  | {
      importDecl: AST.ImportDecl;
      parentNode: AST.File | AST.ModuleDecl;
    } {
  for (const decl of fromNode.fields.decls) {
    if (AST.isImportDecl(decl)) {
      return { importDecl: decl, parentNode: fromNode };
    }
    if (AST.isModuleDecl(decl)) {
      const next = getNextImportDecl(decl);
      if (next) {
        return next;
      }
    }
  }
}

export type PathLoader = (
  path: string,
  fromCanonicalUrl: string
) => Promise<{ ast: AST.File; canonicalUrl: string }>;

/**
 * Given a file ast, recursively replaces all import statements
 * with the AST of the files they reference, scoped to a module.
 * So for example,
 *
 * ```
 * import foo from "./some/path.snx"
 * ```
 *
 * would become
 *
 * ```
 * module foo {
 *   // ... contents of ./some/path.snx
 * }
 * ```
 *
 * @param file
 * @param pathLoader
 * @returns a mapping from import declaration ast nodes to the module declarations
 * they were replaced with.
 */
export async function resolveImports(
  file: AST.File,
  pathLoader: PathLoader,
  stack: string[]
) {
  const importToModule = new Map<AST.ImportDecl, AST.ModuleDecl>();
  let nextImport = getNextImportDecl(file);
  while (nextImport) {
    const { importDecl, parentNode } = nextImport;
    const { path } = importDecl.fields;
    const { ast: importedFileAst, canonicalUrl } = await pathLoader(
      path,
      stack[stack.length - 1]
    );
    if (stack.includes(canonicalUrl)) {
      const cycle = stack.slice(stack.indexOf(canonicalUrl));
      cycle.push(canonicalUrl);
      throw new CompilerError(
        importDecl,
        `Import cycle detected: ${cycle.join(' -> ')}`
      );
    }
    stack.push(canonicalUrl);
    const additionalImports = await resolveImports(
      importedFileAst,
      pathLoader,
      stack
    );
    stack.pop();
    for (const [key, val] of additionalImports.entries()) {
      importToModule.set(key, val);
    }

    const importedModuleDecl = AST.makeModuleDeclWith({
      symbol: importDecl.fields.symbol,
      decls: importedFileAst.fields.decls,
    });
    importedModuleDecl.location = importDecl.location;
    const importDeclIndex = parentNode.fields.decls.indexOf(importDecl);
    parentNode.fields.decls[importDeclIndex] = importedModuleDecl;
    importToModule.set(importDecl, importedModuleDecl);
    nextImport = getNextImportDecl(file);
  }
  return importToModule;
}
