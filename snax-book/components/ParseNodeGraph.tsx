import { ParseNode } from '@pcardune/snax/dist/grammar/ParseNode';
import { LexToken } from '@pcardune/snax/dist/lexer-gen/LexToken';
import { CSSProperties } from 'react';
import Cytoscape from './Cytoscape.js';

const style = [
  {
    selector: 'node',
    style: {
      'background-color': '#fff',
      label: 'data(label)',
      'text-valign': 'center',
      'text-halign': 'center',
      'font-weight': 'bold',
      color: 'black',
      'border-style': 'solid',
      'border-width': '0px',
    },
  },
  {
    selector: 'node[?terminal]',
    style: {
      'font-weight': 'normal',
    },
  },
  {
    selector: 'edge',
    style: {
      width: 3,
      'line-color': '#000',
      'target-arrow-color': '#000',
      'target-arrow-shape': 'triangle',
      'text-valign': 'top',
      'text-margin-y': '-10px',
      'curve-style': 'bezier',
    },
  },
];

export function ParseNodeGraph(props: {
  root: ParseNode<any, LexToken<any>>;
  style?: CSSProperties;
}) {
  return (
    <Cytoscape
      style={{
        width: 400,
        height: 400,
        border: '2px solid #ddd',
        ...props.style,
      }}
      cyConfig={{
        layout: {
          name: 'breadthfirst',
          roots: [0],
          directed: true,
          maximal: true,
        },
        elements: getElementsForGraph(props.root),
        style,
      }}
    />
  );
}

function getElementsForGraph(root: ParseNode<any, LexToken<any>>) {
  let id = 0;
  let elements: any[] = [];

  function insertNode(node: typeof root) {
    let nodeId = id++;
    elements.push({
      group: 'nodes',
      data: {
        id: nodeId,
        label: node.rule || `"${node.token?.substr}"`,
        terminal: !!node.token,
      },
    });

    for (const child of node.children) {
      const childId = insertNode(child);
      elements.push({
        group: 'edges',
        data: {
          id: `${nodeId}-${childId}`,
          source: nodeId,
          target: childId,
        },
      });
    }
    return nodeId;
  }
  insertNode(root);
  return elements;
}
