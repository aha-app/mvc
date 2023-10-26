import { observable } from '@nx-js/observer-util';
import CAF from 'caf';
import Debug from 'debug';
import { cloneDeep } from 'lodash';
import type { FC, ReactNode } from 'react';
import React, {
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

const debug = Debug('framework:controller');

interface ApplicationController<
  State = object,
  Props = object,
  Parent = UndefApp
> {
  constructor: Function & {
    initialState: State;
  };
  initialize(props: Props): void | Promise<void>;
}
class ControllerNoActionError extends Error {}

export type GenericApplicationController = ApplicationController<any, any, any>;

export interface ApplicationControllerConstructor<
  State extends object = object,
  Props = object,
  Parent = UndefApp
> {
  new (id: string): ApplicationController<State, Props, Parent>;
}

type UndefApp = GenericApplicationController | undefined | null;

interface Constructor<C extends ApplicationController> {
  new (id: string): C;
}

type ControllerProps<
  T extends ApplicationControllerConstructor | ApplicationController
> = T extends ApplicationControllerConstructor<any, infer P, unknown>
  ? P
  : T extends ApplicationController<any, infer P, unknown>
  ? P
  : {};

export type ControllerState<
  T extends ApplicationControllerConstructor | ApplicationController
> = T extends ApplicationControllerConstructor<infer S, unknown, unknown>
  ? S
  : T extends ApplicationController<infer S, unknown, unknown>
  ? S
  : {};

/**
 * General rules to follow for using controllers:
 *
 * 1. Any data that should trigger React re-rendering should be stored in
 *    the `state` object.
 * 2. After adding data to `state` get a new reference to it, via the `state`
 *    object before using it again. This ensures that the new access or mutation
 *    is tracked.
 * 3. The `state` object, and any content within it, must only be mutated
 *    inside an `action...` function.
 * 4. Action functions can be called from anywhere, including event handlers,
 *    callbacks, after `await`, render methods, and from within other action
 *    functions.
 */
class ApplicationController<
  State extends object = object,
  Props = object,
  Parent = UndefApp
> {
  initialized: boolean;
  parent: Parent;
  state: State & { _tempObservable: any };
  cancelTokens: Record<string, any>;
  proxiedThis: any;
  _debug = Debug(`controller:${this.constructor.name}`);

  constructor(public id: string) {
    this.initialized = false;
    this.parent = null;
    this.state = undefined;
    this.cancelTokens = {};

    this.proxiedThis = new Proxy(this, {
      // Traverse up through the controller hierarchy and find one that responds
      // to the specified action.
      get(targetController, prop, receiver) {
        if (typeof prop === 'string' && prop.startsWith('action')) {
          let currentController:
            | ApplicationController<State, Props, Parent>
            | Parent = targetController;
          let currentProxy = receiver;
          do {
            // @ts-ignore
            if (prop in currentController) {
              // We need to change this when the method is invoked, so rewrite
              // the function.
              return function (...args) {
                return currentController[prop](...args);
              };
            }
            // Look further up the hierarchy.
            // @ts-ignore
            currentController = currentController.parent;
            currentProxy = currentProxy.parent;
          } while (currentController);

          throw new ControllerNoActionError(
            `Unable to find an action ${prop} on ${targetController.constructor.name}`
          );
        } else {
          return Reflect.get(targetController, prop, receiver);
        }
      },
      has(targetController, prop) {
        if (typeof prop === 'string' && prop.startsWith('action')) {
          return !!targetController.findController(
            controller => prop in controller
          );
        } else {
          return Reflect.has(targetController, prop);
        }
      },
    });

    return this.proxiedThis;
  }

  /**
   * Controllers can override this method to initialize at mount with the
   * original props passed to the controller wrapped component.
   *
   * @abstract
   */
  initialize(props: Props): void | Promise<void> {}

  /**
   * Internal initializer function
   *
   * @hidden
   */
  async internalInitialize(
    parentController: Parent,
    initialArgs: Props
  ): Promise<void> {
    if (this.initialized) {
      await this.changeProps(initialArgs);
      return;
    }

    this.parent = parentController;

    debug(
      `Initializing ${this.constructor.name}(${this.id})${
        parentController ? ' > ' + parentController.constructor.name : ''
      }`
    );

    this.resetState();

    this.initialized = true;
    await this.initialize(initialArgs);
  }

  /**
   * Creates the initial state of the controller.
   */
  get initialState(): State {
    if ('initialState' in this.constructor) {
      return this.constructor.initialState as State;
    }

    return {} as State;
  }

  resetState() {
    this.state = observable(cloneDeep(this.initialState));
  }
  /**
   * Controllers can override this method to cleanup when removed
   */
  destroy(): void {}

  /**
   * Internal destroy function. Do not override
   * @private
   */
  internalDestroy() {
    this.destroy();
    this.initialized = false;
  }

  /**
   * Finds a controller in this controller's hierarchy that matches a finder.
   */
  findController<C extends ApplicationController>(
    finder: (controller: GenericApplicationController) => boolean
  ): C | undefined {
    let controller: GenericApplicationController = this;

    do {
      if (finder(controller)) {
        return controller as C;
      }

      // Look further up the hierarchy.
      controller = controller.parent;
    } while (controller);
  }

  findControllerInstance<T extends ApplicationController>(
    controllerClass: Constructor<T>
  ): T | undefined {
    return this.findController(
      _controller => _controller instanceof controllerClass
    ) as T | undefined;
  }

  /**
   * Force a record to be an observed instance that will
   * trigger observers on the controller state.
   *
   * You need this if you're using `.save()` to create a
   * record and want the updated record to trigger state updates.
   *
   * @deprecated just use observable() directly, no need for _tempObservable.
   */
  observable(obj: any) {
    this.state._tempObservable = obj;
    return this.state._tempObservable;
  }

  /**
   * Run an async function that can be canceled using
   * `cancelPending`. When canceled, the async function will not run
   * its `then` (or anything following the `await`).
   *
   * `scope` is an arbitrary string that can be used in
   * `cancelPending` to cancel only pending functions of a certain
   * type.
   *
   * For example:
   *   await this.cancelable("loadFilters", async () => ...)
   *   this.cancelPending("loadFilters")
   */
  cancelable(scope: string, fn: (signal: any) => Promise<any>) {
    let token = this.cancelTokens[scope];
    if (!token) {
      token = this.cancelTokens[scope] = new CAF.cancelToken(); // eslint-disable-line new-cap
    }

    const cancelableFn = CAF(function* (signal) {
      return yield fn(signal);
    });

    return cancelableFn(token.signal);
  }

  /**
   * Cancel all running cancelable functions created using `scope`.
   */
  cancelPending(scope: string) {
    if (this.cancelTokens[scope]) {
      this.cancelTokens[scope].abort(
        `Cancelled pending functions for ${this.constructor.name}/${scope}`
      );
    }
    delete this.cancelTokens[scope];
  }

  /**
   * Cancel all running cancelable functions.
   */
  cancelAllPending() {
    Object.keys(this.cancelTokens).forEach(scope => this.cancelPending(scope));
  }

  /**
   * Cleanup the cancelable state after the operation is complete.
   */
  finishPending(scope: string) {
    delete this.cancelTokens[scope];
  }

  /**
   * Override in controller class to respond to changes in props
   *
   * @abstract
   */
  async changeProps(newProps: Props) {}

  /**
   * Partially set state
   */
  setState(newState: Partial<State>) {
    Object.keys(newState).forEach(key => {
      this.state[key] = newState[key];
    });
  }

  /**
   * Extends instances of this controller with the properties defined in
   * `mixin`. Will overwrite any existing properties of the same name.
   */
  static extend(mixin) {
    Object.keys(mixin).forEach(key => {
      const descriptor = Object.getOwnPropertyDescriptor(mixin, key);
      Object.defineProperty(this.prototype, key, descriptor);
    });
  }

  /**
   * Output to debugger with the controller name. Set localStorage.debug to
   * 'controller:*' or 'controller:MyController' to see debug output.
   *
   * @param args messages to log
   */
  debug(...args: any[]) {
    this._debug(...args);
  }
}

/**
 * Wrap a root React component using a new instance of a
 * controller. The controller will receive any props passed to the
 * component in its `initialize` method.
 *
 * When wrapped, any child component can use the `useController` hook
 * to receive the controller instance of its closest ancestor with a
 * ControllerScope.
 *
 * Example:
 *   export default StartControllerScope(WorkflowBoardController, WorkflowBoard);
 *
 * Inside a child component:
 *   const controller = useController();
 *
 * A reference to the controller can be retrieved from the component by
 * passing the `controllerRef` prop a value returned by `useRef()`.
 *
 * Example:
 *
 *   const whiteboardController = useRef();
 *   <Whiteboard controllerRef={whiteboardController} />
 *   ...
 *   whiteboardController.current.actionPanIntoView();
 */
function StartControllerScope<
  C extends ApplicationControllerConstructor,
  T extends React.ComponentType<any>
>(
  ControllerClass: C,
  ControlledComponent: T
): React.ComponentType<ControllerProps<C> & React.ComponentProps<T>> {
  // Use React.memo here so if props don't change then we don't re-render and
  // allocate a new controller instance.
  return React.memo(controllerInitialArgs => {
    const id = useId();
    const controller = useMemo(() => new ControllerClass(id), []);

    if (!controller) {
      throw new Error('No controller is set');
    }

    if (controllerInitialArgs?.controllerRef) {
      if (typeof controllerInitialArgs.controllerRef === 'function') {
        controllerInitialArgs.controllerRef(controller);
      } else if (
        controllerInitialArgs.controllerRef.hasOwnProperty('current')
      ) {
        controllerInitialArgs.controllerRef.current = controller;
      } else {
        throw new Error(
          'The controllerRef prop must be passed the value provided by useRef() or useCallback().'
        );
      }
    }

    return (
      <Controller
        controller={controller}
        controllerInitialArgs={controllerInitialArgs}
        key={controller.id}
      >
        <ControlledComponent {...(controllerInitialArgs as any)} />
      </Controller>
    );
  });
}

const ControllerContext = React.createContext<ApplicationController | null>(
  null
);

/**
 * A component that initializes a controller instance and wraps its
 * child with a context containing that instance.
 */
function Controller<
  C extends ApplicationController<object, unknown, UndefApp>
>({
  children,
  controller,
  controllerInitialArgs,
}: {
  children: ReactNode;
  controller: C;
  controllerInitialArgs: ControllerProps<C>;
}) {
  const parentController = useContext(ControllerContext);
  const destroyRef = useRef<number | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useMemo(() => {
    controller
      .internalInitialize(parentController, controllerInitialArgs)
      .catch(err => {
        setError(err);
      });
  }, [controller, parentController, controllerInitialArgs]);

  // Give controller a chance to deregister when it is removed. If the component
  // is just remounting then we don't want to destroy the controller so do this
  // in a cancellable timeout. Remounting happens in dev automatically from
  // React 18.
  useEffect(() => {
    if (destroyRef.current) {
      window.clearTimeout(destroyRef.current);
      destroyRef.current = null;
    }

    return () => {
      destroyRef.current = window.setTimeout(() => {
        debug(
          `Destroying controller ${controller.constructor.name}(${controller.id})`
        );
        controller.internalDestroy();
      }, 1);
    };
  }, [controller]);

  if (error) {
    throw error;
  }

  return (
    <ControlledComponent controller={controller}>
      {children}
    </ControlledComponent>
  );
}

/**
 * Associate a controller with existing components. Useful if the same controller
 * needs to live longer than its direct parent in the component hierarchy.
 */
const ControlledComponent: FC<{
  children: ReactNode;
  controller: ApplicationController;
}> = ({ children, controller }) => {
  return (
    <ControllerContext.Provider value={controller}>
      {children}
    </ControllerContext.Provider>
  );
};

/**
 * Returns the controller instance created by the closest
 * ControllerContext.
 */
function useController<Controller extends ApplicationController>(
  controllerClass: Constructor<Controller> | undefined = undefined
): Controller {
  let controller = useContext(ControllerContext);
  if (!controller) throw new Error('Could not find controller');

  // If a controller class constructor argument is given then traverse up the
  // tree until the appropriate controller type is found
  if (controllerClass) {
    controller = controller.findControllerInstance(controllerClass);
  }

  if (!controller) throw new Error('Could not find controller');
  return controller as Controller;
}

export {
  ApplicationController,
  ControlledComponent,
  Controller,
  StartControllerScope,
  useController,
};
