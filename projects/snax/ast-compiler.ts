import * as AST from './spec-gen';
import { SNAXParser } from './snax-parser';
import {
  ArrayType,
  BaseType,
  FuncType,
  Intrinsics,
  NumericalType,
} from './snax-types';
import * as IR from './stack-ir';
import * as Wasm from './wasm-ast';
import { BinaryOp, UnaryOp } from './snax-ast';
import { OrderedMap } from '../utils/data-structures/OrderedMap';
import { children, dumpData } from './spec-util';
import { resolveType } from './type-resolution';
import { resolveSymbols } from './symbol-resolution';

class DefaultMap<K, V> extends Map<K, V> {
  makeDefault: () => V;
  constructor(makeDefault: () => V) {
    super();
    this.makeDefault = makeDefault;
  }
  override get(key: K): V {
    let value = super.get(key);
    if (value !== undefined) {
      return value;
    }
    value = this.makeDefault();
    this.set(key, value);
    return value;
  }
}

export abstract class ASTCompiler<
  Root extends AST.ASTNode = AST.ASTNode,
  Output = IR.Instruction[]
> {
  root: Root;
  parent?: ASTCompiler<AST.ASTNode, unknown>;

  constructor(
    root: Root,
    parent: ASTCompiler<AST.ASTNode, unknown> | undefined
  ) {
    this.root = root;
    this.parent = parent;
  }

  abstract compile(): Output;

  protected forNode(node: AST.ASTNode): ASTCompiler {
    switch (node.name) {
      case 'BinaryExpr':
        return new ExpressionCompiler(node, this);
      case 'CallExpr':
        return new CallExprCompiler(node, this);
      case 'ExprStatement':
        return new ExprStatementCompiler(node, this);
      case 'NumberLiteral':
        return new NumberLiteralCompiler(node, this);
      case 'Block':
        return new BlockCompiler(node, this);
      case 'LetStatement':
        return new LetStatementCompiler(node, this);
      case 'IfStatement':
        return new IfStatementCompiler(node, this);
      case 'SymbolRef':
        return new SymbolRefCompiler(node, this);
      case 'BooleanLiteral':
        return new BooleanLiteralCompiler(node, this);
      case 'ArrayLiteral':
        return new ArrayLiteralCompiler(node, this);
      case 'StringLiteral':
        return new StringLiteralCompiler(node, this);
      case 'ArgList':
        return new ArgListCompiler(node, this);
      case 'WhileStatement':
        return new WhileStatementCompiler(node, this);
      case 'ReturnStatement':
        return new ReturnStatementCompiler(node, this);
      case 'UnaryExpr':
        return new UnaryExprCompiler(node, this);
      default:
        throw new Error(
          `ASTCompiler: No compiler available for node ${node.toString()}`
        );
    }
  }

  compileChild(child: AST.ASTNode) {
    return this.forNode(child).compile();
  }

  allocateLocal(valueType: IR.NumberType, symbol?: string): LocalAllocation {
    if (!this.parent) {
      throw new Error("Don't know how to allocate local in this context");
    }
    return this.parent.allocateLocal(valueType, symbol);
  }
  deallocateLocal(offset: LocalAllocation): void {
    if (!this.parent) {
      throw new Error("Don't know how to deallocate local in this context");
    }
    return this.parent.deallocateLocal(offset);
  }
  registerPassiveData(data: string): number {
    if (!this.parent) {
      throw new Error(
        "Don't know how to register passive data in this context"
      );
    }
    return this.parent.registerPassiveData(data);
  }
  private _nodeDataMapCache?: NodeDataMap;
  getNodeDataMap(): NodeDataMap {
    if (this._nodeDataMapCache) {
      return this._nodeDataMapCache;
    }
    if (this.parent) {
      this._nodeDataMapCache = this.parent.getNodeDataMap();
    } else {
      this._nodeDataMapCache = new DefaultMap(() => {
        return {};
      });
    }
    return this._nodeDataMapCache!;
  }
  private _dataCache?: NodeData;
  getNodeData(): NodeData {
    if (this._dataCache) {
      return this._dataCache;
    }
    const dataMap = this.getNodeDataMap();
    this._dataCache = dataMap.get(this.root);
    return this._dataCache;
  }

  resolveType(node: AST.ASTNode) {
    return resolveType(node, this.getNodeDataMap());
  }
}
export type NodeData = {
  symbolTable?: SymbolTable;
  symbolRecord?: SymbolRecord;
  location?: SymbolLocation;
  resolvedType?: BaseType;
};
export type NodeDataMap = DefaultMap<AST.ASTNode, NodeData>;

