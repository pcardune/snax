import { combine, Result } from 'neverthrow';
import { ParseNode, Parser } from '../../grammar/top-down-parser';
import { LexToken } from '../../lexer-gen/lexer-gen';
import * as dsl from '../../parser-gen/dsl';
import { charCodes } from '../../utils/iter';
import { ParseNodeGraph } from './ParseNodeGraph';
import { logger } from '../../utils/debug';
import { useMemo, useState } from 'react';
import { PatternLexer } from '../../lexer-gen/recognizer';

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

  const { lexer, parser, error } = useMemo(() => {
    const parseTreeResult = dsl.parse(props.initialGrammar);
    let result: {
      lexer?: PatternLexer<string>;
      parser?: Parser<string, ParseNode<string, LexToken<string>>>;
      error?: any;
    } = {};
    if (parseTreeResult.isOk()) {
      const root = parseTreeResult.value;
      const maybeLexer = dsl.compileLexer(root);
      if (maybeLexer.isOk()) {
        result.lexer = maybeLexer.value;
        const logs: string[] = [];
        const maybeParser = logger.capture(
          () => dsl.compileGrammarToParser(parseTreeResult.value),
          logs
        );
        if (maybeParser.isOk()) {
          result.parser = maybeParser.value;
        } else {
          result.error = maybeParser.error;
        }
      } else {
        result.error = maybeLexer.error;
      }
    } else {
      result.error = parseTreeResult.error;
    }
    return result;
  }, [props.initialGrammar]);

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
      <strong>Grammar:</strong>
      <pre>
        <code className="hljs">{props.initialGrammar}</code>
      </pre>
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
