import { NumberLiteral } from '../snax-ast';

describe('snax-ast', () => {
  describe('NumberLiterla', () => {
    const literal = new NumberLiteral(52);
    test('value should hold the value of the number', () => {
      expect(literal.value).toBe(52);
    });
  });
});
