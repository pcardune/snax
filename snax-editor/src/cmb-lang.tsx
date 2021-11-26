import React from 'react';
import {
  Languages,
  AST,
  NodeSpec,
  Pretty,
  Node,
  PrimitiveGroup,
} from 'codemirror-blocks';
import { SNAXParser } from '@pcardune/snax/dist/snax/snax-parser.js';
import * as spec from '@pcardune/snax/dist/snax/spec-gen.js';
import { FieldSpec, nodes } from '@pcardune/snax/dist/snax/spec.js';
import { DropTarget } from 'codemirror-blocks/lib/components/DropTarget';
import { Literal } from 'codemirror-blocks/lib/nodes';

const toPos = ({ line, column }: { line: number; column: number }) => ({
  line: line - 1,
  ch: column - 1,
});

const toRange = (node: spec.ASTNode) => {
  if (!node.location) {
    return { from: { line: 0, ch: 0 }, to: { line: 0, ch: 0 } };
  }
  const { start, end } = node.location;
  return { from: toPos(start), to: toPos(end) };
};

// const getRenderFunc = (
//   nodeName: ASTNode['name']
// ): ((props: any) => void | React.ReactElement) => {
//   switch (nodeName) {
//     case 'File': {

//     }
//     default:
//       // eslint-disable-next-line react/display-name
//       return (props: any) => <Node {...props}>{nodeName}</Node>;
//   }
// };

type FieldsOf<T extends spec.ASTNode> = T['fields'];

type Foo<T extends spec.ASTNode> = Record<keyof FieldsOf<T>, number> & {
  __name: T['name'];
};

type DiscriminateUnion<T, K extends keyof T, V extends T[K]> = T extends Record<
  K,
  V
>
  ? T
  : never;
type MapDiscriminatedUnion<T extends Record<K, string>, K extends keyof T> = {
  [V in T[K]]: DiscriminateUnion<T, K, V>;
};

// type MapFields<T extends Record<'name', string>> = {
//   [V in T['name']]: IGenericNode<DiscriminateUnion<T, 'name', V>>;
// };

// type MapFields<T extends spec.ASTNode> = {
//   [V in T['name']]: Record<keyof DiscriminateUnion<T, 'name', V>['fields'], IGenericNode<ASTNode>>;
// };

type AsGenericNode<T> = T extends spec.ASTNode | spec.ASTNode[]
  ? IGenericNode<T>
  : T;

type MapFields<T extends spec.ASTNode> = {
  [V in T['name']]: (
    p: Record<keyof DiscriminateUnion<T, 'name', V>['fields'], AsGenericNode<T>>
  ) => any;
};

type Bar = MapFields<spec.BooleanLiteral>;
type Mapping = MapDiscriminatedUnion<spec.Expression, 'name'>;

const renderFuncs: Bar = {
  BooleanLiteral: (p) => p.value,
};
declare const f: Bar;
interface IGenericNode<T> extends AST.ASTNode {
  node: T;
}

abstract class GenericNode<T extends spec.ASTNode>
  extends AST.ASTNode
  implements IGenericNode<T>
{
  static spec = NodeSpec.nodeSpec([]);
  node: T;

  constructor(node: T) {
    const range = toRange(node);
    super(range.from, range.to, node.name, {});
    this.node = node;
    node.fields;

    const spec = nodes[node.name];
    const nodeSpecs = [NodeSpec.value('node')];
    for (const [fieldName, fieldSpec] of Object.entries(spec.fields || {})) {
      const { spec, astNode } = toNodeSpec(node, fieldName, fieldSpec);
      // (this as any)[fieldName] = astNode;
      nodeSpecs.push(spec);
    }
    this.spec = NodeSpec.nodeSpec(nodeSpecs);
  }
}

function makeNode<T extends spec.ASTNode>(node: T): AST.ASTNode {
  switch (node.name) {
    case 'File':
      return new FileNode(node);
    case 'FuncDecl':
      return new FuncDeclNode(node);
    case 'Block':
      return new BlockNode(node);
    case 'ReturnStatement':
      return new ReturnStatementNode(node);
    case 'NumberLiteral':
      return new NumberLiteralNode(node);
    case 'LetStatement':
      return new LetStatementNode(node);
    case 'SymbolRef':
      return new SymbolRefNode(node);
    default:
      return new UnknownNode(node);
  }
}

