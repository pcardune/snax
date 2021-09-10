import { combine, Result } from 'neverthrow';
import { ParseNode } from '@pcardune/snax/dist/grammar/top-down-parser';
import { LexToken } from '@pcardune/snax/dist/lexer-gen/lexer-gen';
import { charCodes } from '@pcardune/snax/dist/utils/iter';
import { ParseNodeGraph } from './ParseNodeGraph.js';
import { logger } from '@pcardune/snax/dist/utils/debug';
import { useState } from 'react';
import { useDSLGrammar } from '../hooks/getDSLGrammar.js';
import { GrammarTable } from './GrammarTable.js';
import { LexerTable } from './LexerTable.js';

type $TSFixMe = any;
function TokenList(props: { tokens: Result<LexToken<any>, any>[] }) {
  return (
    <ul>
      {props.tokens.map((t, i) => (
        <li key={i}>
          {t.isOk() ? `<${t.value.token}, ${t.value.substr}>` : `${t.error}`}
        </li>
      ))}
    </ul>
  );
}

function ParseTree(props: { root: ParseNode<any, LexToken<any>> }) {
  return (
    <div>
      {props.root.rule}
      {props.root.token?.toString()}
      <ul>
        {props.root.children.map((child, i) => (
          <li key={i}>
            <ParseTree root={child} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GrammarPlayground(props: {
  initialGrammar: string;
  initialContent: string;
}) {
  const [input, setInput] = useState(props.initialContent);

  const { lexer, parser, error } = useDSLGrammar(props.initialGrammar);

  const [parsedTokens, setParsedTokens] = useState<
    Result<LexToken<string>, any>[] | null
  >(null);
  const [parsedTree, setParsedTree] = useState<ParseNode<
    string,
    LexToken<string>
  > | null>(null);
  const [parseError, setParseError] = useState<any>(null);
  const onClickParse = () => {
    if (lexer && parser) {
      const parsedTokens = lexer.parse(charCodes(input)).catch().toArray();
      setParsedTokens(parsedTokens);

      let logs: string[] = [];
      const maybeParseTree = logger.capture(
        () =>
          parser.parseTokens(combine(parsedTokens).unwrapOr([]) as $TSFixMe),
        logs
      );
      if (maybeParseTree.isOk()) {
        if (maybeParseTree.value) {
          setParsedTree(maybeParseTree.value);
        }
      } else {
        setParseError(maybeParseTree.error);
      }
    }
  };

  return (
    <div>
      <strong>Tokens:</strong>
      {lexer && <LexerTable lexer={lexer} />}
      <strong>Grammar:</strong>
      {parser && <GrammarTable grammar={parser.grammar} lexer={lexer} />}
      <strong>Input:</strong>
      <div>
        <textarea value={input} onChange={(e) => setInput(e.target.value)} />
      </div>
      <button onClick={onClickParse}>Parse</button>
      {parsedTokens && (
        <div>
          Tokens:
          <TokenList tokens={parsedTokens} />
        </div>
      )}
      {parseError && <div>{parseError}</div>}
      {/* {parsedTree && <ParseTree root={parsedTree} />} */}
      {parsedTree && <ParseNodeGraph root={parsedTree} />}
    </div>
  );
}
