import React, { useContext, useEffect } from 'react';
import type { FC, ReactNode } from 'react';
import cloneDeep from 'lodash/cloneDeep';
import Debug from 'debug';
import { observe, raw, unobserve } from '@nx-js/observer-util';
import { randomId } from '../utils/randomId.ts';
import { store } from '../store/Store.ts';
import useLifecycleBoundObject from '../utils/useLifecycleBoundObject.ts';
import useManualRef from '../utils/useManualRef.ts';

const debug = Debug('framework:controller');

interface Constructor<C> {
  new (...args: any[]): C;
}

type Mutable<T extends object> = { -readonly [Key in keyof T]: T[Key] };

class ControllerNoActionError extends Error {}

export type GenericApplicationController = ApplicationController<any, any, any>;

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
 *    callbacks, after `await`, and from within other action
 *    functions. They should NOT be called from a component render.
 */
class ApplicationController<
  State extends {} = {},
  Props extends {} = {},
  Parent extends GenericApplicationController = any,
> {
  id: string;
  initialized: boolean;
  parent: Parent | null;
  state: State;
  _debug = Debug(`controller:${this.constructor.name}`);
  runOnDestroy: Array<() => void>;

  // @ts-expect-error We will assign props before they're accessed in subclasses.
  public readonly props: Readonly<Props>;

  constructor() {
    this.id = randomId();
    this.initialized = false;
    this.parent = null;
    this.state = store(cloneDeep(this.initialState));
    this.runOnDestroy = [];

    const proxiedThis = new Proxy(this, {
      // Traverse up through the controller hierarchy and find one that responds
      // to the specified action.
      get(targetController, prop, receiver) {
        if (typeof prop === 'string' && prop.startsWith('action')) {
          let currentController:
            | ApplicationController<State, Props, Parent>
            | Parent = targetController;
          let currentProxy = receiver;
          do {
            const action = Reflect.get(currentController, prop, receiver);
            if (typeof action === 'function') {
              // We need to change this when the method is invoked, so bind the function.
              return action.bind(currentController);
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

    return proxiedThis;
  }

  /**
   * Controllers can override this method to initialize at mount with the
   * original props passed to the controller wrapped component. The constructor
   * works too, it just doesn't have access to props.
   *
   * @abstract
   */
  initialize(props: Props): void {}

  /**
   * Internal initializer function
   *
   * @hidden
   */
  internalInitialize(parentController: Parent, props: Props) {
    if (!this.initialized) {
      this.parent = parentController;

      debug(
        `Initializing ${this.constructor.name}${
          parentController ? ' > ' + parentController.constructor.name : ''
        }`
      );

      // props are readonly, as we don't want them reassigned, but we need to set them here
      (this.props as Mutable<typeof this.props>) = store({ ...props });

      if (this.initialize) this.initialize(props);
      this.initialized = true;
    } else {
      const oldProps = { ...raw(this.props) };

      // Basically `Object.assign()`, but track if changes were made in the same pass.
      let didChangeProps = false;
      for (const key in props) {
        if (Object.prototype.hasOwnProperty.call(props, key)) {
          if (oldProps[key] !== props[key]) {
            // props are readonly, as we don't want them reassigned, but we need to set them here
            (this.props as Mutable<typeof this.props>)[key] = props[key];
            didChangeProps = true;
          }
        }
      }

      // Note: this implementation doesn't remove from `this.props` any properties that `props` no
      // longer has. A strict implementation would find the set difference between the keys of the
      // two objects and delete properties from `this.props`.

      if (didChangeProps) {
        this.changeProps(props, oldProps);
      }
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
   * @hidden
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

  findControllerInstance<TController extends ApplicationController>(
    controllerClass: Constructor<TController>
  ) {
    return this.findController(
      _controller => _controller instanceof controllerClass
    ) as TController | undefined;
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
    Object.assign(this.state, newState);
  }

  /**
   * Extends instances of this controller with the properties defined in
   * `mixin`. Will overwrite any existing properties of the same name.
   */
  static extend(mixin: object) {
    Object.defineProperties(
      this.prototype,
      Object.getOwnPropertyDescriptors(mixin)
    );
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
 * Inside a child component wrapped in View():
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
  TController extends ApplicationController<{}, TProps, any>,
  TProps extends {},
>(
  ControllerClass: Constructor<TController>,
  ControlledComponent: React.FC<TProps>
) {
  // for `useLifecycleBoundObject`, stable identity
  function disposeController(controller: TController) {
    // Give controller a chance to deregister when it is removed.
    debug('Destroying controller');
    controller.internalDestroy();
  }

  // Use React.memo here so if props don't change then we don't re-render and
  // allocate a new controller instance.
  return React.memo(
    (props: TProps & { controllerRef?: React.Ref<TController> }) => {
      const parentController = useContext(ControllerContext);

      const controller = useLifecycleBoundObject(() => {
        // initialize controller
        const controller = new ControllerClass();
        controller.internalInitialize(parentController, props);
        return controller;
      }, disposeController);

      // wires up ref up to controller if provided
      useManualRef(controller, props.controllerRef, 'controllerRef');

      useEffect(() => {
        // Update the controller's `this.props` (`internalInitialize` calls `changeProps` on updates) in an
        // Effect, so the controller doesn't see prop changes from abandoned renders, only ones that
        // were committed to DOM.
        // After the first render, the controller's `this.props` are already set by `useLifecycleBoundObject`, but it doesn't do any harm
        controller.internalInitialize(parentController, props);
      }, [controller, parentController, props]);

      return (
        <ControllerContext.Provider
          value={controller}
          key={controller.id}
        >
          <ControlledComponent {...props} />
        </ControllerContext.Provider>
      );
    }
  );
}

export const ControllerContext =
  React.createContext<GenericApplicationController | null>(null);

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
function useController(): GenericApplicationController;
function useController<TController extends ApplicationController>(
  controllerClass: Constructor<TController>
): TController;
function useController<
  TController extends ApplicationController = ApplicationController,
>(
  controllerClass?: Constructor<TController>
): GenericApplicationController | TController {
  let controller: GenericApplicationController | null | undefined =
    useContext(ControllerContext);

  if (controller) {
    if (controllerClass) {
      // If a controller class constructor argument is given then traverse up the
      // tree until the appropriate controller type is found
      const typedController =
        controller.findControllerInstance(controllerClass);
      if (typedController) return typedController;
    } else {
      return controller;
    }
  }

  throw new Error(
    `No controller${controllerClass ? ' of type ' + controllerClass.name : ''} found`
  );
}

export {
  ApplicationController,
  StartControllerScope,
  ControlledComponent,
  useController,
};
