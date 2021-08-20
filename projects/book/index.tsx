import { ConstNFA } from '../nfa-to-dfa/nfa';
export { parseRegex } from '../regex-compiler/parser';
export { NFA } from '../nfa-to-dfa/nfa';
import ReactDOM from 'react-dom';
import NFATable from './components/NFATable';
import NFAGraph from './components/NFAGraph';
import React from 'react';
import { RegexNFA } from './components/RegexNFA';

function getContainerEl(container: string | HTMLElement) {
  if (typeof container == 'string') {
    const el = document.getElementById(container);
    if (!el) {
      throw new Error(`did not find element with id ${container}`);
    }
    return el;
  }
  if (container instanceof HTMLScriptElement) {
    const div = document.createElement('div');
    container.parentNode?.insertBefore(div, container);
    return div;
  }

  return container;
}

export function renderNFAGraph(
  containerId: string | HTMLElement,
  props: React.ComponentProps<typeof NFAGraph>
) {
  ReactDOM.render(<NFAGraph {...props} />, getContainerEl(containerId));
}

export function renderNFATable(container: string | HTMLElement, nfa: ConstNFA) {
  ReactDOM.render(<NFATable nfa={nfa} />, getContainerEl(container));
}

function wrap(Component: any) {
  return (props: any, container?: string | HTMLElement) => {
    ReactDOM.render(
      <div
        onKeyDown={(e) => {
          // hack to work around the keydown handler
          // used to navigate between chapters.
          e.stopPropagation();
        }}
      >
        <Component {...props} />
      </div>,
      getContainerEl(container || (document.currentScript as HTMLScriptElement))
    );
  };
}

export const renderRegexNFA = wrap(RegexNFA);

// const reInput = document.getElementById('re');
// reInput.value = '[ab]c*d';
// const cy = cytoscape({
//   container: document.getElementById('cy'),
//   elements: getElementsForRegex(reInput.value),
//   style: [
//     // the stylesheet for the graph
//     {
//       selector: 'node',
//       style: {
//         'background-color': '#666',
//         label: 'data(id)',
//         'text-valign': 'center',
//         'text-halign': 'center',
//         color: 'white',
//       },
//     },
//     {
//       selector: 'node[?start]',
//       style: { 'background-color': '#00f' },
//     },
//     {
//       selector: 'node[?accepting]',
//       style: { 'background-color': '#0a0' },
//     },
//     {
//       selector: 'edge',
//       style: {
//         width: 3,
//         label: 'data(label)',
//         'line-color': '#ccc',
//         'target-arrow-color': '#ccc',
//         'target-arrow-shape': 'triangle',
//         'text-valign': 'top',
//         'curve-style': 'bezier',
//       },
//     },
//   ],

//   layout: {
//     name: 'grid',
//     rows: 1,
//   },
// });
// cy.layout({ name: 'cose', animate: false }).run();
// reInput.addEventListener('keyup', (e) => {
//   if (e.target.value) {
//     const elements = getElementsForRegex(e.target.value);
//     cy.remove('node');
//     cy.add(elements);
//     cy.layout({ name: 'cose', animate: false }).run();
//   }
// });

// window.cy = cy;
