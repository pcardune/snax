import React from 'react';
import { Languages, AST, NodeSpec, Pretty, Node } from 'codemirror-blocks';
import { SNAXParser } from '@pcardune/snax/dist/snax/snax-parser.js';
import { ASTNode } from '@pcardune/snax/dist/snax/spec-gen.js';
import { FieldSpec, nodes } from '@pcardune/snax/dist/snax/spec.js';

const toPos = ({ line, column }: { line: number; column: number }) => ({
  line: line - 1,
  ch: column - 1,
});

const toRange = (node: ASTNode) => {
  if (!node.location) {
    throw new Error(`node doesn't have location`);
  }
  const { start, end } = node.location;
  return { from: toPos(start), to: toPos(end) };
};

class GenericNode extends AST.ASTNode {
  // private node: ASTNode;
  static spec = NodeSpec.nodeSpec([]);
  foo: null;

  constructor(node: ASTNode) {
    const range = toRange(node);
    super(range.from, range.to, node.name, {});
    // this.node = node;
    this.foo = null;

    const spec = nodes[node.name];
    const nodeSpecs = [];
    for (const [fieldName, fieldSpec] of Object.entries(spec.fields || {})) {
      const { spec, astNode } = toNodeSpec(node, fieldName, fieldSpec);
      (this as any)[fieldName] = astNode;
      nodeSpecs.push(spec);
    }

    this.spec = NodeSpec.nodeSpec(nodeSpecs);
  }

  render(props: any) {
    return <Node {...props}>hello</Node>;
  }

  pretty() {
    return Pretty.txt('123;');
  }
}

function toNodeSpec(node: ASTNode, fieldName: string, fieldSpec: FieldSpec) {
  if (nodes[fieldSpec.type]) {
    // this is another node
    const astNode = new GenericNode((node as any)[fieldName]);
    if (fieldSpec.list) {
      return { spec: NodeSpec.list(fieldName), astNode };
    } else if (fieldSpec.optional) {
      return { spec: NodeSpec.optional(fieldName), astNode };
    } else {
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
    const ast = SNAXParser.parseStrOrThrow(text);
    console.log('got ast', ast);
    return new AST.AST([new GenericNode(ast)]);
  },
  getExceptionMessage: (e: any) => e.message,
  // primitivesFn: () => {
  //   return PrimitiveGroup.fromConfig('example', {
  //     name: 'Test',
  //     primitives: ['343'],
  //   });
  // },
});
