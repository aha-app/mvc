export function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (
    a != null &&
    b != null &&
    typeof a === 'object' &&
    typeof b === 'object'
  ) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    return (
      aKeys.length === bKeys.length &&
      aKeys.every(
        key =>
          (a as Record<string | number, unknown>)[key] ===
          (b as Record<string | number, unknown>)[key]
      )
    );
  }
  return false;
}
