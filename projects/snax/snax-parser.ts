import * as spec from './spec-gen';
import { err, ok, Result } from 'neverthrow';

import { parse, SyntaxError } from './peggy/snax';

export class SNAXParser {
  static parseStr(
    input: string,
    start: string = 'start'
  ): Result<spec.ASTNode, any> {
    try {
      return ok(SNAXParser.parseStrOrThrow(input, start));
    } catch (e) {
      return err(e);
    }
  }

  static parseStrOrThrow(input: string, start: string = 'start'): spec.ASTNode {
    try {
      return parse(input, {
        startRule: start,
        grammarSource: '',
      });
    } catch (e) {
      if (e instanceof SyntaxError) {
        console.error(e.format([{ source: '', text: input }]));
      }
      throw e;
    }
  }
}
