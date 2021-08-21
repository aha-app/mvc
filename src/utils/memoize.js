const memoized = new WeakMap();
/**
 * Memoize a value for an object. This is useful for immer immutable objects
 * that want to generate a memoized value that does not get copied for newly
 * produced objects
 *
 * ```
 * class Something
 *   [immerable] = true;
 *
 *   constructor() {
 *     this.merges = [];
 *   }
 *
 *   expensiveCalculation() {
 *     return memoize(this, 'expensiveCalculation', () => doCalculation());
 *   }
 *
 *   merge(other) {
 *     return produce(this, draft => { draft.merges.push(other) });
 *   }
 * }
 *
 * const something1 = new Something();
 * const calc1 = something1.expensiveCalculation();
 * const something2 = something1.merge(new Something());
 * calc1 === something.expensiveCalculation(); // true
 * calc1 === something2.expensiveCalculation(); // false
 * ```
 *
 * @template T
 * @param {object} object
 * @param {string} key
 * @param {(() => T)} value
 * @returns {T}
 */
export function memoize(object, key, value) {
  if (!memoized.has(object)) {
    memoized.set(object, new Map());
  }
  const map = memoized.get(object);
  if (!map.has(key)) {
    map.set(key, value());
  }
  return map.get(key);
}
