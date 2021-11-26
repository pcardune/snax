import * as AST from '../spec-gen.js';
import { makeFunc, makeNum } from '../ast-util.js';
import { dumpASTData } from '../spec-util.js';
import {
  resolveSymbols,
  SymbolRecord,
  SymbolTable,
} from '../symbol-resolution.js';
import type { OrderedMap } from '../../utils/data-structures/OrderedMap.js';

describe('resolveSymbols', () => {
  let file: AST.File;
  let funcDecl: AST.FuncDecl;
  let moduleDecl: AST.ModuleDecl;
  let globalDecl: AST.GlobalDecl;
  let outerBlock: AST.Block;
  let innerBlock: AST.Block;
  let innerXRef: AST.SymbolRef;
  let innerYRef: AST.SymbolRef;
  let outerXRef: AST.SymbolRef;
  let tables: OrderedMap<AST.ASTNode, SymbolTable>;
  let refMap: OrderedMap<AST.ASTNode, SymbolRecord>;
  beforeEach(() => {
    innerXRef = AST.makeSymbolRef('x');
    innerYRef = AST.makeSymbolRef('y');
    innerBlock = AST.makeBlock([
      AST.makeLetStatement('x', undefined, makeNum(3)),
      AST.makeExprStatement(innerXRef),
      AST.makeExprStatement(innerYRef),
    ]);
    outerXRef = AST.makeSymbolRef('x');
    outerBlock = AST.makeBlock([
      AST.makeLetStatement('x', undefined, makeNum(1)),
      AST.makeLetStatement('y', undefined, makeNum(2)),
      innerBlock,
      AST.makeExprStatement(outerXRef),
    ]);
    globalDecl = AST.makeGlobalDecl('g', undefined, makeNum(10));
    funcDecl = makeFunc('main', [], outerBlock);
    moduleDecl = AST.makeModuleDeclWith({
      symbol: 'math',
      decls: [makeFunc('calcPi', [], [])],
    });
    file = AST.makeFileWith({
      decls: [
        moduleDecl,
        funcDecl,
        globalDecl,
        AST.makeExternDeclWith({
          libName: 'someLib',
          funcs: [
            AST.makeExternFuncDecl(
              'externalFunc',
              AST.makeParameterList([]),
              AST.makeTypeRef(AST.makeSymbolRef('void'))
            ),
          ],
        }),
      ],
    });
    const resolution = resolveSymbols(file);
    tables = resolution.tables;
    refMap = resolution.refMap;
  });
  it('constructs the correct symbol table', () => {
    let symbolTable = tables.get(outerBlock);
    if (!symbolTable) {
      fail('resolveSymbols should attach a symbolTable to the block');
    }
    expect(symbolTable.get('x')?.declNode).toBe(
      outerBlock.fields.statements[0]
    );
    expect(symbolTable.get('y')?.declNode).toBe(
      outerBlock.fields.statements[1]
    );
    expect(refMap.get(outerXRef)).toBe(symbolTable.get('x'));
  });
  it('symbols are resolved to the nearest scope they are found in', () => {
    expect(refMap.get(innerXRef)).not.toBe(tables.get(outerBlock)?.get('x'));
    expect(refMap.get(innerXRef)).toBe(tables.get(innerBlock)?.get('x'));
  });
  it('symbols are resolved to an outer scope when not in the current scope', () => {
    expect(refMap.get(innerYRef)).toBe(tables.get(outerBlock)?.get('y'));
  });
  it('globals appear in the file symbol table', () => {
    expect(tables.get(file)?.has('g')).toBe(true);
  });
  it('external funcs appear in the file symbol table', () => {
    expect(tables.get(file)?.has('externalFunc')).toBe(true);
  });
  it('modules declarations have their own symbol table', () => {
    const moduleSymbols = tables.get(moduleDecl);
    expect(moduleSymbols).toBeDefined();
    expect(moduleSymbols?.get('calcPi')?.declNode).toBe(
      moduleDecl.fields.decls[0]
    );
  });
  it('spits out the right debug info', () => {
    expect(dumpASTData(file, { symbolTables: tables })).toMatchSnapshot();
  });
});

describe('module symbol resolution', () => {
  const setup = () => {
    const mathModule = AST.makeModuleDeclWith({
      symbol: 'math',
      decls: [
        makeFunc('calcPi', [], []),
        makeFunc(
          'calc2Pi',
          [],
          [AST.makeExprStatement(AST.makeSymbolRef('calcPi'))]
        ),
      ],
    });
    const file = AST.makeFile([mathModule]);
    const { tables, refMap, globals } = resolveSymbols(file);
    return { mathModule, tables, refMap, globals };
  };

  it('modules get their own symbol table without a parent', () => {
    const { tables, mathModule, globals } = setup();
    expect(tables.get(mathModule)?.parent).toBe(globals);
  });

  it('the module symbol table contains the funcs defined in the module', () => {
    const { tables, mathModule } = setup();
    const mathModuleSymbol = tables.get(mathModule)!;
    const calcPiRecord = mathModuleSymbol.get('calcPi');
    expect(calcPiRecord).toBeDefined();
    expect(calcPiRecord!.declNode).toBe(mathModule.fields.decls[0]);
  });
});
