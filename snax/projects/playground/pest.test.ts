import { charCodes } from '../utils/iter.js';
import { lexer, PestParser } from './pest.js';
import * as debug from '../utils/debug.js';
describe('pest parser', () => {
  xtest('simple', () => {
    const input = 'foo = { "foo" }';
    for (const token of lexer.parse(charCodes(input))) {
      debug.log(token);
    }
    const root = PestParser.parseStr(input);
    if (!root) {
      fail();
    }
    expect(root.pretty()).toMatchSnapshot();
  });
});
