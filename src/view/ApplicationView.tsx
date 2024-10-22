import * as React from 'react';
import { observe, unobserve } from '@nx-js/observer-util';

const { useSyncExternalStore, useRef } = React;

const isReact18 = useSyncExternalStore != null;

const reactionRegistry = new FinalizationRegistry(
  (viewStore: ViewStore<any>) => {
    viewStore.dispose();
  }
);

/**
 * Heavily adapted from https://github.com/mobxjs/mobx/blob/main/packages/mobx-react-lite/src/useObserver.ts
 */
class ViewStore<out Fn extends (...params: Array<any>) => any> {
  dummy = 0;
  subscriber: (() => void) | null = null;
  // reaction: React.FC<Props> | null = null;
  reaction: Fn | null = null;
  // Component: React.FC<Props>;
  fn: Fn;

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

  subscribe = (subscriber: () => void): (() => void) => {
    // matches 3rd arg in reactionRegistry.register() below. The FinalizationRegistry doesn't need
    // to handle cleanup because we're tracking it now and will handle it in the cleanup function below.
    reactionRegistry.unregister(this);

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
      // cleanup when no longer used
      this.dispose();
    };
  };

  // This is the value that useSyncExternalStore "sees"—we've wired it up to
  // change anytime a store changes in a way that's relevant to this component.
  // We're still really reading from a mutable store during render, but this
  // disables time-slicing as needed.
  getSnapshot = () => this.dummy;

  dispose() {
    this.subscriber = null;
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

type FCLike<Props> =
  | React.FC<Props>
  | React.ForwardRefRenderFunction<unknown, Props>;

function isFunctionComponent<Props extends {}>(
  Component: React.ComponentClass<Props> | FCLike<Props>
): Component is FCLike<Props> {
  return !(Component.prototype && Component.prototype.isReactComponent);
}

/**
 * All components that reference observable stores, either directly or through props, should be
 * wrapped in View() so that they rerender when the store fields they access are changed.
 *
 * Heavily adapted from https://github.com/mobxjs/mobx/blob/main/packages/mobx-react-lite/src/useObserver.ts
 */
export default function View<Props extends {}, TRef>(
  Component:
    | React.ComponentClass<Props>
    | FCLike<Props>
): React.FunctionComponent<React.PropsWithRef<Props>> {
  if (isFunctionComponent(Component)) {
    const ReactiveComponent = React.forwardRef((props: Props, ref) => {
      const viewStoreRef = useRef<ViewStore<typeof Component> | null>(null);
      if (viewStoreRef.current == null) {
        // ok to write ref during render since this is idempotent
        viewStoreRef.current = new ViewStore(Component);
        // renders can be abandoned & components can be remounted in StrictMode/Concurrent Mode, without any
        // effects firing to tell us when a ViewStore is no longer being used. A FinalizationRegistry
        // lets us _eventually_ catch when an old ref is disposed, and run some cleanup.
        // 2nd arg is value passed to FinalizationRegistry callback, 3rd arg lets us unregister
        reactionRegistry.register(
          viewStoreRef,
          viewStoreRef.current,
          viewStoreRef.current
        );
      }
      const viewStore = viewStoreRef.current;

      // force component to rerender when relevant fields of store change
      const _dummy = useSyncExternalStore(
        viewStore.subscribe,
        viewStore.getSnapshot,
        // MobX includes the server snapshot, we may not need it but doesn't hurt
        viewStore.getSnapshot
      );

      // run the reactive render instead of the original one, idempotent
      const render = viewStore.getReaction();
      return render(props, ref);
    });
    ReactiveComponent.displayName = `View(${Component.displayName ?? Component.name ?? 'Component'})`;
    // TODO: Fix or ignore this type error
    return React.memo(ReactiveComponent);
  }

  // Same thing, except for class components, though we don't seem to be wrapping any class
  // components in aha-app. Doesn't prevent tearing, since class components can't use
  // `useSyncExternalStore`. The original plan was to render the class component under a function
  // component similar to the above, only observing the class component's render method, but there's
  // no way to reference the render method from the function component before rendering is complete.
  // This is the best we can do.
  // TODO: Actually, maybe we can pass a ref from the parent function component to the child class
  // component and somehow use that to wire up the ViewStore with the class's `render()` method? Idk
  // if that's possible.
  class ReactiveClassComponent
    extends Component
    implements React.Component<Props>
  {
    private viewStore: ViewStore<() => React.ReactNode>;
    private unsubscribe: (() => void) | null = null;

    constructor(props: Props) {
      super(props);
      this.viewStore = new ViewStore(this.render.bind(this));

      this.render = () => {
        const render = this.viewStore.getReaction(); // late binding, reaction can be lost
        return render();
      };

      reactionRegistry.register(this, this.viewStore, this.viewStore);
    }
    componentDidMount(): void {
      super.componentDidMount?.();

      const unsubscribe = this.viewStore.subscribe(() => {
        this.forceUpdate(); // bypasses shouldComponentUpdate
      });
      this.unsubscribe = unsubscribe;
    }
    componentWillUnmount(): void {
      super.componentWillUnmount?.();
      this.unsubscribe?.();
      this.unsubscribe = null;
    }
  }
  return ReactiveClassComponent;
}
