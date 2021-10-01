import { OrderedMap } from '../utils/data-structures/OrderedMap.js';
import { BinOp, NumberLiteralType, UnaryOp } from './snax-ast.js';
import {
  ArrayType,
  BaseType,
  FuncType,
  Intrinsics,
  isIntrinsicSymbol,
  PointerType,
  RecordType,
  TupleType,
  UnionType,
} from './snax-types.js';
import { ASTNode, isFuncDecl, isReturnStatement } from './spec-gen.js';
import { depthFirstIter } from './spec-util.js';
import type { SymbolRefMap } from './symbol-resolution.js';

type Fields<N> = N extends { fields: infer F } ? F : never;

class TypeResolutionError extends Error {
  node: ASTNode;
  constructor(node: ASTNode, message: string) {
    super(`TypeResolutionError: ${message}`);
    this.node = node;
  }
}

export const getTypeForBinaryOp = (
  op: string,
  leftType: BaseType,
  rightType: BaseType
): BaseType => {
  let { i32, f32, bool: Bool } = Intrinsics;
  const error = new Error(
    `TypeError: Can't perform ${leftType} ${op} ${rightType}`
  );
  switch (op) {
    case BinOp.ARRAY_INDEX:
      if (leftType instanceof ArrayType) {
        return leftType.elementType;
      } else if (leftType instanceof PointerType) {
        return leftType.toType;
      }
      throw error;
    case BinOp.LESS_THAN:
    case BinOp.GREATER_THAN:
    case BinOp.EQUAL_TO:
    case BinOp.NOT_EQUAL_TO:
      return Intrinsics.bool;
    default:
      if (leftType === rightType) {
        return leftType;
      }
      switch (leftType) {
        case Bool:
          switch (rightType) {
            case Bool:
              return Bool;
            default:
              throw error;
          }
        case i32:
          switch (rightType) {
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
        default:
          throw error;
      }
  }
};

export class ResolvedTypeMap extends OrderedMap<ASTNode, BaseType> {
  get(key: ASTNode): BaseType {
    const type = super.get(key);
    if (!type) {
      throw new Error(`No type was bound to ${key.name}`);
    }
    return type;
  }
}

export function resolveTypes(root: ASTNode, refMap: SymbolRefMap) {
  const resolver = new TypeResolver(refMap);
  for (const node of depthFirstIter(root)) {
    resolver.resolveType(node);
  }
  return resolver.typeMap;
}

class TypeResolver {
  refMap: SymbolRefMap;
  typeMap = new ResolvedTypeMap();
  inProgress: Set<ASTNode> = new Set();

  constructor(refMap: SymbolRefMap) {
    this.refMap = refMap;
  }

  resolveType(node: ASTNode): BaseType {
    if (this.inProgress.has(node)) {
      throw new TypeResolutionError(node, 'Detected cycle in type references');
    }
    let resolvedType: BaseType;
    if (!this.typeMap.has(node)) {
      this.inProgress.add(node);
      resolvedType = this.calculateType(node);
      this.inProgress.delete(node);
      this.typeMap.set(node, resolvedType);
    } else {
      resolvedType = this.typeMap.get(node);
    }
    return resolvedType;
  }

  calculateType(node: ASTNode): BaseType {
    const { refMap } = this;
    switch (node.name) {
      case 'BooleanLiteral':
        return Intrinsics.bool;
      case 'NumberLiteral': {
        const { explicitType, numberType } = node.fields;
        if (explicitType) {
          const type = Intrinsics[explicitType as keyof typeof Intrinsics];
          if (!type) {
            throw new TypeResolutionError(
              node,
              `${explicitType} is not a known numeric type`
            );
          }
          return type;
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
      case 'SymbolRef': {
        const record = refMap.get(node);
        if (!record) {
          return Intrinsics.unknown;
          // throw new TypeResolutionError(
          //   node,
          //   `Can't resolve type for undeclard symbol ${node.fields.symbol}`
          // );
        }
        const resolvedType = this.resolveType(record.declNode);
        if (!resolvedType) {
          throw new TypeResolutionError(
            node,
            `Can't resolve type for symbol ${node.fields.symbol}, whose declaration hasn't had its type resolved`
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
          return this.resolveType(record.declNode);
        }
        throw new TypeResolutionError(
          node,
          `TypeRef: Can't resolve type ${node.fields.symbol}`
        );
      case 'PointerTypeExpr':
        return new PointerType(this.resolveType(node.fields.pointerToExpr));
      case 'CastExpr':
        return this.resolveType(node.fields.typeExpr);
      case 'ExprStatement':
        return Intrinsics.void;
      case 'GlobalDecl':
      case 'RegStatement':
      case 'LetStatement': {
        if (!node.fields.typeExpr) {
          if (!node.fields.expr) {
            throw new TypeResolutionError(
              node,
              `Can't resolve type for ${node.name} that doesn't have explicit type or initializer`
            );
          }
          return this.resolveType(node.fields.expr);
        }

        let explicitType = this.resolveType(node.fields.typeExpr);
        if (node.fields.expr) {
          // both an explicit type and an initializer expression
          // have been specified. Make sure they match.
          let exprType = this.resolveType(node.fields.expr);
          if (!explicitType.equals(exprType)) {
            throw new TypeResolutionError(
              node,
              `${node.name} has explicit type ${explicitType.name} but is being initialized to incompatible type ${exprType.name}.`
            );
          }
        }
        return explicitType;
      }
      case 'IfStatement': {
        const thenType = this.resolveType(node.fields.thenBlock);
        const elseType = this.resolveType(node.fields.elseBlock);
        if (thenType === elseType) {
          return thenType;
        }
        return new UnionType([thenType, elseType]);
      }
      case 'WhileStatement':
        return Intrinsics.void;
      case 'Block':
        return Intrinsics.void;
      case 'BinaryExpr':
        return getTypeForBinaryOp(
          node.fields.op,
          this.resolveType(node.fields.left),
          this.resolveType(node.fields.right)
        );
      case 'CallExpr': {
        const leftType = this.resolveType(node.fields.left);
        if (leftType instanceof FuncType) {
          return leftType.returnType;
        } else if (leftType instanceof TupleType) {
          return new PointerType(leftType);
        } else {
          throw new TypeResolutionError(
            node,
            "Can't call something that is not a function"
          );
        }
      }
      case 'UnaryExpr': {
        switch (node.fields.op) {
          case UnaryOp.ADDR_OF:
            const exprType = this.resolveType(node.fields.expr);
            return new PointerType(exprType);
          default:
            throw new TypeResolutionError(
              node,
              `UnaryExpr: Don't know how to resolve type for unary operator ${node.fields.op}`
            );
        }
      }
      case 'ArrayLiteral': {
        let type = Intrinsics.void;
        for (const [i, element] of node.fields.elements.entries()) {
          const elemType = this.resolveType(element);
          if (i == 0) {
            type = elemType;
          } else if (elemType !== type) {
            throw new TypeResolutionError(
              node,
              `Can't have an array with mixed types. Expected ${type.name}, found ${elemType.name}`
            );
          }
        }
        //new ArrayType(type, node.fields.elements.length)
        return new PointerType(type);
      }
      case 'FuncDecl': {
        let paramTypes = node.fields.parameters.fields.parameters.map((p) =>
          this.resolveType(p)
        );
        let returnType: BaseType | null = node.fields.returnType
          ? this.resolveType(node.fields.returnType)
          : null;
        for (const child of depthFirstIter(node.fields.body)) {
          if (isReturnStatement(child)) {
            let alternativeReturnType = this.resolveType(child);
            if (returnType === null) {
              returnType = alternativeReturnType;
            } else if (
              alternativeReturnType !== returnType &&
              alternativeReturnType.name !== returnType.name
            ) {
              throw new TypeResolutionError(
                node,
                `FuncDecl: can't resolve type for function ${node.fields.symbol}: return statements have varying types. Expected ${returnType.name}, found ${alternativeReturnType.name}`
              );
            }
          }
        }
        return new FuncType(paramTypes, returnType ?? Intrinsics.void);
      }
      case 'ArgList':
        return new TupleType(node.fields.args.map((p) => this.resolveType(p)));
      case 'ParameterList':
        return new TupleType(
          node.fields.parameters.map((p) => this.resolveType(p))
        );
      case 'Parameter':
        return this.resolveType(node.fields.typeExpr);
      case 'ReturnStatement':
        return node.fields.expr
          ? this.resolveType(node.fields.expr)
          : Intrinsics.void;
      case 'File':
        return new RecordType(
          new OrderedMap([
            ...node.fields.funcs.map(
              (funcDecl) =>
                [funcDecl.fields.symbol, this.resolveType(funcDecl)] as [
                  string,
                  BaseType
                ]
            ),
          ])
        );
      case 'ExternDecl':
        return new RecordType(
          new OrderedMap([
            ...node.fields.funcs.map(
              (funcDecl) =>
                [funcDecl.fields.symbol, this.resolveType(funcDecl)] as [
                  string,
                  BaseType
                ]
            ),
          ])
        );
      case 'TupleStructDecl':
        return new TupleType(
          node.fields.elements.map((el) => this.resolveType(el))
        );
      case 'StructDecl':
        return new RecordType(
          new OrderedMap(
            node.fields.props.map((prop) => {
              if (isFuncDecl(prop)) {
                return [prop.fields.symbol, this.resolveType(prop)];
              }
              return [prop.fields.symbol, this.resolveType(prop.fields.type)];
            })
          )
        );
      case 'StructProp':
        return this.resolveType(node.fields.type);
      case 'StructLiteral': {
        const structDecl = refMap.get(node.fields.symbol)?.declNode;
        if (!structDecl) {
          throw new TypeError(
            `struct ${node.fields.symbol.fields.symbol} not found.`
          );
        }
        return this.resolveType(structDecl);
      }
      case 'StructLiteralProp':
        return this.resolveType(node.fields.expr);
      case 'MemberAccessExpr': {
        const { left, right } = node.fields;
        let leftType = this.resolveType(left);
        if (leftType instanceof PointerType) {
          leftType = leftType.toType;
        }
        if (leftType instanceof TupleType) {
          if (right.name === 'NumberLiteral') {
            let index = right.fields.value;
            let elem = leftType.elements[index];
            if (!elem) {
              throw new TypeResolutionError(
                right,
                `${index} is not a valid accessor for ${leftType.name}`
              );
            }
            return elem.type;
          }
          throw new TypeResolutionError(
            right,
            `${leftType.name} can only be accessed by index`
          );
        } else if (leftType instanceof RecordType) {
          if (right.name === 'SymbolRef') {
            const propName = right.fields.symbol;
            const propType = leftType.fields.get(propName);
            if (!propType) {
              throw new TypeResolutionError(
                right,
                `${propName} is not a valid accessor for ${leftType.name}`
              );
            }
            return propType.type;
          }
          throw new TypeResolutionError(
            right,
            `${leftType.name} can only be accessed by property names`
          );
        } else {
          throw new TypeResolutionError(
            right,
            `Don't know hot to do member access on a ${leftType.name}`
          );
        }
      }
    }
    throw new TypeResolutionError(
      node,
      `No type resolution exists for ${(node as any).name}`
    );
  }
}
