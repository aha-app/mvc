import React, {
  ComponentProps,
  Ref,
  useContext,
  useEffect,
  useState,
} from 'react';
import type { ComponentType, FC, ReactNode } from 'react';
// @ts-ignore
import { store } from '@aha-app/react-easy-state';
import Debug from 'debug';
import { randomId } from '../utils/randomId';
import { cloneDeep } from 'lodash';
import { observe, unobserve } from '..';

const debug = Debug('framework:controller');

class ControllerNoActionError extends Error {}

export type GenericApplicationController = ApplicationController<any, any, any>;
interface Constructor<C extends ApplicationController> {
  new (...args: any[]): C;
}

type ApplicationControllerConstructor<P> = {
  new (): { initialize(props: P): Promise<void> };
};
type GetControllerConstructor<T> = { new (): T };

type GetControllerProps<T extends ApplicationControllerConstructor<any>> =
  T extends ApplicationControllerConstructor<infer P> ? P : never;

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
 *
 */
class ApplicationController<
  State extends {} = {},
  Props extends {} = {},
  Parent extends ApplicationController<any, any, any> = any,
> {
  id: string;
  initialized: boolean;
  parent: Parent;
  state: State;
  proxiedThis: any;
  _debug = Debug(`controller:${this.constructor.name}`);
  runOnDestroy: Array<() => void>;

  public readonly props: Readonly<Props>;

  constructor() {
    this.id = randomId();
    this.initialized = false;
    this.parent = null;
    this.state = undefined;
    this.runOnDestroy = [];

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
            if (prop in currentController) {
              // We need to change this when the method is invoked, so rewrite
              // the function.
              return function (...args) {
                return currentController[prop](...args);
              };
            }
            // Look further up the hierarchy.
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
  async initialize(props: Props): Promise<void> {}

  /**
   * Internal initializer function
   *
   * @hidden
   */
  internalInitialize(parentController: Parent, initialArgs: Props) {
    if (!this.initialized) {
      this.parent = parentController;

      debug(
        `Initializing ${this.constructor.name}${
          parentController ? ' > ' + parentController.constructor.name : ''
        }`
      );

      // @ts-ignore props are readonly, as we don't want them reassigned, but we need to set them here
      this.props = store({ ...initialArgs });

      this.state = store(cloneDeep(this.initialState));
      if (this.initialize) this.initialize(initialArgs);
      this.initialized = true;
    } else {
      const oldProps = { ...this.props };
      Object.keys(initialArgs).forEach(key => {
        if (this.props[key] !== initialArgs[key]) {
          this.props[key] = initialArgs[key];
        }
      });

      this.changeProps(initialArgs, oldProps);
    }
  }

  /**
   * Controllers can override this method to cleanup when removed
   */
  destroy() {}

  /**
   * Creates the initial state of the controller.
   */
  get initialState(): State {
    if ('initialState' in this.constructor) {
      return this.constructor.initialState as State;
    }

    return {} as State;
  }

  /**
   * Internal destroy function. Do not override
   * @private
   */
  internalDestroy() {
    this.destroy();
    this.runOnDestroy.forEach(fn => fn());
  }

  /**
   * Finds a controller in this controller's hierarchy that matches a finder.
   */
  findController(
    finder: (controller: ApplicationController) => boolean
  ): ApplicationController | undefined {
    let controller: ApplicationController = this;

    do {
      if (finder(controller)) {
        return controller;
      }

      // Look further up the hierarchy.
      controller = controller.parent;
    } while (controller);
  }

  findControllerInstance<T extends ApplicationController>(
    controllerClass: GetControllerConstructor<T>
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
  observable<T>(obj: T): T {
    // @ts-ignore
    this.state._tempObservable = obj;
    // @ts-ignore
    return this.state._tempObservable;
  }

  /**
   * Observe a given function and run it whenever the observables it accesses
   * change.
   *
   * This is a wrapper around observe that automatically cleans up when the
   * controller is destroyed.
   */
  observe(
    func: Parameters<typeof observe>[0],
    options?: Parameters<typeof observe>[1]
  ): ReturnType<typeof observe> {
    const reaction = observe(func, options);
    this.runOnDestroy.push(() => unobserve(reaction));
    return reaction;
  }

  /**
   * Override in controller class to respond to changes in props
   *
   * @abstract
   */
  changeProps(newProps: Props, oldProps: Props) {}

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
  debug(formatter: any, ...args: any[]) {
    this._debug(formatter, ...args);
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
  T extends ApplicationControllerConstructor<any>,
  C extends ComponentType<any>,
>(
  ControllerClass: T,
  ControlledComponent: C
): ComponentType<
  GetControllerProps<T> & {
    controllerRef?: Ref<InstanceType<T>>;
  } & ComponentProps<C>
> {
  // Use React.memo here so if props don't change then we don't re-render and
  // allocate a new controller instance.
  return React.memo((controllerInitialArgs: any) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [controller] = useState(new ControllerClass());

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
        controller={controller as any}
        controllerInitialArgs={controllerInitialArgs}
        key={(controller as any).id}
      >
        <ControlledComponent {...controllerInitialArgs} />
      </Controller>
    );
  });
}

export const ControllerContext = React.createContext(null);

/**
 * A component that initializes a controller instance and wraps its
 * child with a context containing that instance.
 */
function Controller<Props = {}>({
  children,
  controller,
  controllerInitialArgs,
}: {
  children: ReactNode;
  controller: ApplicationController<any, Props, any>;
  controllerInitialArgs: Props;
}) {
  const parentController = useContext(ControllerContext);

  controller.internalInitialize(parentController, controllerInitialArgs);

  // Give controller a chance to deregister when it is removed.
  useEffect(() => {
    return () => {
      debug('Destroying controller');
      controller.internalDestroy();
    };
  }, [controller]);

  return (
    <ControllerContext.Provider value={controller}>
      {children}
    </ControllerContext.Provider>
  );
}

/**
 * Associate a controller with existing components. Useful if the same controller
 * needs to live longer than its direct parent in the component hierarchy.
 */
const ControlledComponent: FC<{
  controller: ApplicationController<any, any, any>;
  children?: ReactNode;
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
function useController<T extends ApplicationController>(
  controllerClass: GetControllerConstructor<T> | undefined = undefined
): T {
  let controller = useContext(ControllerContext);

  // If a controller class constructor argument is given then traverse up the
  // tree until the appropriate controller type is found
  if (controllerClass) {
    controller = controller.findControllerInstance(controllerClass);
  }

  const statefulController: T = controller;
  return statefulController;
}

export {
  ApplicationController,
  StartControllerScope,
  Controller,
  ControlledComponent,
  useController,
};
