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

type ImportWithParent = {
  decl: AST.ImportDecl;
  parentNode: AST.File | AST.ModuleDecl;
};

function getImportDecls(fromNode: AST.File | AST.ModuleDecl) {
  const importDecls: ImportWithParent[] = [];
  for (const decl of fromNode.fields.decls) {
    if (AST.isImportDecl(decl)) {
      importDecls.push({ decl, parentNode: fromNode });
    } else if (AST.isModuleDecl(decl)) {
      importDecls.push(...getImportDecls(decl));
    }
  }
  return importDecls;
}

export type PathLoader = (
  path: string,
  fromCanonicalUrl: string
) => Promise<{ ast: AST.File; canonicalUrl: string }>;

export class ImportResolver {
  private readonly pathLoader: PathLoader;
  private readonly rootFile: AST.File;
  private readonly rootUrl: string;
  private readonly moduleMap: { [key: string]: AST.ModuleDecl } = {};

  constructor(pathLoader: PathLoader, rootFile: AST.File, rootUrl: string) {
    this.pathLoader = pathLoader;
    this.rootFile = rootFile;
    this.rootUrl = rootUrl;
  }

  async resolve() {
    const importToModule = await this.resolveInner(this.rootFile, [
      this.rootUrl,
    ]);
    // attach all collected modules to the root file ast
    const modules = [...importToModule.values()];
    modules.reverse();
    for (const val of modules) {
      this.rootFile.fields.decls.unshift(val);
    }
    return importToModule;
  }

  async resolveInner(file: AST.File, stack: string[]) {
    const importToModule = new Map<string, AST.ModuleDecl>();
    const importDecls = getImportDecls(file);
    for (const nextImport of importDecls) {
      const { decl, parentNode } = nextImport;
      const { path } = decl.fields;
      const loadedFile = await this.pathLoader(path, stack[stack.length - 1]);
      const canonicalUrl = loadedFile.canonicalUrl;
      const importedFileAst = loadedFile.ast;

      if (stack.includes(canonicalUrl)) {
        const cycle = stack.slice(stack.indexOf(canonicalUrl));
        cycle.push(canonicalUrl);
        throw new CompilerError(
          decl,
          `Import cycle detected: ${cycle.join(' -> ')}`
        );
      }
      // descend into imported file to resolve its imports
      stack.push(canonicalUrl);
      const additionalImports = await this.resolveInner(importedFileAst, stack);
      stack.pop();
      for (const [key, val] of additionalImports.entries()) {
        importToModule.set(key, val);
      }

      // now wrap up the imported file into a moduleDecl
      const importedModuleDecl = AST.makeModuleDeclWith({
        symbol: canonicalUrl,
        globalNamespace: true,
        decls: importedFileAst.fields.decls,
      });
      importedModuleDecl.location = decl.location;
      this.moduleMap[canonicalUrl] = importedModuleDecl;

      // now replace the import with an alias to the top-level module
      const alias = AST.makeSymbolAliasWith({
        fromSymbol: decl.fields.symbol,
        toSymbol: canonicalUrl,
      });
      alias.location = decl.location;
      parentNode.fields.decls[parentNode.fields.decls.indexOf(decl)] = alias;
      importToModule.set(importedModuleDecl.fields.symbol, importedModuleDecl);
    }
    return importToModule;
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
 * @returns a mapping from import declaration ast nodes to the module declarations
 * they were replaced with.
 */
export async function resolveImports(
  file: AST.File,
  pathLoader: PathLoader,
  rootUrl: string
) {
  return new ImportResolver(pathLoader, file, rootUrl).resolve();
}
