import type { ASTNode } from './spec-gen.js';
import { err, ok, Result } from 'neverthrow';

import { parse, SyntaxError } from './peggy/snax.js';
export { SyntaxError };

type ParseOptions = {
  includeLocations?: boolean;
  grammarSource?: string;
};

export class SNAXParser {
  static parseStr(
    input: string,
    start: string = 'start',
    options?: ParseOptions
  ): Result<ASTNode, any> {
    try {
      return ok(SNAXParser.parseStrOrThrow(input, start, options));
    } catch (e) {
      return err(e);
    }
  }

  static parseStrOrThrow(
    input: string,
    start: string = 'start',
    options: ParseOptions = {}
  ): ASTNode {
    try {
      return parse(input, {
        includeLocations: true,
        grammarSource: '',
        ...options,
        startRule: start,
      });
    } catch (e) {
      if (e instanceof SyntaxError) {
        console.error(e.format([{ source: '', text: input }]));
      }
      throw e;
    }
  }
}
