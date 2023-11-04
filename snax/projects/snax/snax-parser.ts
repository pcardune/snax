import type { ASTNode, Location } from './spec-gen.js';
import { err, ok, Result } from 'neverthrow';

import {
  parse,
  PeggySyntaxError as SyntaxError,
  type ParseOptions as PO,
} from './peggy/snax.js';
import { depthFirstIter } from './spec-util.js';
export { SyntaxError };

export type StartRule = PO['startRule'];
type ParseOptions = {
  includeLocations?: boolean;
  grammarSource?: string;
};

class AST {
  rootNode: ASTNode;
  constructor(rootNode: ASTNode) {
    this.rootNode = rootNode;
  }

  getNodeAtOffset(offset: number, { source }: { source?: string } = {}) {
    for (const node of depthFirstIter(this.rootNode)) {
      if (
        !node.location ||
        (source != null && node.location.source !== source)
      ) {
        continue;
      }
      if (
        node.location.start.offset <= offset &&
        node.location.end.offset >= offset
      ) {
        return node;
      }
    }
  }
}

export class SNAXParser {
  static parseStr(
    input: string,
    start: StartRule = 'start',
    options?: ParseOptions
  ): Result<AST, any> {
    try {
      return ok(new AST(SNAXParser.parseStrOrThrow(input, start, options)));
    } catch (e) {
      return err(e);
    }
  }

  static parseStrOrThrow(
    input: string,
    start: StartRule = 'start',
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
