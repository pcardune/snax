import { err, Result } from 'neverthrow';

export function flatten<T, E1, E2>(
  result: Result<Result<T, E2>, E1>
): Result<T, E2 | E1> {
  if (result.isOk()) {
    return result.value;
  }
  return err(result.error);
}
