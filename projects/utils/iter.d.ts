interface PeakableIterator<T> extends Iterator<T> {
    peek(): IteratorResult<T>;
}
declare class Peakable<T> implements PeakableIterator<T> {
    private iterator;
    private buffer;
    constructor(iterator: Iterator<T>);
    next(): IteratorResult<T>;
    peek(): IteratorResult<T>;
}
export declare function peakable<T>(it: Iterator<T>): Peakable<T>;
export declare function collect<T>(it: Iterator<T, T>): T[];
export declare function map<I, O>(it: Iterator<I>, map: (i: I) => O): IterableIterator<O>;
declare class CharCodeIterator implements IterableIterator<number> {
    private input;
    private index;
    constructor(input: string);
    next(): IteratorResult<number>;
    prefix(): string;
    suffix(): string;
    [Symbol.iterator](): this;
}
export declare function charCodes(input: string): CharCodeIterator;
declare class ConcatIterator<T> implements Iterator<T> {
    private iters;
    private index;
    constructor(...iters: Iterator<T>[]);
    next(): IteratorResult<T>;
}
export declare function concat<T>(...iters: Iterator<T>[]): ConcatIterator<T>;
export declare class RewindableIterator<T> implements IterableIterator<T> {
    private iter;
    private buffer;
    private index;
    constructor(iter: Iterator<T>);
    next(): IteratorResult<T>;
    reset(n: number): void;
    [Symbol.iterator](): this;
    get buffered(): number;
}
export declare class BacktrackableIterator<T> implements IterableIterator<T> {
    private iter;
    private buffer;
    constructor(iter: Iterator<T>);
    [Symbol.iterator](): this;
    next(): IteratorResult<T>;
    pushBack(item: T): void;
}
export declare function backtrackable<T>(iter: Iterator<T>): BacktrackableIterator<T>;
export declare function rewindable<T>(iter: Iterator<T>): RewindableIterator<T>;
export declare function iterable<T>(it: Iterator<T>): IterableIterator<T>;
export declare function range(start: number, end: number): Generator<number, void, unknown>;
export {};
//# sourceMappingURL=iter.d.ts.map