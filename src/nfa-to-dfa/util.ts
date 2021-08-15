/**
 * Convert a string to a charcode, unless it is already a charcode,
 * in which case just return the char code.
 */
export function toCharCode(s: number | string): number {
  if (typeof s == 'string') {
    if (s.length != 1) {
      throw new Error(
        'Can only convert strings of length 1 to charCode. Given: ' + s
      );
    }
    return s.charCodeAt(0);
  }
  return s;
}
