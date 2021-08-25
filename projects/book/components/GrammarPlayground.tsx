import { combine, Result } from 'neverthrow';
import { ParseNode } from '../../grammar/top-down-parser';
import { LexToken } from '../../lexer-gen/lexer-gen';
import * as dsl from '../../parser-gen/dsl';
import { charCodes } from '../../utils/iter';
import { ParseNodeGraph } from './ParseNodeGraph';
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
  const segments = [
    <div>
      <strong>Grammar:</strong>
      <pre>
        <code className="hljs">{props.initialGrammar}</code>
      </pre>
      <strong>Input:</strong>
      <pre>
        <code>{props.initialContent}</code>
      </pre>
    </div>,
  ];

  const parseTreeResult = dsl.parse(props.initialGrammar);
  if (parseTreeResult.isOk()) {
    const root = parseTreeResult.value;
    const maybeLexer = dsl.compileLexer(root);
    if (maybeLexer.isOk()) {
      const lexer = maybeLexer.value;
      const parsedTokens = lexer
        .parse(charCodes(props.initialContent))
        .catch()
        .toArray();
      segments.push(<TokenList tokens={parsedTokens} />);

      const maybeParser = dsl.compileGrammarToParser(root);
      if (maybeParser.isOk()) {
        const parser = maybeParser.value;
        const maybeParseTree = parser.parseTokens(
          combine(parsedTokens).unwrapOr([]) as $TSFixMe
        );
        if (maybeParseTree.isOk()) {
          if (maybeParseTree.value) {
            segments.push(<ParseTree root={maybeParseTree.value} />);
            segments.push(<ParseNodeGraph root={maybeParseTree.value} />);
          }
        } else {
          segments.push(
            <div>Failed parsing expression {'' + maybeParseTree.error}</div>
          );
        }
      } else {
        segments.push(
          <div>Failed compiling parser: {'' + maybeParser.error}</div>
        );
      }
    } else {
      segments.push(<div>Failed compiling lexer: {'' + maybeLexer.error}</div>);
    }
  } else {
    segments.push(<div>Failed parsing grammar</div>);
  }

  // const typescript = flatten(parseTreeResult.map(compileLexerToTypescript));

  return (
    <div>
      {...segments}
      {/* <pre>
        <code>{typescript.isOk() && typescript.value}</code>
      </pre>
      {parsedTokens.isOk() && <TokenList tokens={parsedTokens.value} />}
      {parseTreeResult.isOk() && <ParseTree root={parseTreeResult.value} />} */}
    </div>
  );
}
