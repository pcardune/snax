import { ConstNFA } from '../nfa-to-dfa/nfa';
export { parseRegex } from '../regex-compiler/parser';
export { NFA } from '../nfa-to-dfa/nfa';
import ReactDOM from 'react-dom';
import NFATable from './components/NFATable';
import NFAGraph from './components/NFAGraph';
import React from 'react';
import { RegexNFA } from './components/RegexNFA';
import { GrammarPlayground } from './components/GrammarPlayground';
import { SnaxEditor } from './components/SnaxEditor';

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
export const render = {
  RegexNFA: wrap(RegexNFA),
  GrammarPlayground: wrap(GrammarPlayground),
  SnaxEditor: wrap(SnaxEditor),
};

export const grammars = {
  numbers: require('./grammars/numbers.grammar'),
  expressions: require('./grammars/expressions.grammar'),
  expressionLL1: require('./grammars/expressionLL1.grammar'),
};
