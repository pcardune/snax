import { combine, Result } from 'neverthrow';
import { ParseNode } from '../../grammar/top-down-parser';
import { LexToken } from '../../lexer-gen/lexer-gen';
import { charCodes } from '../../utils/iter';
import { ParseNodeGraph } from './ParseNodeGraph';
import { logger } from '../../utils/debug';
import { useState } from 'react';
import { useDSLGrammar } from '../hooks/useDSLGrammar';
import { GrammarTable } from './GrammarTable';
import { LexerTable } from './LexerTable';

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
