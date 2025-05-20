import { useEffect, useRef } from 'react';

const disposeRegistry = new FinalizationRegistry((dispose: () => void) => {
  // Garbage collector cleaned up the `useRef` object; dispose of any resources it held
  dispose();
});

/**
 * Use this hook to create and initialize an object in time for the first render, and run cleanup
 * after the component is unmounted. Also handles the case where renders are abandoned before any
 * Effects are run.
 *
 * @param create a function to create an object. Can use any props or state in scope. Shouldn't rely
 * on DOM
 * @param dispose a **stable** function to dispose the object. Best to define it at the top level.
 * **Passing a different reference will dispose the object before the component unmounts.**
 *
 * @returns the object created on the first render
 */
export default function useLifecycleBoundObject<
  T extends {},
>(create: () => T, dispose: (object: T) => void): T {
  const objectRef = useRef<T | null>(null);
  if (objectRef.current == null) {
    // ok to write ref during render because this is idempotent
    const object = create();
    objectRef.current = object;
    // renders can be abandoned & components can be remounted in StrictMode/Concurrent Mode, without
    // any effects firing to tell us when an object created in the first render is no longer being
    // used. A FinalizationRegistry lets us _eventually_ catch when an old ref is disposed, and run
    // some cleanup. 2nd arg is value passed to FinalizationRegistry callback, 3rd arg lets us
    // unregister
    disposeRegistry.register(objectRef, () => dispose(object), objectRef);
  }

  useEffect(() => {
    // Component has mounted; no need for a FinalizationRegistry anymore, we can tie the object's
    // lifecycle to this Effect. `useEffect` is often the wrong choice but it's correct here bc
    // Effects are for synchronizing components with external systems.
    disposeRegistry.unregister(objectRef);
    return () => {
      if (objectRef.current) {
        dispose(objectRef.current);
      }
    };
  }, [dispose]);

  // okay to read ref during render because it's stable for the lifetime of the component
  return objectRef.current;
}
