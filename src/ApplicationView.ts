import { observe, unobserve } from '@nx-js/observer-util';
import React, { memo, useEffect, useMemo, useState } from 'react';

const COMPONENT = Symbol('owner component');

function isReactFunction<P>(
  component: React.ComponentType<P>
): component is React.FC<P> | ((props: P) => React.ReactElement) {
  return !component.prototype?.isReactComponent;
}

type ReactComponent<T> =
  | React.ComponentClass<T, any>
  | React.FC<T>
  | ((props: T) => React.ReactElement);

class ViewUpdateEmitter {
  private static _batching = false;
  private static _immediate = false;
  static instances: WeakRef<ViewUpdateEmitter>[] = [];
  static batchedInstances: WeakRef<ViewUpdateEmitter>[] = [];

  static reset() {
    this.resolveBatches();
    this._batching = false;
    this._immediate = false;
  }

  static set immediate(value: boolean) {
    if (value && this.batching)
      throw new Error('Cannot set immediate while batching');
    this._immediate = value;
  }
  static get immediate() {
    return this._immediate;
  }

  static set batching(value: boolean) {
    if (value && this._immediate)
      throw new Error('Cannot batch while immediate');
    this._batching = value;
  }
  static get batching() {
    return this._batching;
  }

  static updateAll() {
    ViewUpdateEmitter.instances.forEach(ref => {
      const instance = ref.deref();
      if (instance) {
        instance.queueIfUpdate();
      }
    });
  }

  static resolveBatches() {
    const dedupe = new Set<ViewUpdateEmitter>();
    ViewUpdateEmitter.batchedInstances.forEach(ref => {
      const instance = ref.deref();
      if (instance) {
        dedupe.add(instance);
      }
    });
    ViewUpdateEmitter.batchedInstances = [];
    for (const instance of dedupe) {
      instance.queueIfUpdate();
    }
  }

  constructor() {
    ViewUpdateEmitter.instances.push(new WeakRef(this));
  }

  callback?: Function = undefined;
  // this is used to trigger the update when the callback is set if there was no
  // callback at the time. Otherwise there can be times when the react component
  // has run the useEffect return to remove the callback because its remounting
  // or whatever, and so it won't get the update.
  hasUpdate = false;
  queued = false;

  on(callback: Function) {
    this.callback = callback;
    this.queueIfUpdate();
  }

  off() {
    this.callback = undefined;
  }

  queueIfUpdate() {
    if (this.hasUpdate) {
      this.update();
    }
  }

  queue() {
    if (this.queued) return;

    if (ViewUpdateEmitter.batching) {
      this.hasUpdate = true;
      ViewUpdateEmitter.batchedInstances.push(new WeakRef(this));
      return;
    }

    if (ViewUpdateEmitter.immediate) {
      this.update();
    } else {
      this.queued = true;
      queueMicrotask(() => this.update());
    }
  }

  update() {
    this.queued = false;

    if (this.callback) {
      this.hasUpdate = false;
      this.callback();
    } else {
      this.hasUpdate = true;
    }
  }
}

interface Options {
  debugger?: Function;
}

export async function batch<T>(fn: () => Promise<T>): Promise<T> {
  ViewUpdateEmitter.updateAll();

  ViewUpdateEmitter.batching = true;
  const result = await fn();
  ViewUpdateEmitter.reset();
  return result;
}

export function immediate<T>(fn: () => T): T {
  ViewUpdateEmitter.immediate = true;
  const result = fn();
  ViewUpdateEmitter.reset();
  return result;
}

export function ApplicationView<T>(Comp: ReactComponent<T>, options?: Options) {
  let ReactiveComp: React.ComponentType<T>;

  if (isReactFunction(Comp)) {
    // use a hook based reactive wrapper when we can
    ReactiveComp = (props: T) => {
      const emitter = new ViewUpdateEmitter();

      // use a dummy setState to update the component
      const [, setState] = useState({});
      // create a memoized reactive wrapper of the original component (render)
      // at the very first run of the component function
      const render = useMemo(
        () => {
          return observe(Comp, {
            scheduler: () => {
              emitter.queue();
            },
            lazy: true,
          });
        },
        // Adding the original Comp here is necessary to make React Hot Reload work
        // it does not affect behavior otherwise
        [Comp]
      );

      // cleanup the reactive connections after the very last render of the component
      useEffect(() => {
        emitter.on(() => {
          if (options?.debugger) {
            options.debugger('update triggered');
          }
          setState({});
        });

        return () => {
          emitter.off();
          // We don't need to trigger a render after the component is removed.
          // unobserve(render);
        };
      }, []);

      // run the reactive render instead of the original one
      return render(props);
    };

    // if ("displayName" in Comp) {
    //   ReactiveComp.displayName = Comp.displayName || Comp.name;
    // } else {
    //   ReactiveComp.displayName = Comp.name;
    // }

    // static props are inherited by class components,
    // but have to be copied for function components
    Object.keys(Comp).forEach(key => {
      // @ts-ignore
      ReactiveComp[key] = Comp[key];
    });

    return memo(ReactiveComp);
  } else {
    // a HOC which overwrites render, shouldComponentUpdate and componentWillUnmount
    // it decides when to run the new reactive methods and when to proxy to the original methods
    class ReactiveClassComp extends Comp {
      constructor(props: T, context: any) {
        super(props, context);

        this.state = this.state || {};
        // @ts-ignore
        this.state[COMPONENT] = this;

        // create a reactive render for the component
        this.render = observe(this.render, {
          scheduler: () => this.setState({}),
          lazy: true,
        });
      }

      // react should trigger updates on prop changes, while easyState handles store changes
      override shouldComponentUpdate(
        nextProps: Readonly<T>,
        nextState: any,
        nextContext: any
      ) {
        const { props, state } = this;

        // respect the case when the user defines a shouldComponentUpdate
        if (super.shouldComponentUpdate) {
          return super.shouldComponentUpdate(nextProps, nextState, nextContext);
        }

        // return true if it is a reactive render or state changes
        if (state !== nextState) {
          return true;
        }

        // the component should update if any of its props shallowly changed value
        const propKeys = Object.keys(props);
        const nextKeys = Object.keys(nextProps);
        return (
          nextKeys.length !== propKeys.length ||
          nextKeys.some(key => props[key] !== nextProps[key])
        );
      }

      override componentWillUnmount() {
        // call user defined componentWillUnmount
        if (super.componentWillUnmount) {
          super.componentWillUnmount();
        }
        // clean up memory used by Easy State
        unobserve(this.render);
      }
    }

    // @ts-ignore
    ReactiveComp = ReactiveClassComp;
  }

  ReactiveComp.displayName = Comp.displayName || Comp.name;
  return ReactiveComp;
}