class ReturnStatementCompiler extends ASTCompiler<AST.ReturnStatement> {
  compile() {
    return [
      ...(this.root.fields.expr
        ? this.forNode(this.root.fields.expr).compile()
        : []),
      new IR.Return(),
    ];
  }
}

export class BlockCompiler extends ASTCompiler<AST.Block> {
  liveLocals: LocalAllocation[] = [];
  override allocateLocal(
    valueType: IR.NumberType,
    symbol?: string
  ): LocalAllocation {
    if (!this.parent) {
      throw new Error("BlockCompiler: can't allocate local in this context");
    }
    let localOffset = this.parent.allocateLocal(valueType);
    this.liveLocals.push(localOffset);
    if (symbol) {
      let symbolRecord = this.getNodeData().symbolTable?.get(symbol);
      if (symbolRecord) {
        symbolRecord.location = { area: 'locals', offset: localOffset.offset };
      } else {
        throw new Error(
          `BlockCompiler: Can't bind local offset to undeclared symbol ${symbol}`
        );
      }
    }
    return localOffset;
  }

  override deallocateLocal(offset: LocalAllocation): void {
    this.parent?.deallocateLocal(offset);
    this.liveLocals = this.liveLocals.filter((o) => o !== offset);
  }

  compile(): IR.Instruction[] {
    const code = this.root.fields.statements
      .filter((astNode) => !AST.isFuncDecl(astNode))
      .map((astNode) => this.forNode(astNode).compile())
      .flat();
    for (const offset of this.liveLocals) {
      this.parent?.deallocateLocal(offset);
    }
    return code;
  }
}

type SymbolLocation = {
  area: 'funcs' | 'locals' | 'globals';
  offset: number;
};

type SymbolRecord = {
  location?: SymbolLocation;
  valueType?: BaseType;
  declNode: AST.ASTNode;
};

export class SymbolTable {
  table: OrderedMap<string, SymbolRecord> = new OrderedMap();
  parent: SymbolTable | null;
  readonly id: number;
  private static nextId = 0;
  constructor(parent: SymbolTable | null = null) {
    this.parent = parent;
    this.id = SymbolTable.nextId++;
  }

  get(symbol: string): SymbolRecord | undefined {
    return this.table.get(symbol) ?? this.parent?.get(symbol);
  }

  has(symbol: string): boolean {
    return this.table.has(symbol);
  }

  records() {
    return this.table.values();
  }

  declare(symbol: string, declNode: AST.ASTNode) {
    this.table.set(symbol, { declNode });
  }
}

export type ModuleCompilerOptions = {
  includeRuntime?: boolean;
  includeWASI?: boolean;
};
export class ModuleCompiler extends ASTCompiler<AST.File, Wasm.Module> {
  file: AST.File;
  options: Required<ModuleCompilerOptions>;

  constructor(file: AST.File, options?: ModuleCompilerOptions) {
    super(file, undefined);
    this.file = file;
    this.options = {
      includeRuntime: false,
      includeWASI: false,
      ...options,
    };
  }

  private datas: Wasm.Data[] = [];
  private dataOffset = 0;
  override registerPassiveData(data: string) {
    const wasmData = new Wasm.Data({
      datastring: data,
      offset: this.dataOffset,
    });
    this.dataOffset += data.length;
    this.datas.push(wasmData);
    return wasmData.fields.offset;
  }

  private nodeDataMap: NodeDataMap = new DefaultMap(() => {
    return {};
  });
  override getNodeDataMap() {
    return this.nodeDataMap;
  }
  resolveSymbols(imports: Wasm.Import[]) {
    if (this.getNodeData().symbolTable) {
      throw new Error('resolveSymbols: Already resolved symbols for block...');
    }
    let symbolTable = new SymbolTable();

    for (const wasmImport of imports) {
      const { importdesc } = wasmImport.fields;
      if (importdesc.kind === 'func' && importdesc.id) {
        const id = `wasi_${importdesc.id}`;
        const { results, params } = importdesc.typeuse;
        if (results.length > 1) {
          throw new Error(
            "resolveSymbols: we don't support imports that return multiple values yet."
          );
        }
        let astNode = AST.makeFuncDecl(
          id,
          AST.makeParameterList(
            params.map((p, i) => AST.makeParameter(`p${i}`, AST.makeTypeRef(p)))
          ),
          results.length > 0 ? AST.makeTypeRef(results[0]) : null,
          AST.makeBlock([])
        );
        symbolTable.declare(id, astNode);
      }
    }
    resolveSymbols(this.file, this.getNodeDataMap(), symbolTable);
  }