class UnknownNode extends GenericNode<spec.ASTNode> {
  constructor(node: spec.ASTNode) {
    super(node);
    this.spec = NodeSpec.nodeSpec([NodeSpec.value('node')]);
  }
  render(props: any) {
    return <Node {...props}>{this.node.name}</Node>;
  }
  pretty() {
    return Pretty.txt(this.node.name);
  }
}

class ReturnStatementNode extends GenericNode<spec.ReturnStatement> {
  expr: AST.ASTNode<AST.NodeOptions, {}>;
  constructor(node: spec.ReturnStatement) {
    super(node);
    this.expr = makeNode(node.fields.expr);
  }

  render(props: any) {
    return <Node {...props}>return {this.expr.reactElement()};</Node>;
  }
  pretty() {
    return Pretty.sepBy([
      Pretty.txt('return'),
      Pretty.horz(this.expr.pretty(), Pretty.txt(';')),
    ]);
  }
}

class LetStatementNode extends GenericNode<spec.LetStatement> {
  expr: AST.ASTNode<AST.NodeOptions, {}> | null;
  symbol: AST.ASTNode;
  typeExpr: AST.ASTNode<AST.NodeOptions, {}> | null;

  constructor(node: spec.LetStatement) {
    super(node);
    const { symbol } = node.fields;
    const range = toRange(node);
    range.from.ch += 'let '.length;
    range.to = range.from;
    range.to.ch += symbol.length;
    this.symbol = new Literal(range.from, range.to, symbol);
    this.expr = node.fields.expr ? makeNode(node.fields.expr) : null;
    this.typeExpr = node.fields.typeExpr
      ? makeNode(node.fields.typeExpr)
      : null;

    this.spec = NodeSpec.nodeSpec([
      NodeSpec.value('node'),
      NodeSpec.required('symbol'),
      NodeSpec.optional('expr'),
      NodeSpec.optional('typeExpr'),
    ]);
  }

  render(props: any) {
    return (
      <Node {...props}>
        let {this.symbol.reactElement()}
        {this.expr ? (
          <> = {this.expr.reactElement()}</>
        ) : (
          <DropTarget field="expr" />
        )}
        ;
      </Node>
    );
  }
  pretty() {
    if (this.expr) {
      return Pretty.sepBy([
        'let',
        this.symbol,
        '=',
        Pretty.horz(this.expr.pretty(), ';'),
      ]);
    }
    return Pretty.sepBy(['let', Pretty.horz(this.symbol, ';')]);
  }
}

class BlockNode extends GenericNode<spec.Block> {
  statements: AST.ASTNode<AST.NodeOptions, {}>[];
  constructor(node: spec.Block) {
    super(node);
    this.statements = node.fields.statements.map(makeNode);
  }
  render(props: any) {
    return (
      <Node {...props}>
        <div style={{ marginLeft: '2em' }}>
          {this.statements.map((statement, i) => (
            <div key={i}>
              <DropTarget field="statements" />
              {statement.reactElement()}
            </div>
          ))}
          <DropTarget field="statements" />
        </div>
      </Node>
    );
  }
  pretty() {
    return Pretty.vert(...this.statements.map((s) => s.pretty()));
  }
}

class NumberLiteralNode extends GenericNode<spec.NumberLiteral> {
  constructor(node: spec.NumberLiteral) {
    super(node);
    this.spec = NodeSpec.nodeSpec([NodeSpec.value('node')]);
  }
  render(props: any) {
    return (
      <Node {...props} normallyEditable={true}>
        {this.node.fields.value}
      </Node>
    );
  }
  pretty() {
    return Pretty.txt(String(this.node.fields.value));
  }
}

class SymbolRefNode extends GenericNode<spec.SymbolRef> {
  constructor(node: spec.SymbolRef) {
    super(node);
    this.spec = NodeSpec.nodeSpec([NodeSpec.value('node')]);
  }
  render(props: any) {
    return (
      <Node {...props} normallyEditable={true}>
        {this.node.fields.symbol}
      </Node>
    );
  }
  pretty() {
    return Pretty.txt(this.node.fields.symbol);
  }
}

