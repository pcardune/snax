import { lexer, parser, Rules, Token } from './numbers.__generated__';
import { ParseNode, SymbolsOf } from '../top-down-parser';
import { LexToken } from '../../lexer-gen/lexer-gen';
import { OrderedMap } from '../../utils/data-structures/OrderedMap';

type Symbols = SymbolsOf<typeof parser>;
type AttributeMap = OrderedMap<
  Symbols,
  ((node: ParseNode<Symbols, any>) => void)[]
>;

describe('attribute grammar', () => {
  test('processAttributes', () => {
    const attributes: AttributeMap = new OrderedMap([
      [
        Rules.Root,
        [
          (node) => {
            node.data = node.children[0].data;
          },
        ],
      ],
      [
        Rules.List,
        [
          (node) => {
            node.data = node.children[0].data + node.children[1].data * 2;
          },
          (node) => {
            node.data = node.children[0].data;
          },
          (node) => {
            node.data = 0;
          },
        ],
      ],
      [
        Rules.Bit,
        [
          (node) => {
            node.data = 0;
          },
          (node) => {
            node.data = 1;
          },
        ],
      ],
    ]);

    const tokens = lexer.parse('100101').toArray();
    expect(tokens.map((t) => t.toString())).toMatchInlineSnapshot(`
      Array [
        "<1>1</1>",
        "<0>0</0>",
        "<0>0</0>",
        "<1>1</1>",
        "<0>0</0>",
        "<1>1</1>",
      ]
    `);
    const root = parser.parseTokensOrThrow(tokens);
    processAttributes(root, attributes);
    // expect(root.toString()).toMatchInlineSnapshot(
    //   `"Root[List[Bit['1'], List[Bit['0'], List[Bit['0'], List[Bit['1'], List[Bit['0'], List[Bit['1'], List[]]]]]]]]"`
    // );
    expect(root.data).toEqual(41);
  });
});

function processAttributes(
  root: ParseNode<Symbols, LexToken<unknown>>,
  attributes: AttributeMap
) {
  for (const child of root.children) {
    processAttributes(child, attributes);
  }
  const attributesForRule = attributes.get(root.rule);
  if (attributesForRule) {
    const func = attributesForRule[root.variantIndex];
    if (func) {
      func(root);
    }
  }
}
