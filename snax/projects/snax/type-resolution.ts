import { OrderedMap } from '../utils/data-structures/OrderedMap.js';
import { getPropNameOrThrow } from './ast-util.js';
import { CompilerError, TypeResolutionError } from './errors.js';
import { Sign } from './numbers.js';
import { BinOp, NumberLiteralType, UnaryOp } from './snax-ast.js';
import {
  ArrayType,
  BaseType,
  FuncType,
  Intrinsics,
  isIntrinsicSymbol,
  NumericalType,
  PointerType,
  RecordType,
  TupleType,
  UnionType,
} from './snax-types.js';
import {
  ASTNode,
  isFuncDecl,
  isNumberLiteral,
  isReturnStatement,
} from './spec-gen.js';
import { depthFirstIter, preorderIter, pretty } from './spec-util.js';
import type { SymbolRefMap } from './symbol-resolution.js';

type Fields<N> = N extends { fields: infer F } ? F : never;

export class ResolvedTypeMap extends OrderedMap<ASTNode, BaseType> {
  get(key: ASTNode): BaseType {
    const type = super.get(key);
    if (!type) {
      throw new CompilerError(key, `No type was bound to ${key.name}`);
    }
    return type;
  }
}

export function resolveTypes(root: ASTNode, refMap: SymbolRefMap) {
  const resolver = new TypeResolver(refMap);
  for (const node of preorderIter(root)) {
    resolver.resolveType(node, undefined);
  }
  for (const [index, node, type] of resolver.typeMap.entries()) {
    if (type.equals(Intrinsics.unknown)) {
      throw new TypeResolutionError(
        resolver,
        node,
        `Couldn't resolve type for ${node.name}`
      );
    }
  }
  return resolver.typeMap;
}

export class TypeResolver {
  refMap: SymbolRefMap;
  typeMap = new ResolvedTypeMap();
  inProgress: Set<ASTNode> = new Set();

  constructor(refMap: SymbolRefMap) {
    this.refMap = refMap;
  }

  private error(node: ASTNode, message: string) {
    return new TypeResolutionError(this, node, message);
  }

  resolveType(node: ASTNode, hint: BaseType | undefined): BaseType {
    if (this.inProgress.has(node)) {
      throw this.error(node, 'Detected cycle in type references');
    }
    let resolvedType: BaseType;
    if (!this.typeMap.has(node)) {
      this.inProgress.add(node);
      resolvedType = this.calculateType(node, hint);
      this.inProgress.delete(node);
      this.typeMap.set(node, resolvedType);
    } else {
      resolvedType = this.typeMap.get(node);
    }
    return resolvedType;
  }

