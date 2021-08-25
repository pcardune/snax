import { charCodes } from '../utils/iter';
import { lexer, PestParser } from './pest';
import * as debug from '../utils/debug';
describe('pest parser', () => {
  test('simple', () => {
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
