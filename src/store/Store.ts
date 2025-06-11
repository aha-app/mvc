import { observable } from '@nx-js/observer-util';

/**
 * Creates a store. `react-easy-state` supports detecting whether this is called in a component and
 * wrapping with `useMemo` if so, but we don't (and shouldn't) use that, so it's unsupported here.
 * Can wrap in user-land.
 */
export function store<S extends object>(obj: S | (() => S)): S {
  return observable(typeof obj === 'function' ? obj() : obj);
}
