/**
 * Inlined from @aha-app/react-easy-state
 * Original source: https://github.com/RisingStack/react-easy-state
 */

import { useState, memo, useMemo, useEffect, Component } from 'react';
import { unstable_batchedUpdates } from 'react-dom';
import {
  observe,
  unobserve,
  isObservable,
  raw,
  observable,
} from '@nx-js/observer-util';

// it is window in the DOM and global in NodeJS and React Native

declare const global: typeof globalThis | undefined;

const isDOM = typeof window !== 'undefined';
const isNative = typeof global !== 'undefined';
const globalObj: any = isDOM ? window : isNative ? global : undefined;
const hasHooks = typeof useState === 'function';

/* eslint camelcase: 0 */
let isInsideFunctionComponent = false;
let isInsideClassComponentRender = false;
let isInsideFunctionComponentWithoutHooks = false;
const COMPONENT = Symbol('owner component');

function mapStateToStores(state: any) {
  // find store properties and map them to their none observable raw value
  // to do not trigger none static this.setState calls
  // from the static getDerivedStateFromProps lifecycle method
  const component = state[COMPONENT];
  return Object.keys(component)
    .map(key => component[key])
    .filter(isObservable)
    .map(raw);
} // We batch all updates to the view until the end of the current task. This
// is to prevent excessive rendering in situations where updates can occur
// outside of React's built-in batching. e.g. after resolving a promise,
// in a setTimeout callback, in an event handler.
//
// NOTE: This should be revisited after React improves batching for
// Suspense / etc.

let batchesPending: Record<number, () => void> = {};
let taskPending = false;
let viewIndexCounter = 0;
let inEventLoop = false;

// Cursor position preservation - only tracked during input events
interface CursorState {
  element: HTMLInputElement | HTMLTextAreaElement;
  start: number | null;
  end: number | null;
  direction: 'forward' | 'backward' | 'none' | null;
}
let pendingCursorRestore: CursorState | null = null;

function runBatch() {
  const batchesToRun = batchesPending;
  taskPending = false;
  batchesPending = {};
  unstable_batchedUpdates(() =>
    Object.values(batchesToRun).forEach(setStateFn => setStateFn())
  );
}

function batchSetState(viewIndex: number, fn: () => void) {
  batchesPending[viewIndex] = fn;

  if (!taskPending) {
    taskPending = true; // If we're in an event handler, we'll run the batch at the end of it.

    if (inEventLoop) return;
    queueMicrotask(() => {
      runBatch();
    });
  }
} // No need to trigger an update for this view since it has been removed.

function clearBatch(viewIndex: number) {
  delete batchesPending[viewIndex];
} // this creates and returns a wrapped version of the passed function
// the cache is necessary to always map the same thing to the same function
// which makes sure that addEventListener/removeEventListener pairs don't break

const cache = new WeakMap();

function wrapFn(fn: any, wrapper: any) {
  if (typeof fn !== 'function') {
    return fn;
  }

  let wrapped = cache.get(fn);

  if (!wrapped) {
    wrapped = function (this: any, ...args: any[]) {
      return wrapper(fn, this, args);
    };

    cache.set(fn, wrapped);
  }

  return wrapped;
}

function wrapMethodCallbacks(obj: any, method: string, wrapper: any) {
  const descriptor = Object.getOwnPropertyDescriptor(obj, method);

  if (
    descriptor &&
    descriptor.writable &&
    typeof descriptor.value === 'function'
  ) {
    obj[method] = new Proxy(descriptor.value, {
      apply(target, ctx, args) {
        return Reflect.apply(
          target,
          ctx,
          args.map((f: any) => wrapFn(f, wrapper))
        );
      },
    });
  }
} // wrapped obj.addEventListener(cb) like callbacks

function wrapMethodsCallbacks(obj: any, methods: string[], wrapper: any) {
  methods.forEach(method => wrapMethodCallbacks(obj, method, wrapper));
} // batch addEventListener calls

if (globalObj?.EventTarget) {
  wrapMethodsCallbacks(
    EventTarget.prototype,
    ['addEventListener', 'removeEventListener'],
    (fn: any, ctx: any, args: any[]) => {
      inEventLoop = true;

      // Save cursor position for input/change events on text inputs
      const event = args[0];
      const eventType = event?.type;
      if (eventType === 'input' || eventType === 'change') {
        const target = event.target;
        const tagName = target?.tagName;
        if (tagName === 'INPUT' || tagName === 'TEXTAREA') {
          const inputType = tagName === 'INPUT' ? target.type : 'textarea';
          if (
            inputType === 'text' ||
            inputType === 'search' ||
            inputType === 'url' ||
            inputType === 'tel' ||
            inputType === 'password' ||
            inputType === 'textarea'
          ) {
            pendingCursorRestore = {
              element: target,
              start: target.selectionStart,
              end: target.selectionEnd,
              direction: target.selectionDirection,
            };
          }
        }
      }

      try {
        fn.apply(ctx, args);

        if (taskPending) {
          runBatch();

          // Restore cursor position after React updates
          if (pendingCursorRestore) {
            const { element, start, end, direction } = pendingCursorRestore;
            if (document.activeElement === element && start !== null) {
              element.setSelectionRange(start, end, direction || undefined);
            }
            pendingCursorRestore = null;
          }
        }
      } finally {
        inEventLoop = false;
        pendingCursorRestore = null;
      }
    }
  );
}

