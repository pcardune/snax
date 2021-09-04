import * as AST from '../spec-gen';
import { makeFunc, makeNum } from './ast-util';
import { dumpSymbolTables } from '../spec-util';
import {
  resolveSymbols,
  SymbolRecord,
  SymbolTable,
} from '../symbol-resolution';
import { OrderedMap } from '../../utils/data-structures/OrderedMap';

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
    AST.makeLetStatement('x', null, makeNum(3)),
    AST.makeExprStatement(innerXRef),
    AST.makeExprStatement(innerYRef),
  ]);
  outerXRef = AST.makeSymbolRef('x');
  outerBlock = AST.makeBlock([
    AST.makeLetStatement('x', null, makeNum(1)),
    AST.makeLetStatement('y', null, makeNum(2)),
    innerBlock,
    AST.makeExprStatement(outerXRef),
  ]);
  globalDecl = AST.makeGlobalDecl('g', null, makeNum(10));
  funcDecl = makeFunc('main', [], outerBlock);
  file = AST.makeFile([funcDecl], [globalDecl]);
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
  it('globals appear in the files symbol table', () => {
    expect(tables.get(file)?.has('g')).toBe(true);
  });
  it('spits out the right debug info', () => {
    expect(dumpSymbolTables(file, tables)).toMatchInlineSnapshot(`
      "<File>
        <SymbolTable id=17 parent=16>
          <g/>
          <main/>
        </SymbolTable>
        <funcs>
          <FuncDecl symbol=\\"main\\" returnType=null>
            <ParameterList>
              <parameters/>
            </ParameterList>
            <Block>
              <SymbolTable id=18 parent=17>
                <x/>
                <y/>
              </SymbolTable>
              <statements>
                <LetStatement symbol=\\"x\\" typeExpr=null>
                  <NumberLiteral value=1 numberType=\\"int\\" explicitType=null/>
                </LetStatement>
                <LetStatement symbol=\\"y\\" typeExpr=null>
                  <NumberLiteral value=2 numberType=\\"int\\" explicitType=null/>
                </LetStatement>
                <Block>
                  <SymbolTable id=19 parent=18>
                    <x/>
                  </SymbolTable>
                  <statements>
                    <LetStatement symbol=\\"x\\" typeExpr=null>
                      <NumberLiteral value=3 numberType=\\"int\\" explicitType=null/>
                    </LetStatement>
                    <ExprStatement>
                      <SymbolRef symbol=\\"x\\"/>
                    </ExprStatement>
                    <ExprStatement>
                      <SymbolRef symbol=\\"y\\"/>
                    </ExprStatement>
                  </statements>
                </Block>
                <ExprStatement>
                  <SymbolRef symbol=\\"x\\"/>
                </ExprStatement>
              </statements>
            </Block>
          </FuncDecl>
        </funcs>
        <globals>
          <GlobalDecl symbol=\\"g\\" typeExpr=null>
            <NumberLiteral value=10 numberType=\\"int\\" explicitType=null/>
          </GlobalDecl>
        </globals>
      </File>"
    `);
  });
});
