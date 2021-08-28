import { useMemo, useState } from 'react';
import { BacktrackFreeGrammar } from '../../dist/grammar/grammar';
import { LL1Parser } from '../../dist/grammar/LL1-parser';
import { ParseNode } from '../../dist/grammar/top-down-parser';
import { LexToken } from '../../dist/lexer-gen/lexer-gen';
import { PatternLexer } from '../../dist/lexer-gen/recognizer';
import { GrammarLike, useGrammar } from '../hooks/useGrammar';
import { ParseNodeGraph } from './ParseNodeGraph';
import { Table, THead, TBody, Th, Tr, Td } from './Table';

type GeneratorYield<T> = T extends Generator<infer Y> ? Y : never;
type Result<I> = I extends IteratorResult<infer T> ? T : never;

function Collected(props: { collected: any[] }) {
  const last = props.collected[props.collected.length - 1];
  const els = [];
  let i = 0;
  for (const item of props.collected) {
    if (item instanceof LexToken) {
      els.push(<span key={i++}>&quot;{item.substr}&quot;</span>);
    } else if (item instanceof ParseNode) {
      els.push(<ParseNodeGraph key={i++} root={item} />);
    } else {
      els.push(<span key={i++}>?</span>);
    }
  }
  return <>{els}</>;
}

export function LL1ParserUI(props: {
  grammar: GrammarLike;
  start: string;
  input: string;
}) {
  const grammar = useGrammar(props.grammar);
  const gen = useMemo(() => {
    const freegrammar = new BacktrackFreeGrammar(grammar, props.start);
    const terminals = [...freegrammar.getTerminals()].filter(
      (t) => typeof t === 'string'
    ) as string[];
    const lexer = PatternLexer.forCharSequences(new Set(terminals));
    const parser = new LL1Parser(freegrammar, props.start);
    const tokens = lexer.parse(props.input);
    return parser.parseGen(tokens);
  }, [props.input, props.start, grammar]);

  const [genState, setGenState] = useState(gen.next());
  type GenType = GeneratorYield<ReturnType<LL1Parser<string, any>['parseGen']>>;
  const [parseStates, setParseStates] = useState<GenType[]>([
    genState.value as GenType,
  ]);
  const onClickAdvance = () => {
    if (!genState.done) {
      const next = gen.next();
      if (!next.done) {
        setParseStates([...parseStates, next.value]);
      }
      setGenState(next);
    }
  };
  const onClickFinish = () => {
    if (!genState.done) {
      let next;
      const states = [...parseStates];
      do {
        next = gen.next();
        if (!next.done) {
          states.push(next.value);
        }
      } while (!next.done);
      setParseStates(states);
      setGenState(next);
    }
  };
  return (
    <div>
      <Table>
        <THead>
          <Tr>
            <Th>Step</Th>
            <Th>Focus</Th>
            <Th>Word</Th>
            <Th>Stack</Th>
            <Th>Collected</Th>
          </Tr>
        </THead>
        <TBody>
          {parseStates.map((state, i) => (
            <Tr key={i}>
              <Td style={{ textAlign: 'center' }}>{i}</Td>
              <Td>{state.focus.symbol}</Td>
              <Td>{state.word.substr}</Td>
              <Td>{state.stack.map((s) => String(s.symbol)).join(', ')}</Td>
              <Td>
                <Collected collected={state.collected} />
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
      {!genState.done && <button onClick={onClickAdvance}>Advance</button>}
      {!genState.done && <button onClick={onClickFinish}>Finish</button>}
    </div>
  );
}