export function view(Comp: any) {
  const isStatelessComp = !(Comp.prototype && Comp.prototype.isReactComponent);
  let ReactiveComp: any;

  if (isStatelessComp && hasHooks) {
    // use a hook based reactive wrapper when we can
    ReactiveComp = (props: any) => {
      // Unique ID for each view instance.
      viewIndexCounter += 1;
      const viewIndex = viewIndexCounter; // use a dummy setState to update the component

      const [, setState] = useState<object>(); // create a memoized reactive wrapper of the original component (render)
      // at the very first run of the component function

      const render = useMemo(
        () =>
          observe(Comp, {
            scheduler: () =>
              batchSetState(viewIndex, () => {
                setState({});
              }),
            lazy: true,
          }), // Adding the original Comp here is necessary to make React Hot Reload work
        // it does not affect behavior otherwise
        [Comp]
      ); // cleanup the reactive connections after the very last render of the component

      useEffect(() => {
        return () => {
          // We don't need to trigger a render after the component is removed.
          clearBatch(viewIndex);
          unobserve(render);
        };
      }, []); // the isInsideFunctionComponent flag is used to toggle `store` behavior
      // based on where it was called from

      isInsideFunctionComponent = true;

      try {
        // run the reactive render instead of the original one
        return render(props);
      } finally {
        isInsideFunctionComponent = false;
      }
    };
  } else {
    const BaseComp: any = isStatelessComp ? Component : Comp; // a HOC which overwrites render, shouldComponentUpdate and componentWillUnmount
    // it decides when to run the new reactive methods and when to proxy to the original methods

    class ReactiveClassComp extends BaseComp {
      viewIndex: number;

      constructor(props: any, context: any) {
        super(props, context); // Unique ID for each class insance.

        viewIndexCounter += 1;
        this.viewIndex = viewIndexCounter;
        this.state = this.state || {};
        this.state[COMPONENT] = this; // create a reactive render for the component

        this.render = observe(this.render, {
          scheduler: () =>
            batchSetState(this.viewIndex, () => this.setState({})),
          lazy: true,
        });
      }

      render() {
        isInsideClassComponentRender = !isStatelessComp;
        isInsideFunctionComponentWithoutHooks = isStatelessComp;

        try {
          return isStatelessComp
            ? Comp(this.props, this.context)
            : super.render();
        } finally {
          isInsideClassComponentRender = false;
          isInsideFunctionComponentWithoutHooks = false;
        }
      } // react should trigger updates on prop changes, while easyState handles store changes

      shouldComponentUpdate(nextProps: any, nextState: any) {
        const { props, state } = this; // respect the case when the user defines a shouldComponentUpdate

        if (super.shouldComponentUpdate) {
          return super.shouldComponentUpdate(nextProps, nextState);
        } // return true if it is a reactive render or state changes

        if (state !== nextState) {
          return true;
        } // the component should update if any of its props shallowly changed value

        const keys = Object.keys(props);
        const nextKeys = Object.keys(nextProps);
        return (
          nextKeys.length !== keys.length ||
          nextKeys.some(key => props[key] !== nextProps[key])
        );
      } // add a custom deriveStoresFromProps lifecyle method

      static getDerivedStateFromProps(props: any, state: any) {
        if ((BaseComp as any).deriveStoresFromProps) {
          // inject all local stores and let the user mutate them directly
          const stores = mapStateToStores(state);
          (BaseComp as any).deriveStoresFromProps(props, ...stores);
        } // respect user defined getDerivedStateFromProps

        if ((BaseComp as any).getDerivedStateFromProps) {
          return (BaseComp as any).getDerivedStateFromProps(props, state);
        }

        return null;
      }

      componentWillUnmount() {
        // call user defined componentWillUnmount
        if (super.componentWillUnmount) {
          super.componentWillUnmount();
        } // We don't need to trigger a render.

        clearBatch(this.viewIndex); // clean up memory used by Easy State

        unobserve(this.render);
      }
    }

    ReactiveComp = ReactiveClassComp;
  }

  ReactiveComp.displayName = Comp.displayName || Comp.name; // static props are inherited by class components,
  // but have to be copied for function components

  if (isStatelessComp) {
    Object.keys(Comp).forEach(key => {
      ReactiveComp[key] = Comp[key];
    });
  }

  return isStatelessComp && hasHooks ? memo(ReactiveComp) : ReactiveComp;
}

function ownKeys(object: any, enumerableOnly?: boolean) {
  var keys = Object.keys(object);

  if (Object.getOwnPropertySymbols) {
    var symbols: any = Object.getOwnPropertySymbols(object);
    enumerableOnly &&
      (symbols = symbols.filter(function (sym: any) {
        return Object.getOwnPropertyDescriptor(object, sym)!.enumerable;
      })),
      keys.push.apply(keys, symbols);
  }

  return keys;
}

