import * as AST from './spec-gen.js';

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

export type ImportConfig = {
  file: AST.File;
  pathLoader: PathLoader;
  rootUrl: string;
  autoImport?: string[];
};
export class ImportResolver {
  private readonly config: Required<ImportConfig>;
  get pathLoader() {
    return this.config.pathLoader;
  }
  get rootFile() {
    return this.config.file;
  }
  get rootUrl() {
    return this.config.rootUrl;
  }
  private readonly moduleMap: { [key: string]: AST.ModuleDecl } = {};

  constructor(config: ImportConfig) {
    this.config = {
      autoImport: [],
      ...config,
    };
  }

  async resolve() {
    this.attachAutoImports(this.rootFile);
    const rootModule = AST.makeModuleDeclWith({
      symbol: this.rootUrl,
      globalNamespace: true,
      decls: this.rootFile.fields.decls,
    });
    rootModule.location = this.rootFile.location;
    this.rootFile.fields.decls = [rootModule];

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

  private attachAutoImports(file: AST.File) {
    const importDecls = this.config.autoImport.map((path) => {
      const importDecl = AST.makeImportDeclWith({
        symbol: path,
        path: path,
      });
      importDecl.location = {
        source: '<compiler>',
        start: { offset: 0, line: 0, column: 0 },
        end: { offset: 0, line: 0, column: 0 },
      };
      return importDecl;
    });
    for (const decl of importDecls) {
      file.fields.decls.unshift(decl);
    }
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

      // if we're not already in the process of
      // importing this module... then recurse
      // into it to find more modules to import
      if (!stack.includes(canonicalUrl)) {
        // descend into imported file to resolve its imports
        stack.push(canonicalUrl);
        this.attachAutoImports(importedFileAst);
        const additionalImports = await this.resolveInner(
          importedFileAst,
          stack
        );
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
        importToModule.set(
          importedModuleDecl.fields.symbol,
          importedModuleDecl
        );
      }

      // now replace the import with an alias to the top-level module
      const alias = AST.makeSymbolAliasWith({
        fromSymbol: decl.fields.symbol,
        toSymbol: canonicalUrl,
      });
      alias.location = decl.location;
      parentNode.fields.decls[parentNode.fields.decls.indexOf(decl)] = alias;
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
export async function resolveImports(props: ImportConfig) {
  return new ImportResolver(props).resolve();
}
