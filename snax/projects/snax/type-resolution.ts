import { OrderedMap } from '../utils/data-structures/OrderedMap.js';
import { BinaryOp, NumberLiteralType, UnaryOp } from './snax-ast.js';
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
import { SymbolRefMap } from './symbol-resolution.js';

type Fields<N> = N extends { fields: infer F } ? F : never;

class TypeResolutionError extends Error {
  node: ASTNode;
  constructor(node: ASTNode, message: string) {
    super(message);
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
    case BinaryOp.ARRAY_INDEX:
      if (leftType instanceof ArrayType) {
        return leftType.elementType;
      } else if (leftType instanceof PointerType) {
        return leftType.toType;
      }
      throw error;
    case BinaryOp.LESS_THAN:
    case BinaryOp.GREATER_THAN:
    case BinaryOp.EQUAL_TO:
    case BinaryOp.NOT_EQUAL_TO:
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
  const typeMap: ResolvedTypeMap = new ResolvedTypeMap();
  for (const node of depthFirstIter(root)) {
    resolveType(node, typeMap, refMap);
  }
  return typeMap;
}

function resolveType(
  node: ASTNode,
  typeMap: ResolvedTypeMap,
  refMap: SymbolRefMap
): BaseType {
  let resolvedType: BaseType;
  if (!typeMap.has(node)) {
    resolvedType = calculateType(node, typeMap, refMap);
    typeMap.set(node, resolvedType);
  } else {
    resolvedType = typeMap.get(node);
  }
  return resolvedType;
}
function calculateType(
  node: ASTNode,
  typeMap: ResolvedTypeMap,
  refMap: SymbolRefMap
): BaseType {
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
      const resolvedType = resolveType(record.declNode, typeMap, refMap);
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
        return resolveType(record.declNode, typeMap, refMap);
      }
      throw new TypeResolutionError(
        node,
        `TypeRef: Can't resolve type ${node.fields.symbol}`
      );
    case 'PointerTypeExpr':
      return new PointerType(
        resolveType(node.fields.pointerToExpr, typeMap, refMap)
      );
    case 'CastExpr':
      return resolveType(node.fields.typeExpr, typeMap, refMap);
    case 'ExprStatement':
      return Intrinsics.void;
    case 'GlobalDecl':
    case 'LetStatement': {
      if (node.fields.typeExpr) {
        let explicitType = resolveType(node.fields.typeExpr, typeMap, refMap);
        if (explicitType !== Intrinsics.unknown) {
          return explicitType;
        }
      }
      return resolveType(node.fields.expr, typeMap, refMap);
    }
    case 'IfStatement': {
      const thenType = resolveType(node.fields.thenBlock, typeMap, refMap);
      const elseType = resolveType(node.fields.elseBlock, typeMap, refMap);
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
        resolveType(node.fields.left, typeMap, refMap),
        resolveType(node.fields.right, typeMap, refMap)
      );
    case 'CallExpr': {
      const leftType = resolveType(node.fields.left, typeMap, refMap);
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
        case UnaryOp.DEREF:
          const exprType = resolveType(node.fields.expr, typeMap, refMap);
          if (exprType instanceof PointerType) {
            return exprType.toType;
          }
          throw new TypeResolutionError(
            node,
            `DEREF: Don't know the type when dereferencing a ${exprType.name}`
          );
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
        const elemType = resolveType(element, typeMap, refMap);
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
        resolveType(p, typeMap, refMap)
      );
      let returnType: BaseType | null = node.fields.returnType
        ? resolveType(node.fields.returnType, typeMap, refMap)
        : null;
      for (const child of depthFirstIter(node.fields.body)) {
        if (isReturnStatement(child)) {
          let alternativeReturnType = resolveType(child, typeMap, refMap);
          if (returnType === null) {
            returnType = alternativeReturnType;
          } else if (alternativeReturnType !== returnType) {
            throw new TypeResolutionError(
              node,
              `FuncDecl: can't resolve type for function ${node.fields.symbol}: return statements have varying types`
            );
          }
        }
      }
      return new FuncType(paramTypes, returnType ?? Intrinsics.void);
    }
    case 'ArgList':
      return new TupleType(
        node.fields.args.map((p) => resolveType(p, typeMap, refMap))
      );
    case 'ParameterList':
      return new TupleType(
        node.fields.parameters.map((p) => resolveType(p, typeMap, refMap))
      );
    case 'Parameter':
      return resolveType(node.fields.typeExpr, typeMap, refMap);
    case 'ReturnStatement':
      return node.fields.expr
        ? resolveType(node.fields.expr, typeMap, refMap)
        : Intrinsics.void;
    case 'File':
      return new RecordType(
        new OrderedMap([
          ...node.fields.funcs.map(
            (funcDecl) =>
              [
                funcDecl.fields.symbol,
                resolveType(funcDecl, typeMap, refMap),
              ] as [string, BaseType]
          ),
        ])
      );
    case 'ExternDecl':
      return new RecordType(
        new OrderedMap([
          ...node.fields.funcs.map(
            (funcDecl) =>
              [
                funcDecl.fields.symbol,
                resolveType(funcDecl, typeMap, refMap),
              ] as [string, BaseType]
          ),
        ])
      );
    case 'TupleStructDecl':
      return new TupleType(
        node.fields.elements.map((el) => resolveType(el, typeMap, refMap))
      );
    case 'StructDecl':
      return new RecordType(
        new OrderedMap(
          node.fields.props.map((prop) => {
            if (isFuncDecl(prop)) {
              return [prop.fields.symbol, resolveType(prop, typeMap, refMap)];
            }
            return [
              prop.fields.symbol,
              resolveType(prop.fields.type, typeMap, refMap),
            ];
          })
        )
      );
    case 'StructProp':
      return resolveType(node.fields.type, typeMap, refMap);
    case 'StructLiteral': {
      const structDecl = refMap.get(node.fields.symbol)?.declNode;
      if (!structDecl) {
        throw new TypeError(
          `struct ${node.fields.symbol.fields.symbol} not found.`
        );
      }
      return new PointerType(resolveType(structDecl, typeMap, refMap));
    }
    case 'StructLiteralProp':
      return resolveType(node.fields.expr, typeMap, refMap);
    case 'MemberAccessExpr': {
      const { left, right } = node.fields;
      const leftType = resolveType(left, typeMap, refMap);
      if (leftType instanceof PointerType) {
        if (leftType.toType instanceof TupleType) {
          if (right.name === 'NumberLiteral') {
            let index = right.fields.value;
            let elem = leftType.toType.elements[index];
            if (!elem) {
              throw new TypeResolutionError(
                node,
                `${index} is not a valid accessor for ${leftType.name}`
              );
            }
            return elem.type;
          }
          throw new TypeResolutionError(
            node,
            `${leftType.name} can only be accessed by index`
          );
        } else if (leftType.toType instanceof RecordType) {
          if (right.name === 'SymbolRef') {
            const propName = right.fields.symbol;
            const propType = leftType.toType.fields.get(propName);
            if (!propType) {
              throw new TypeResolutionError(
                node,
                `${propName} is not a valid accessor for ${leftType.name}`
              );
            }
            return propType.type;
          }
          throw new TypeResolutionError(
            node,
            `${leftType.name} can only be accessed by property names`
          );
        }
      }
      throw new TypeResolutionError(
        node,
        `Don't know how to do member access on a ${leftType.name}`
      );
    }
  }
  throw new TypeResolutionError(
    node,
    `No type resolution exists for ${(node as any).name}`
  );
}