  compile(): Wasm.Module {
    let imports: Wasm.Import[] = [];
    if (this.options.includeWASI) {
      const { i32 } = IR.NumberType;
      imports.push(
        new Wasm.Import({
          mod: 'wasi_unstable',
          nm: 'fd_write',
          importdesc: {
            kind: 'func',
            id: 'fd_write',
            typeuse: {
              params: [i32, i32, i32, i32],
              results: [i32],
            },
          },
        })
      );
    }
    if (this.options.includeRuntime) {
      let runtimeAST = SNAXParser.parseStrOrThrow(`
        global next = 0;
        func malloc(numBytes:i32) {
          let startAddress = next;
          next = next + numBytes;
          return startAddress;
        }`);
      if (AST.isFile(runtimeAST)) {
        this.file.fields.funcs.push(
          ...runtimeAST.fields.funcs.filter(
            (func) => func.fields.symbol !== 'main'
          )
        );
        this.file.fields.globals.push(...runtimeAST.fields.globals);
      }
    }

    this.resolveSymbols(imports);
    let funcOffset = 0;
    let globalOffset = 0;
    let symbolTable = this.getNodeData().symbolTable;
    if (!symbolTable) {
      throw new Error('expected file to have symbol table by now...');
    }
    for (const record of symbolTable.records()) {
      if (AST.isFuncDecl(record.declNode)) {
        record.location = { area: 'funcs', offset: funcOffset++ };
      } else if (AST.isGlobalDecl(record.declNode)) {
        record.location = { area: 'globals', offset: globalOffset++ };
      }
    }

    const funcs: Wasm.Func[] = this.file.fields.funcs.map((func) => {
      const wasmFunc = new FuncDeclCompiler(func, this).compile();
      if (func.fields.symbol === 'main') {
        wasmFunc.fields.exportName = '_start';
      }
      return wasmFunc;
    });

    const globals: Wasm.Global[] = this.file.fields.globals.map((global, i) => {
      return new Wasm.Global({
        id: `g${i}`,
        globalType: new Wasm.GlobalType({
          valtype: resolveType(global, this.getNodeDataMap()).toValueType(),
          mut: true,
        }),
        expr: this.compileChild(global.fields.expr),
      });
    });

    return new Wasm.Module({
      funcs,
      globals,
      imports: imports.length > 0 ? imports : undefined,
      datas: this.datas,
    });
  }
}

type LocalAllocation = {
  offset: number;
  live: boolean;
  local: Wasm.Local;
};

export class FuncDeclCompiler extends ASTCompiler<AST.FuncDecl, Wasm.Func> {
  locals: LocalAllocation[] = [];

  private localsOffset = 0;

  override allocateLocal(valueType: IR.NumberType): LocalAllocation {
    let freeLocal = this.locals.find(
      (l) => !l.live && l.local.fields.valueType === valueType
    );
    if (freeLocal) {
      freeLocal.live = true;
      return freeLocal;
    } else {
      let localAllocation = {
        offset: this.localsOffset++,
        live: true,
        local: new Wasm.Local(valueType),
      };
      this.locals.push(localAllocation);
      return localAllocation;
    }
  }

  override deallocateLocal(offset: LocalAllocation): void {
    let local = this.locals.find((l) => l === offset);
    if (!local) {
      throw new Error(
        "FuncDeclCompiler: can't deallocate local that was never allocated..."
      );
    }
    local.live = false;
  }

  compile(): Wasm.Func {
    resolveSymbols(this.root, this.getNodeDataMap(), null);
    const funcType = this.resolveType(this.root);
    if (!(funcType instanceof FuncType)) {
      throw new Error('unexpected type of function');
    }
    const params = funcType.argTypes.map((t) => t.toValueType());
    for (const param of this.root.fields.parameters.fields.parameters) {
      let location: SymbolLocation = {
        area: 'locals',
        offset: this.localsOffset++,
      };
      let paramData = this.getNodeDataMap().get(param);
      paramData.location = location;
      let symbolTable = paramData.symbolTable;
      if (symbolTable) {
        const symbolRecord = symbolTable.get(param.fields.symbol);
        if (!symbolRecord) {
          console.log(dumpData(this.root, this.getNodeDataMap()));
          throw new Error(
            `FuncDeclCompiler: no symbol record found for ${param.fields.symbol}`
          );
        }
        symbolRecord.location = location;
      }
    }

    const results =
      funcType.returnType === Intrinsics.void
        ? []
        : [funcType.returnType.toValueType()];

    return new Wasm.Func({
      id: this.root.fields.symbol,
      body: this.compileChild(this.root.fields.body),
      funcType: new Wasm.FuncTypeUse({
        params,
        results,
      }),
      locals: this.locals.map((l) => l.local),
    });
  }
}