  calculateType(node: ASTNode, hint: BaseType | undefined): BaseType {
    const { refMap } = this;
    switch (node.name) {
      case 'BooleanLiteral':
        return Intrinsics.bool;
      case 'NumberLiteral': {
        const { explicitType, numberType, value } = node.fields;
        if (explicitType) {
          const type = Intrinsics[explicitType as keyof typeof Intrinsics];
          if (!type) {
            throw this.error(
              node,
              `${explicitType} is not a known numeric type`
            );
          }
          return type;
        }
        if (hint instanceof NumericalType) {
          if (hint.interpretation === 'float') {
            return hint;
          } else if (Math.floor(value) === value) {
            // the literal might be a float literal, but it's equal to
            // its integer version, so it can just be an integer
            if (value < Math.pow(2, hint.numBytes * 8)) {
              // the literal number will fit into the hinted type
              return hint;
            } else {
              throw this.error(
                node,
                `${value} doesn't fit into a ${hint.name}`
              );
            }
          }
        }
        switch (numberType) {
          case NumberLiteralType.Float:
            return Intrinsics.f32;
          case NumberLiteralType.Integer:
            return Intrinsics.i32;
        }
        throw new Error('panic.');
      }
      case 'CharLiteral':
        return Intrinsics.u8;
      case 'DataLiteral':
        return new ArrayType(Intrinsics.u8, node.fields.value.length);
      case 'NamespacedRef':
      case 'SymbolRef': {
        const record = refMap.get(node);
        if (!record) {
          return Intrinsics.unknown;
        }
        const resolvedType = this.resolveType(record.declNode, hint);
        if (!resolvedType) {
          throw this.error(
            node,
            `Can't resolve type for symbol ${pretty(
              node
            )}, whose declaration hasn't had its type resolved`
          );
        }
        return resolvedType;
      }
      case 'TypeRef':
        if (isIntrinsicSymbol(node.fields.symbol)) {
          return Intrinsics[node.fields.symbol];
        }
        const record = refMap.get(node);
        if (record) {
          return this.resolveType(record.declNode, hint);
        }
        throw this.error(
          node,
          `TypeRef: Can't resolve type ${node.fields.symbol}`
        );
      case 'PointerTypeExpr':
        return new PointerType(
          this.resolveType(node.fields.pointerToExpr, hint)
        );
      case 'ArrayTypeExpr':
        return new ArrayType(
          this.resolveType(node.fields.valueTypeExpr, hint),
          node.fields.size
        );
      case 'CastExpr':
        return this.resolveType(node.fields.typeExpr, hint);
      case 'ExprStatement':
        return Intrinsics.void;
      case 'GlobalDecl':
      case 'RegStatement':
      case 'LetStatement': {
        if (!node.fields.typeExpr) {
          if (!node.fields.expr) {
            return Intrinsics.unknown;
          }
          return this.resolveType(node.fields.expr, hint);
        }

        let explicitType = this.resolveType(node.fields.typeExpr, hint);
        if (node.fields.expr) {
          // both an explicit type and an initializer expression
          // have been specified. Make sure they match.
          let exprType = this.resolveType(node.fields.expr, explicitType);
          if (!explicitType.equals(exprType)) {
            throw this.error(
              node,
              `${node.name} has explicit type ${explicitType.name} but is being initialized to incompatible type ${exprType.name}.`
            );
          }
        }
        return explicitType;
      }
      case 'IfStatement': {
        const thenType = this.resolveType(node.fields.thenBlock, hint);
        const elseType = this.resolveType(node.fields.elseBlock, hint);
        if (thenType === elseType) {
          return thenType;
        }
        return new UnionType([thenType, elseType]);
      }
      case 'WhileStatement':
      case 'Block':
        return Intrinsics.void;
      case 'BinaryExpr': {
        const { op, left, right } = node.fields;
        switch (op) {
          case BinOp.ARRAY_INDEX: {
            const leftType = this.resolveType(left, hint);
            if (leftType instanceof ArrayType) {
              return leftType.elementType;
            } else if (leftType instanceof PointerType) {
              return leftType.toType;
            }
            throw this.error(node, `Can't index into a ${leftType.name}`);
          }
          case BinOp.LESS_THAN:
          case BinOp.GREATER_THAN:
          case BinOp.EQUAL_TO:
          case BinOp.NOT_EQUAL_TO:
            return Intrinsics.bool;
          case BinOp.ASSIGN: {
            let leftType = this.resolveType(left, hint);
            const rightType = this.resolveType(right, hint);
            if (leftType === Intrinsics.unknown) {
              if (left.name === 'SymbolRef') {
                const ref = refMap.get(left);
                if (!ref) {
                  throw this.error(
                    node,
                    `Can't assign to undeclared symbol ${left.fields.symbol}`
                  );
                }
                leftType = rightType;
                this.typeMap.set(ref.declNode, leftType);
                this.typeMap.set(left, leftType);
              } else {
                throw this.error(
                  node,
                  `Can't assign to ${leftType.name}, and not smart enough yet to infer what it should be.`
                );
              }
            }
            if (leftType.equals(rightType)) {
              return leftType;
            }
            throw this.error(
              node,
              `Can't assign value of type ${rightType.name} to a ${leftType.name}`
            );
          }
          default: {
            const leftType = this.resolveType(left, hint);
            const rightType = this.resolveType(right, leftType);
            return this.getTypeForBinaryOp(node, op, leftType, rightType);
          }
        }
      }
      case 'CompilerCallExpr': {
        switch (node.fields.symbol) {
          case 'i32_trunc_f32_s':
            return Intrinsics.i32;
          case 'f64_floor':
          case 'f64_trunc':
          case 'f64_abs':
          case 'f64_sqrt':
          case 'f64_ceil':
          case 'f64_nearest':
            return Intrinsics.f64;
          case 'f32_floor':
          case 'f32_trunc':
          case 'f32_abs':
          case 'f32_sqrt':
          case 'f32_ceil':
          case 'f32_nearest':
            return Intrinsics.f32;
          case 'memory_fill':
            return Intrinsics.void;
          case 'memory_copy':
            return Intrinsics.void;
          case 'heap_start':
            return Intrinsics.i32;
          case 'heap_end':
            return Intrinsics.i32;
          case 'print':
            return Intrinsics.void;
          default:
            throw this.error(
              node,
              `Unrecognized internal ${node.fields.symbol}`
            );
        }
      }
      case 'CallExpr': {
        const funcType = this.resolveType(node.fields.left, hint);
        if (funcType instanceof FuncType) {
          const argListType = this.resolveType(
            node.fields.right,
            new TupleType(funcType.argTypes)
          );
          if (argListType instanceof TupleType) {
            if (argListType.elements.length !== funcType.argTypes.length) {
              throw this.error(
                node,
                `Function takes ${funcType.argTypes.length} args, but ${argListType.elements.length} were given`
              );
            }
            for (let i = 0; i < funcType.argTypes.length; i++) {
              const paramType = funcType.argTypes[i];
              const argType = argListType.elements[i].type;
              if (!argType.equals(paramType)) {
                throw this.error(
                  node,
                  `Expected ${paramType.name} for argument ${i + 1}, but got ${
                    argType.name
                  } instead`
                );
              }
            }
          } else {
            throw this.error(
              node,
              `Expected tuple type for arg list, but got: ${argListType.name}`
            );
          }
          return funcType.returnType;
        } else if (funcType instanceof TupleType) {
          return new PointerType(funcType);
        } else {
          throw this.error(
            node,
            `Can't call ${funcType.name} that is not a function`
          );
        }
      }
      case 'UnaryExpr': {
        const exprType = this.resolveType(node.fields.expr, hint);
        switch (node.fields.op) {
          case UnaryOp.ADDR_OF:
            return new PointerType(exprType);
          case UnaryOp.NEG: {
            if (
              exprType instanceof NumericalType &&
              exprType.sign === Sign.Signed
            ) {
              return exprType;
            }
            throw this.error(
              node,
              `Can't negate ${exprType.name}, which is not a signed float or int`
            );
          }
          case UnaryOp.LOGICAL_NOT: {
            if (exprType.equals(Intrinsics.bool)) {
              return Intrinsics.bool;
            }
            throw this.error(
              node,
              `Can't perform logical not on ${exprType.name}`
            );
          }
          default:
            throw this.error(
              node,
              `UnaryExpr: Don't know how to resolve type for unary operator ${node.fields.op}`
            );
        }
      }
      case 'ArrayLiteral': {
        const { size, elements } = node.fields;
        if (size) {
          if (
            isNumberLiteral(size) &&
            size.fields.numberType === 'int' &&
            size.fields.value >= 0
          ) {
            if (elements.length !== 1) {
              throw this.error(
                node,
                `When specifying a size, you can only have one element`
              );
            }
            return new ArrayType(
              this.resolveType(elements[0], hint),
              size.fields.value
            );
          } else {
            throw this.error(
              node,
              `Invalid size expression for array literal. Must be an integer number >= 0`
            );
          }
        }

        let type = Intrinsics.void;
        for (const [i, element] of elements.entries()) {
          const elemType = this.resolveType(element, hint);
          if (i == 0) {
            type = elemType;
          } else if (!elemType.equals(type)) {
            throw this.error(
              node,
              `Can't have an array with mixed types. Expected ${type.name}, found ${elemType.name}`
            );
          }
        }
        return new ArrayType(type, node.fields.elements.length);
      }
      case 'ExternFuncDecl':
      case 'FuncDecl': {
        let paramTypes = node.fields.parameters.fields.parameters.map((p) =>
          this.resolveType(p, hint)
        );
        let returnType: BaseType | null = node.fields.returnType
          ? this.resolveType(node.fields.returnType, hint)
          : null;
        if (isFuncDecl(node)) {
          let foundReturn = false;
          for (const child of preorderIter(node.fields.body)) {
            this.resolveType(child, hint);
            if (isReturnStatement(child)) {
              let alternativeReturnType = this.resolveType(child, hint);
              foundReturn = true;
              if (returnType === null) {
                returnType = alternativeReturnType;
              } else if (
                alternativeReturnType !== returnType &&
                alternativeReturnType.name !== returnType.name
              ) {
                throw this.error(
                  node,
                  `FuncDecl: can't resolve type for function ${node.fields.symbol}: return statements have varying types. Expected ${returnType.name}, found ${alternativeReturnType.name}`
                );
              }
            }
          }
          if (!foundReturn && returnType) {
            throw this.error(
              node,
              `FuncDecl: function ${node.fields.symbol} must return ${returnType.name} but has no return statements`
            );
          }
        }
        return new FuncType(paramTypes, returnType ?? Intrinsics.void);
      }
      case 'ArgList': {
        const argTypeHints =
          hint instanceof TupleType ? hint.elements.map((el) => el.type) : [];
        return new TupleType(
          node.fields.args.map((arg, i) =>
            this.resolveType(arg, argTypeHints[i])
          )
        );
      }
      case 'ParameterList':
        return new TupleType(
          node.fields.parameters.map((p) => this.resolveType(p, hint))
        );
      case 'Parameter':
        return this.resolveType(node.fields.typeExpr, hint);
      case 'ReturnStatement':
        return node.fields.expr
          ? this.resolveType(node.fields.expr, hint)
          : Intrinsics.void;
      case 'ModuleDecl':
      case 'File': {
        const props = new OrderedMap<string, BaseType>();
        for (const decl of node.fields.decls) {
          const declType = this.resolveType(decl, hint);
          if (decl.name === 'FuncDecl') {
            props.push(decl.fields.symbol, declType);
          }
        }
        return new RecordType(props);
      }
      case 'ExternDecl':
        return new RecordType(
          new OrderedMap([
            ...node.fields.funcs.map(
              (funcDecl) =>
                [funcDecl.fields.symbol, this.resolveType(funcDecl, hint)] as [
                  string,
                  BaseType
                ]
            ),
          ])
        );
      case 'TupleStructDecl':
        return new TupleType(
          node.fields.elements.map((el) => this.resolveType(el, hint))
        );
      case 'StructDecl':
        return new RecordType(
          new OrderedMap(
            node.fields.props.map((prop) => {
              if (isFuncDecl(prop)) {
                return [prop.fields.symbol, this.resolveType(prop, hint)];
              }
              return [
                prop.fields.symbol,
                this.resolveType(prop.fields.type, hint),
              ];
            })
          )
        );
      case 'StructProp':
        return this.resolveType(node.fields.type, hint);
      case 'StructLiteral': {
        const structDecl = refMap.get(node.fields.symbol)?.declNode;
        if (!structDecl) {
          throw new TypeError(
            `struct ${node.fields.symbol.fields.symbol} not found.`
          );
        }
        return this.resolveType(structDecl, hint);
      }
      case 'StructLiteralProp':
        return this.resolveType(node.fields.expr, hint);
      case 'MemberAccessExpr': {
        const { left, right } = node.fields;
        let leftType = this.resolveType(left, hint);
        if (leftType instanceof PointerType) {
          leftType = leftType.toType;
        }
        if (leftType instanceof RecordType) {
          const propName: string = getPropNameOrThrow(right);
          const propType = leftType.fields.get(propName);
          if (!propType) {
            throw this.error(
              right,
              `${propName} is not a valid accessor for ${leftType.name}`
            );
          }
          this.typeMap.set(right, propType.type);
          return propType.type;
        } else {
          throw this.error(
            right,
            `Don't know hot to do member access on a ${leftType.name}`
          );
        }
      }
    }
    throw this.error(node, `No type resolution exists for ${node as any}`);
  }

  private getTypeForBinaryOp(
    node: ASTNode,
    op: string,
    leftType: BaseType,
    rightType: BaseType
  ): BaseType {
    let { i32, f32, u32, u16, u8, bool } = Intrinsics;
    const error = this.error(
      node,
      `TypeError: Can't perform ${leftType} ${op} ${rightType}`
    );
    switch (op) {
      default:
        if (leftType === rightType) {
          return leftType;
        }
        switch (leftType) {
          case bool:
            switch (rightType) {
              case bool:
                return bool;
              default:
                throw error;
            }
          case i32:
            switch (rightType) {
              case u8:
              case u16:
              case u32:
              case i32:
                return i32;
              case f32:
                return f32;
              default:
                throw error;
            }
          case f32:
            switch (rightType) {
              case i32:
              case f32:
                return f32;
              default:
                throw error;
            }
          case u32:
            switch (rightType) {
              case i32:
                return u32;
              default:
                throw error;
            }
          case u8:
            switch (rightType) {
              case i32:
                return u8;
              default:
                throw error;
            }
          case u16:
            switch (rightType) {
              case i32:
                return u16;
              default:
                throw error;
            }
          default:
            throw error;
        }
    }
  }
}
