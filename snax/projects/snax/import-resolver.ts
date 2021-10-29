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
 */
export async function resolveImports(
  file: AST.File,
  pathLoader: (path: string) => Promise<AST.File>
) {
  let nextImport = getNextImportDecl(file);
  while (nextImport) {
    const { importDecl, parentNode } = nextImport;
    const { path } = importDecl.fields;
    const importedFileAst = await pathLoader(path);
    const importedModuleDecl = AST.makeModuleDecl(
      importDecl.fields.symbol,
      importedFileAst.fields.decls
    );
    importedModuleDecl.location = importDecl.location;
    const importDeclIndex = parentNode.fields.decls.indexOf(importDecl);
    parentNode.fields.decls[importDeclIndex] = importedModuleDecl;
    nextImport = getNextImportDecl(file);
  }
}
