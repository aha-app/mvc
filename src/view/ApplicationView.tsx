import React, { useSyncExternalStore } from 'react';
import { observe, unobserve } from '@nx-js/observer-util';
import useLifecycleBoundObject from '../utils/useLifecycleBoundObject.ts';

/**
 * Heavily adapted from https://github.com/mobxjs/mobx/blob/main/packages/mobx-react-lite/src/useObserver.ts
 * Implements `subscribe` and `getSnapshot` for use with `useSyncExternalStore`.
 */
class ViewStore<Fn extends (...params: Array<any>) => any> {
  private dummy = 0;
  private subscriber: (() => void) | null = null;
  private reaction: Fn | null = null;
  private fn: Fn;

  constructor(fn: Fn) {
    this.fn = fn;
  }

  /** The result of calling observe() on a render function. */
  getReaction(): Fn {
    if (this.reaction == null) {
      this.reaction = this.createReaction();
    }
    return this.reaction;
  }

  /**
   * Wires up a `subscriber` function to be called any time part of a store accessed in `this.fn`
   * has changed, and returns a cleanup function.
   */
  subscribe = (subscriber: () => void): (() => void) => {
    this.subscriber = subscriber;

    if (this.reaction == null) {
      // We've lost our reaction, probably due to the subscription (which is really an Effect under the hood)
      // being run twice and disposing it in the unsubscribe function.
      // Effects should always be symmetric—anything destroyed in the cleanup needs to be created in the setup.
      this.reaction = this.createReaction();
      // Since we lost the reaction, we aren't tracking anything, so we need to rerender to re-track to receive updates.
      this.dummy += 1;
      subscriber();
    }

    // If a store changes between the render and the subscription, React will check getSnapshot() and catch it.

    return () => {
      // cleanup when no longer used. Might already be disposed by `useLifecycleBoundObject`
      this.subscriber = null;
      this.dispose();
    };
  };

  /*
   * This is the value that useSyncExternalStore "sees"—we've wired it up to change anytime a store
   * changes in a way that's relevant to this component. We're still really reading from a mutable
   * store during render, but this disables time-slicing as needed.
   */
  getSnapshot = () => this.dummy;

  // idempotent
  dispose() {
    if (this.reaction) {
      unobserve(this.reaction);
      this.reaction = null;
    }
  }

  private createReaction(): Fn {
    return observe(this.fn, {
      scheduler: () => {
        this.dummy += 1; // need to increment even if no subscriber yet
        this.subscriber?.(); // may have disposed already, no-op
      },
      lazy: true,
    });
  }
}

export type FCLike<TProps, TRef = any> =
  | React.FC<TProps>
  | React.ForwardRefRenderFunction<TRef, TProps>;

/**
 * All components that reference observable stores, either directly or through props, should be
 * wrapped in View() so that they rerender when the store fields they access are changed.
 *
 * Heavily adapted from https://github.com/mobxjs/mobx/blob/main/packages/mobx-react-lite/src/useObserver.ts
 */
export default function View<TProps, TRef = unknown>(Component: FCLike<TProps, TRef>) {
  // for `useLifecycleBoundObject`, stable identity
  const disposeViewStore = (viewStore: ViewStore<any>) => viewStore.dispose();

  // forwardRef() allows passing <View ref={...}> down to the wrapped component
  const ReactiveComponent = React.forwardRef(
    (props: React.PropsWithoutRef<TProps>, ref: React.ForwardedRef<TRef>) => {
      // `viewStore` is created on the first render and cleaned up either after component unmounts
      // or, if the render is abandoned, when resources are GC'd.
      const viewStore = useLifecycleBoundObject(
        () => new ViewStore(Component),
        disposeViewStore
      );

      // force component to rerender when relevant fields of store change
      const _dummy = useSyncExternalStore(
        viewStore.subscribe,
        viewStore.getSnapshot,
        // MobX includes the server-side rendering snapshot, we may not need it but doesn't hurt
        viewStore.getSnapshot
      );

      // run the reactive render instead of the original one. `getReaction` is idempotent, safe to
      // call during render
      const render = viewStore.getReaction();
      return render(props as TProps, ref); // harmless cast required for forwardRef
    }
  );
  ReactiveComponent.displayName = `View(${Component.displayName ?? Component.name})`;

  return React.memo(ReactiveComponent);
}
