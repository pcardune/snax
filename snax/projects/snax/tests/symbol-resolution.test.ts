import * as AST from '../spec-gen.js';
import { makeFunc, makeNum } from './ast-util.js';
import { dumpSymbolTables } from '../spec-util.js';
import {
  resolveSymbols,
  SymbolRecord,
  SymbolTable,
} from '../symbol-resolution.js';
import { OrderedMap } from '../../utils/data-structures/OrderedMap.js';

let file: AST.File;
let funcDecl: AST.FuncDecl;
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
  file = AST.makeFileWith({
    funcs: [funcDecl],
    globals: [globalDecl],
    decls: [
      AST.makeExternDeclWith({
        libName: 'someLib',
        funcs: [makeFunc('externalFunc')],
      }),
    ],
  });
  const resolution = resolveSymbols(file);
  tables = resolution.tables;
  refMap = resolution.refMap;
});

describe('resolveSymbols', () => {
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
  it('spits out the right debug info', () => {
    expect(dumpSymbolTables(file, tables)).toMatchSnapshot();
  });
});