class LetStatementCompiler extends ASTCompiler<AST.LetStatement> {
  compile(): IR.Instruction[] {
    let localAllocation = this.allocateLocal(
      this.resolveType(this.root).toValueType(),
      this.root.fields.symbol
    );
    this.getNodeData().location = {
      area: 'locals',
      offset: localAllocation.offset,
    };
    return [
      ...this.forNode(this.root.fields.expr).compile(),
      new IR.LocalSet(localAllocation.offset),
    ];
  }
}

export class IfStatementCompiler extends ASTCompiler<AST.IfStatement> {
  compile(): IR.Instruction[] {
    return [
      ...this.forNode(this.root.fields.condExpr).compile(),
      new Wasm.IfBlock({
        then: this.forNode(this.root.fields.thenBlock).compile(),
        else: this.forNode(this.root.fields.elseBlock).compile(),
      }),
    ];
  }
}

export class WhileStatementCompiler extends ASTCompiler<AST.WhileStatement> {
  compile() {
    return [
      ...this.compileChild(this.root.fields.condExpr),
      new Wasm.IfBlock({
        then: [
          new Wasm.LoopBlock({
            instr: [
              ...this.compileChild(this.root.fields.thenBlock),
              ...this.compileChild(this.root.fields.condExpr),
              new IR.BreakIf('while_0'),
            ],
            label: 'while_0',
          }),
        ],
        else: [],
      }),
    ];
  }
}

class SymbolRefCompiler extends ASTCompiler<AST.SymbolRef> {
  compile(): IR.Instruction[] {
    const location = this.getNodeData().symbolRecord?.location;
    if (!location) {
      throw new Error(
        `SymbolRefCompiler: Can't compile reference to unlocated symbol ${this.root.fields.symbol}`
      );
    }
    switch (location.area) {
      case 'locals':
        return [new IR.LocalGet(location.offset)];
      case 'globals':
        return [new IR.GlobalGet(location.offset)];
      default:
        throw new Error(
          `SymbolRefCompiler: don't know how to compile reference to a location in ${location.area}`
        );
    }
  }
}

export class ExpressionCompiler extends ASTCompiler<AST.BinaryExpr> {
  static forNode(root: AST.BinaryExpr) {
    return new ExpressionCompiler(root, undefined);
  }
  private pushNumberOps(left: AST.ASTNode, right: AST.ASTNode) {
    let targetType = this.matchTypes(left, right);
    return [
      ...this.forNode(left).compile(),
      ...this.convert(left, targetType),
      ...this.forNode(right).compile(),
      ...this.convert(right, targetType),
    ];
  }
  private convert(child: AST.ASTNode, targetType: IR.NumberType) {
    const childType = this.resolveType(child).toValueType();
    if (childType === targetType) {
      return [];
    }
    if (IR.isIntType(childType) && IR.isFloatType(targetType)) {
      return [new IR.Convert(childType, targetType)];
    }
    throw new Error(`Can't convert from a ${childType} to a ${targetType}`);
  }

