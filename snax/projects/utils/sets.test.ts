import { MultiSet, NumberSet } from './sets.js';

describe('NumberSet', () => {
  test('equals', () => {
    expect(new NumberSet([1, 2, 3]).equals(new NumberSet([3, 1, 2]))).toBe(
      true
    );
    expect(new NumberSet([1, 2, 4]).equals(new NumberSet([1, 2, 3]))).toBe(
      false
    );
    expect(new NumberSet([1, 2, 4]).equals(new NumberSet([1, 2, 4, 5]))).toBe(
      false
    );
    expect(new NumberSet([1, 2, 4]).equals(new NumberSet([1, 2]))).toBe(false);
  });

  test('hash', () => {
    expect(new NumberSet([6, 2, 7, 3]).hash()).toBe('{2,3,6,7}');
  });
});

describe('MultiSet', () => {
  test('has', () => {
    let a = new NumberSet([1, 2, 3]);
    let b = new NumberSet([3, 1, 2]);
    let multi = new MultiSet([a]);
    expect(multi.has(b)).toBe(true);
  });
  test('add', () => {
    let a = new NumberSet([1, 2, 3]);
    let b = new NumberSet([3, 1, 2]);
    let c = new NumberSet([4, 5, 1]);
    let multi = new MultiSet([a]);
    expect(multi.size).toBe(1);
    multi.add(b);
    expect(multi.size).toBe(1);
    multi.add(c);
    expect(multi.size).toBe(2);
  });
  test('delete', () => {
    let a = new NumberSet([1, 2, 3]);
    let b = new NumberSet([4, 1, 2]);
    let multi = new MultiSet([a, b]);
    expect(multi.size).toBe(2);
    multi.delete(a);
    expect(multi.size).toBe(1);
    expect(multi.has(a)).toBe(false);
  });
});
