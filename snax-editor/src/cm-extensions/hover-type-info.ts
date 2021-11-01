import { hoverTooltip } from '@codemirror/tooltip';
import { SNAXParser } from '@pcardune/snax/dist/snax/snax-parser';
import { ASTNode } from '@pcardune/snax/dist/snax/spec-gen';
import { depthFirstIter } from '@pcardune/snax/dist/snax/spec-util';
import { resolveSymbols } from '@pcardune/snax/dist/snax/symbol-resolution';
import { resolveTypes } from '@pcardune/snax/dist/snax/type-resolution';

function getNodeAtPos(ast: ASTNode, pos: number) {
  for (const node of depthFirstIter(ast)) {
    if (!node.location) {
      continue;
    }
    if (node.location.start.offset <= pos && node.location.end.offset >= pos) {
      return node;
    }
  }
}

const hoverTypeInfo = hoverTooltip((view, pos, side) => {
  const result = SNAXParser.parseStr(view.state.doc.sliceString(0));
  if (!result.isOk()) {
    return null;
  }
  const ast = result.value;
  if (ast.name !== 'File') {
    return null;
  }
  const smallestNode = getNodeAtPos(ast, pos);
  if (!smallestNode) {
    return null;
  }

  const { refMap } = resolveSymbols(ast);
  const typeCache = resolveTypes(ast, refMap);

  const type = typeCache.get(smallestNode);

  return {
    pos: smallestNode.location?.start.offset ?? pos,
    above: true,
    arrow: true,
    create(view) {
      let dom = document.createElement('div');
      dom.textContent = `${smallestNode.name}: ${type.name}`;
      return { dom };
    },
  };
});

export default hoverTypeInfo;