  private matchTypes(left: AST.ASTNode, right: AST.ASTNode) {
    const leftType = this.resolveType(left);
    const rightType = this.resolveType(right);
    let targetType = leftType;
    if (
      leftType instanceof NumericalType &&
      rightType instanceof NumericalType
    ) {
      if (rightType.interpretation === 'float') {
        targetType = rightType;
      }
    } else if (leftType === Intrinsics.bool && rightType === Intrinsics.bool) {
    } else {
      throw new Error("pushNumberOps: don't know how to cast to number");
    }
    return targetType.toValueType();
  }
  private OpCompilers: Record<
    string,
    (left: AST.ASTNode, right: AST.ASTNode) => IR.Instruction[]
  > = {
    [BinaryOp.ADD]: (left: AST.ASTNode, right: AST.ASTNode) => [
      ...this.pushNumberOps(left, right),
      new IR.Add(this.matchTypes(left, right)),
    ],
    [BinaryOp.SUB]: (left: AST.ASTNode, right: AST.ASTNode) => [
      ...this.pushNumberOps(left, right),
      new IR.Sub(this.matchTypes(left, right)),
    ],
    [BinaryOp.MUL]: (left: AST.ASTNode, right: AST.ASTNode) => [
      ...this.pushNumberOps(left, right),
      new IR.Mul(this.matchTypes(left, right)),
    ],
    [BinaryOp.DIV]: (left: AST.ASTNode, right: AST.ASTNode) => [
      ...this.pushNumberOps(left, right),
      new IR.Div(this.matchTypes(left, right)),
    ],
    [BinaryOp.EQUAL_TO]: (left: AST.ASTNode, right: AST.ASTNode) => [
      ...this.pushNumberOps(left, right),
      new IR.Equal(this.matchTypes(left, right)),
    ],
    [BinaryOp.NOT_EQUAL_TO]: (left: AST.ASTNode, right: AST.ASTNode) => [
      ...this.pushNumberOps(left, right),
      new IR.NotEqual(this.matchTypes(left, right)),
    ],
    [BinaryOp.LESS_THAN]: (left: AST.ASTNode, right: AST.ASTNode) => [
      ...this.pushNumberOps(left, right),
      new IR.LessThan(this.matchTypes(left, right)),
    ],
    [BinaryOp.GREATER_THAN]: (left: AST.ASTNode, right: AST.ASTNode) => [
      ...this.pushNumberOps(left, right),
      new IR.GreaterThan(this.matchTypes(left, right)),
    ],
    [BinaryOp.LOGICAL_AND]: (left: AST.ASTNode, right: AST.ASTNode) => [
      ...this.forNode(left).compile(),
      ...this.forNode(right).compile(),
      new IR.And(Intrinsics.bool.toValueType()),
    ],
    [BinaryOp.LOGICAL_OR]: (left: AST.ASTNode, right: AST.ASTNode) => [
      ...this.forNode(left).compile(),
      ...this.forNode(right).compile(),
      new IR.Or(Intrinsics.bool.toValueType()),
    ],
    [BinaryOp.ASSIGN]: (left: AST.ASTNode, right: AST.ASTNode) => {
      const leftType = this.resolveType(left);
      const rightType = this.resolveType(right);
      if (leftType !== rightType) {
        throw new Error(
          `ASSIGN: Can't assign value of type ${rightType} to symbol of type ${leftType}`
        );
      }
      if (AST.isSymbolRef(left)) {
        const location = this.getNodeDataMap().get(left).symbolRecord?.location;
        if (!location) {
          throw new Error(
            `ASSIGN: can't compile assignment to unlocated symbol ${left.fields.symbol}`
          );
        }
        switch (location.area) {
          case 'locals':
            return [
              ...this.forNode(right).compile(),
              new IR.LocalTee(location.offset),
            ];
          case 'globals':
            return [
              ...this.compileChild(right),
              new IR.GlobalSet(location.offset),
              new IR.GlobalGet(location.offset),
            ];
          default:
            throw new Error(
              `ASSIGN: don't know how to compile assignment to symbol located in ${location.area}`
            );
        }
      } else if (AST.isUnaryExpr(left) && left.fields.op === UnaryOp.DEREF) {
        let setup = [
          ...this.compileChild(left.fields.expr),
          ...this.compileChild(right),
        ];
        let tempOffset = this.allocateLocal(
          this.resolveType(right).toValueType()
        );
        this.deallocateLocal(tempOffset);
        return [
          ...setup,
          new IR.LocalTee(tempOffset.offset),
          new IR.MemoryStore(rightType.toValueType()),
          new IR.LocalGet(tempOffset.offset),
        ];
      } else if (
        AST.isBinaryExpr(left) &&
        left.fields.op === BinaryOp.ARRAY_INDEX
      ) {
        let valueType = leftType.toValueType();
        const arrayExpr = left;
        let calcPointer = [
          ...this.compileChild(arrayExpr.fields.left),
          ...this.compileChild(arrayExpr.fields.right),
          new IR.PushConst(valueType, leftType.numBytes),
          new IR.Mul(valueType),
          new IR.Add(valueType),
        ];
        let calcValue = this.compileChild(right);
        let tempOffset = this.allocateLocal(
          this.resolveType(right).toValueType()
        );
        this.deallocateLocal(tempOffset);
        return [
          ...calcPointer,
          ...calcValue,
          new IR.LocalTee(tempOffset.offset),
          new IR.MemoryStore(valueType, 0, leftType.numBytes),
          new IR.LocalGet(tempOffset.offset),
        ];
      } else {
        throw new Error(
          `ASSIGN: Can't assign to something that is not a resolved symbol or a memory address`
        );
      }
    },
    [BinaryOp.ARRAY_INDEX]: (refExpr: AST.ASTNode, indexExpr: AST.ASTNode) => {
      const valueType = this.resolveType(refExpr).toValueType();
      return [
        ...this.forNode(refExpr).compile(),
        ...this.forNode(indexExpr).compile(),
        new IR.Add(valueType),
        new IR.PushConst(valueType, 4),
        new IR.Mul(valueType),
        new IR.MemoryLoad(valueType, 0),
      ];
    },
    [BinaryOp.CAST]: (left: AST.ASTNode, right: AST.ASTNode) => {
      throw new Error(`CAST: don't know how to cast values yet`);
    },
  };
  compile(): IR.Instruction[] {
    return this.OpCompilers[this.root.fields.op](
      this.root.fields.left,
      this.root.fields.right
    );
  }
}