function _objectSpread2(target: any, ...sources: any[]) {
  for (var i = 0; i < sources.length; i++) {
    var source = null != sources[i] ? sources[i] : {};
    i % 2
      ? ownKeys(Object(source), true).forEach(function (key) {
          _defineProperty(target, key, source[key]);
        })
      : Object.getOwnPropertyDescriptors
        ? Object.defineProperties(
            target,
            Object.getOwnPropertyDescriptors(source)
          )
        : ownKeys(Object(source)).forEach(function (key) {
            Object.defineProperty(
              target,
              key,
              Object.getOwnPropertyDescriptor(source, key)!
            );
          });
  }

  return target;
}

function _defineProperty(obj: any, key: string | symbol, value: any) {
  if (key in obj) {
    Object.defineProperty(obj, key, {
      value: value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  } else {
    obj[key] = value;
  }

  return obj;
}

const taskQueue = new Set<() => void>();
const scheduler = {
  isOn: false,

  add(task: () => void) {
    if (scheduler.isOn) {
      taskQueue.add(task);
    } else {
      task();
    }
  },

  flush() {
    taskQueue.forEach(task => task());
    taskQueue.clear();
  },

  on() {
    scheduler.isOn = true;
  },

  off() {
    scheduler.isOn = false;
  },
};

// until the function is finished running
// react renders are batched by unstable_batchedUpdates
// autoEffects and other custom reactions are batched by our scheduler

function batch(fn: any, ctx: any, args: any[]) {
  // do not apply scheduler logic if it is already applied from a parent function
  // it would flush in the middle of the parent's batch
  if (scheduler.isOn) {
    return unstable_batchedUpdates(() => fn.apply(ctx, args));
  }

  try {
    scheduler.on();
    return unstable_batchedUpdates(() => fn.apply(ctx, args));
  } finally {
    scheduler.flush();
    scheduler.off();
  }
} // this creates and returns a batched version of the passed function
// the cache is necessary to always map the same thing to the same function
// which makes sure that addEventListener/removeEventListener pairs don't break

const cache2 = new WeakMap();

function batchFn(fn: any) {
  if (typeof fn !== 'function') {
    return fn;
  }

  let batched = cache2.get(fn);

  if (!batched) {
    batched = new Proxy(fn, {
      apply(target, thisArg, args) {
        return batch(target, thisArg, args);
      },
    });
    cache2.set(fn, batched);
  }

  return batched;
}

function batchMethod(obj: any, method: string) {
  const descriptor = Object.getOwnPropertyDescriptor(obj, method);

  if (!descriptor) {
    return;
  }

  const { value, writable, set, configurable } = descriptor;

  if (configurable && typeof set === 'function') {
    Object.defineProperty(
      obj,
      method,
      _objectSpread2({}, descriptor, {
        set: batchFn(set),
      })
    );
  } else if (writable && typeof value === 'function') {
    obj[method] = batchFn(value);
  }
} // batches obj.onevent = fn like calls and store methods

function batchMethods(obj: any, methods?: string[]) {
  methods = methods || Object.getOwnPropertyNames(obj);
  methods.forEach(method => batchMethod(obj, method));
  return obj;
}

function createStore<T extends object>(obj: T | (() => T)): T {
  return batchMethods(
    observable(typeof obj === 'function' ? (obj as () => T)() : obj)
  );
}

export function store<T extends object>(obj: T | (() => T)): T {
  // do not create new versions of the store on every render
  // if it is a local store in a function component
  // create a memoized store at the first call instead
  if (isInsideFunctionComponent) {
    // useMemo is not a semantic guarantee
    // In the future, React may choose to "forget" some previously memoized values and recalculate them on next render
    // see this docs for more explanation: https://reactjs.org/docs/hooks-reference.html#usememo
    return useMemo(() => createStore(obj), []);
  }

  if (isInsideFunctionComponentWithoutHooks) {
    throw new Error(
      'You cannot use state inside a function component with a pre-hooks version of React. Please update your React version to at least v16.8.0 to use this feature.'
    );
  }

  if (isInsideClassComponentRender) {
    throw new Error(
      'You cannot use state inside a render of a class component. Please create your store outside of the render function.'
    );
  }

  return createStore(obj);
}

export function autoEffect(fn: () => void, deps: any[] = []) {
  if (isInsideFunctionComponent) {
    return useEffect(() => {
      const observer = observe(fn, {
        scheduler: () => scheduler.add(observer),
      });
      return () => unobserve(observer);
    }, deps);
  }

  if (isInsideFunctionComponentWithoutHooks) {
    throw new Error(
      'You cannot use autoEffect inside a function component with a pre-hooks version of React. Please update your React version to at least v16.8.0 to use this feature.'
    );
  }

  if (isInsideClassComponentRender) {
    throw new Error(
      'You cannot use autoEffect inside a render of a class component. Please use it in the constructor or lifecycle methods instead.'
    );
  }

  const observer = observe(fn, {
    scheduler: () => scheduler.add(observer),
  });
  return observer;
}
