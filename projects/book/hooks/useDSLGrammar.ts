import { ParseNode, Parser } from '../../grammar/top-down-parser';
import { LexToken } from '../../lexer-gen/lexer-gen';
import * as dsl from '../../parser-gen/dsl';
import { logger } from '../../utils/debug';
import { useMemo } from 'react';
import { PatternLexer } from '../../lexer-gen/recognizer';

export function useDSLGrammar(dslInput: string) {
  return useMemo(() => {
    const parseTreeResult = dsl.parse(dslInput);
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
  }, [dslInput]);
}