class CallExprCompiler extends ASTCompiler<AST.CallExpr> {
  compile() {
    const { left, right } = this.root.fields;
    if (AST.isSymbolRef(left)) {
      const location = this.getNodeDataMap().get(left).symbolRecord?.location;
      if (!location || location.area !== 'funcs') {
        throw new Error(
          `CALL: can't call unlocated function ${left.fields.symbol}`
        );
      }
      return [...this.forNode(right).compile(), new IR.Call(location.offset)];
    } else {
      throw new Error(
        `ExpressionCompiler: Can't call unresolved symbol ${left}`
      );
    }
  }
}

class UnaryExprCompiler extends ASTCompiler<AST.UnaryExpr> {
  compile() {
    switch (this.root.fields.op) {
      case UnaryOp.DEREF:
        const exprType = this.resolveType(this.root.fields.expr);
        return [
          ...this.compileChild(this.root.fields.expr),
          new IR.MemoryLoad(exprType.toValueType()),
        ];
      default:
        throw new Error(`UnaryExprCompiler: unknown op ${this.root.fields.op}`);
    }
  }
}

class ExprStatementCompiler extends ASTCompiler<AST.ExprStatement> {
  compile() {
    if (this.resolveType(this.root.fields.expr) === Intrinsics.void) {
      return this.compileChild(this.root.fields.expr);
    }
    return [...this.compileChild(this.root.fields.expr), new IR.Drop()];
  }
}

class ArgListCompiler extends ASTCompiler<AST.ArgList> {
  compile() {
    return children(this.root)
      .map((child) => this.forNode(child).compile())
      .flat();
  }
}

class NumberLiteralCompiler extends ASTCompiler<AST.NumberLiteral> {
  compile(): IR.Instruction[] {
    const valueType = this.resolveType(this.root).toValueType();
    return [new IR.PushConst(valueType, this.root.fields.value)];
  }
}

export class BooleanLiteralCompiler extends ASTCompiler<AST.BooleanLiteral> {
  compile(): IR.Instruction[] {
    const value = this.root.fields.value ? 1 : 0;
    return [new IR.PushConst(IR.NumberType.i32, value)];
  }
}

class ArrayLiteralCompiler extends ASTCompiler<AST.ArrayLiteral> {
  compile(): IR.Instruction[] {
    const arrayType = this.resolveType(this.root);
    if (!(arrayType instanceof ArrayType)) {
      throw new Error('unexpected type for array literal');
    }
    // TODO: this should not be zero, otherwise every array literal
    // will overwrite the other array literals...
    const baseAddressInstr = new IR.PushConst(IR.NumberType.i32, 0);
    const instr: IR.Instruction[] = [
      ...children(this.root).map((child, i) => [
        // push memory space offset
        baseAddressInstr,
        // push value from expression
        ...this.forNode(child).compile(),
        // store value
        new IR.MemoryStore(arrayType.elementType.toValueType(), i * 4, 4),
      ]),
    ].flat();
    instr.push(baseAddressInstr);
    return instr;
  }
}

class StringLiteralCompiler extends ASTCompiler<AST.StringLiteral> {
  compile() {
    let offset = this.registerPassiveData(this.root.fields.value);
    return [new IR.PushConst(IR.NumberType.i32, offset)];
  }
}
