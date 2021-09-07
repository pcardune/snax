import { OrderedMap } from '../utils/data-structures/OrderedMap';
import { FuncDeclCompiler } from './ast-compiler';
import { getTypeForBinaryOp, NumberLiteralType, UnaryOp } from './snax-ast';
import {
  ArrayType,
  BaseType,
  FuncType,
  Intrinsics,
  PointerType,
  RecordType,
  TupleType,
  UnionType,
} from './snax-types';
import { ASTNode, isReturnStatement } from './spec-gen';
import { depthFirstIter } from './spec-util';
import { SymbolRefMap } from './symbol-resolution';

type Fields<N> = N extends { fields: infer F } ? F : never;

class TypeResolutionError extends Error {
  node: ASTNode;
  constructor(node: ASTNode, message: string) {
    super(message);
    this.node = node;
  }
}

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
    case 'StringLiteral':
      return new ArrayType(Intrinsics.u8, node.fields.value.length);
    case 'SymbolRef': {
      const record = refMap.get(node);
      if (!record) {
        throw new TypeResolutionError(
          node,
          `Can't resolve type for undeclard symbol ${node.fields.symbol}`
        );
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
      switch (node.fields.symbol) {
        case 'u8':
        case 'u16':
        case 'u32':
        case 'u64':
        case 'i8':
        case 'i16':
        case 'i32':
        case 'i64':
        case 'f32':
        case 'f64':
        case 'unknown':
          return Intrinsics[node.fields.symbol];
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
        if (i == 0) {
          type = resolveType(element, typeMap, refMap);
        } else if (resolveType(element, typeMap, refMap) !== type) {
          throw new TypeResolutionError(
            node,
            "Can't have an array with mixed types."
          );
        }
      }
      return new ArrayType(type, node.fields.elements.length);
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
  }
  throw new TypeResolutionError(node, `No type resolution exists for ${node}`);
}
