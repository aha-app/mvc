import { useLayoutEffect } from 'react';

/** Replicates what React does when you attach a ref to a DOM element, but for arbitrary objects. */
export default function useManualRef<TTarget>(
  target: TTarget,
  ref: React.Ref<TTarget> | null | undefined,
  refName: string = 'ref'
) {
  // useLayoutEffect fires before useEffect, simulating how React attaches refs before running Effects
  useLayoutEffect(() => {
    if (ref) {
      if (typeof ref === 'function') {
        ref(target);
        return () => {
          ref(null);
        };
      } else if (ref.hasOwnProperty('current')) {
        // React.Ref type is a bit strict, MutableRefObject lets us actually modify the ref
        const mutableRef = ref as React.MutableRefObject<TTarget | null>;
        mutableRef.current = target;
        return () => {
          mutableRef.current = null;
        };
      } else {
        throw new Error(
          `${refName} must be passed the value provided by useRef() or useCallback().`
        );
      }
    }
  }, [target, ref]);
}
