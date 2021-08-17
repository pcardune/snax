export function memoize<D>(init: () => D): () => D {
  let cached: D | undefined = undefined;
  return () => {
    if (cached === undefined) {
      cached = init();
    }
    return cached;
  };
}
