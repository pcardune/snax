import { Parser } from '@pcardune/snax/dist/grammar/top-down-parser';
import * as dsl from '@pcardune/snax/dist/parser-gen/dsl';
import { logger } from '@pcardune/snax/dist/utils/debug';
import { useMemo } from 'react';
import { PatternLexer } from '@pcardune/snax/dist/lexer-gen/recognizer';
import { ParseNode } from '@pcardune/snax/dist/grammar/ParseNode';
import { LexToken } from '@pcardune/snax/dist/lexer-gen/LexToken';

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
