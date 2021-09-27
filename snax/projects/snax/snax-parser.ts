import type { ASTNode } from './spec-gen.js';
import { err, ok, Result } from 'neverthrow';

import { parse, SyntaxError } from './peggy/snax.js';

export class SNAXParser {
  static parseStr(
    input: string,
    start: string = 'start'
  ): Result<ASTNode, any> {
    try {
      return ok(SNAXParser.parseStrOrThrow(input, start));
    } catch (e) {
      return err(e);
    }
  }

  static parseStrOrThrow(
    input: string,
    start: string = 'start',
    options: { includeLocations?: boolean; [key: string]: any } = {}
  ): ASTNode {
    options = {
      includeLocations: true,
      ...options,
      startRule: start,
      grammarSource: '',
    };
    try {
      return parse(input, options);
    } catch (e) {
      if (e instanceof SyntaxError) {
        console.error(e.format([{ source: '', text: input }]));
      }
      throw e;
    }
  }
}