class FuncDeclNode extends GenericNode<spec.FuncDecl> {
  symbol: string;
  body: AST.ASTNode;
  parameters: AST.ASTNode;
  returnType: AST.ASTNode<AST.NodeOptions, {}> | null;

  constructor(node: spec.FuncDecl) {
    super(node);
    this.symbol = node.fields.symbol;
    this.body = makeNode(node.fields.body);
    this.parameters = makeNode(node.fields.parameters);
    this.returnType = node.fields.returnType
      ? makeNode(node.fields.returnType)
      : null;
  }

  render(props: any) {
    return (
      <Node {...props}>
        <div>
          func {this.symbol}({this.parameters.reactElement()})
          {this.returnType ? <>:{this.returnType.reactElement()}</> : null}
          {' {'}
        </div>
        {this.body.reactElement()}
        <div>{'}'}</div>
      </Node>
    );
  }

  pretty() {
    return Pretty.vert(
      Pretty.horz(
        Pretty.sepBy(['func', this.node.fields.symbol], ' '),
        Pretty.txt('()'),
        ' ',
        '{'
      ),
      this.body.pretty(),
      '}'
    );
  }
}

class FileNode extends GenericNode<spec.File> {
  funcs: AST.ASTNode[];
  globals: AST.ASTNode[];
  decls: AST.ASTNode[];
  constructor(node: spec.File) {
    super(node);
    this.funcs = node.fields.funcs.map(makeNode);
    this.globals = node.fields.globals.map(makeNode);
    this.decls = node.fields.decls.map(makeNode);
  }

  render(
    props: any
  ): void | React.ReactElement<any, string | React.JSXElementConstructor<any>> {
    return (
      <Node {...props}>
        {this.funcs.map((func, i) => (
          <div key={i}>{func.reactElement()}</div>
        ))}
        <DropTarget field="funcs" />
      </Node>
    );
  }

  pretty() {
    return Pretty.vert(...this.funcs.map((f) => f.pretty()));
  }
}

function toNodeSpec(
  node: spec.ASTNode,
  fieldName: string,
  fieldSpec: FieldSpec
) {
  const fieldValue = (node.fields as any)[fieldName];
  if (nodes[fieldSpec.type]) {
    // this is another node
    if (fieldSpec.list) {
      const astNode = (fieldValue || []).map((fv: spec.ASTNode) =>
        makeNode(fv)
      );
      return { spec: NodeSpec.list(fieldName), astNode };
    } else if (fieldSpec.optional) {
      const astNode = fieldValue ? makeNode(fieldValue) : undefined;
      return { spec: NodeSpec.optional(fieldName), astNode };
    } else {
      if (!fieldValue) {
        console.error('node was', node);
        throw new Error(`${fieldName} is required but missing on ${node.name}`);
      }
      const astNode = makeNode(fieldValue);
      return { spec: NodeSpec.required(fieldName), astNode };
    }
  } else {
    // this is a static value
    return {
      spec: NodeSpec.value(fieldName),
      astNode: (node as any)[fieldName],
    };
  }
}

export default Languages.addLanguage({
  id: 'snax',
  name: 'Snax',
  description: 'the snax language',
  parse: (text: string): AST.AST => {
    console.log(`parsing:\n${text}`);
    const ast = SNAXParser.parseStrOrThrow(text);
    console.log('got ast', ast);
    return new AST.AST([makeNode(ast)]);
  },
  getExceptionMessage: (e: any) => e.message,
  primitivesFn: () => {
    return PrimitiveGroup.fromConfig('snax', {
      name: 'Test',
      primitives: ['func foo () {}'],
    });
  },
  getASTNodeForPrimitive: (primitive) => {
    if (primitive.name === 'func foo () {}') {
      return new FuncDeclNode(
        spec.makeFuncDecl(
          'foo',
          spec.makeParameterList([]),
          undefined,
          spec.makeBlock([])
        )
      );
    }
    throw new Error(`Unrecognized primitive ${primitive.name}`);
  },
});
