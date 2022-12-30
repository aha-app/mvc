import { store } from '@aha-app/react-easy-state';
import Debug from 'debug';
import React, { useContext, useEffect, useState } from 'react';
//import ReactiveRegister from 'javascripts/reactive_register';
import _ from 'lodash';
import { randomId } from '../utils/randomId';

const debug = Debug('framework:controller');

class ControllerNoActionError extends Error {}

type UndefApp = ApplicationController<unknown, unknown, unknown> | undefined;

interface ApplicationController<
  State = object,
  Props = object,
  Parent = UndefApp
> {
  constructor: Function & {
    initialState: State;
  };
}

/*
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
class ApplicationController<State = object, Props = object, Parent = UndefApp> {
  static initialState = {};

  static use(): any {
    let current = useController();
    do {
      if (current.constructor === this) return current;
      // @ts-ignore
      current = current.parent;
    } while (current);
  }

  id: string | null = randomId();
  parent: Parent | null = null;
  state: State & { _tempObservable: any };
  subscriptions: [] = [];
  cancelTokens = {};
  proxiedThis: this;
  initialized: boolean = false;

  constructor() {
    this.proxiedThis = new Proxy(this, {
      // Traverse up through the controller hierarchy and find one that responds
      // to the specified action.
      get(targetController, prop, receiver) {
        if (typeof prop === 'string' && prop.startsWith('action')) {
          let currentController = targetController;
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
          let currentController = targetController;
          do {
            if (prop in currentController) {
              return true;
            }

            // @ts-ignore
            currentController = currentController.parent;
          } while (currentController);

          return false;
        } else {
          return Reflect.has(targetController, prop);
        }
      },
    });

    return this.proxiedThis;
  }

  initialize(props: Props): void | Promise<void> {}

  internalInitialize(parentController: Parent, initialArgs: Props) {
    if (!this.initialized) {
      this.parent = parentController;

      debug(
        `Initializing ${this.constructor.name}${
          parentController ? ' > ' + parentController.constructor.name : ''
        }`
      );

      this.state = store(_.cloneDeep(this.constructor.initialState));
      if (this.initialize) this.initialize(initialArgs);
      this.initialized = true;

      // If this controller has routing then bring the state and browser into sync.
      if (this.router) {
        this.router.navigateSync();
      }
    } else {
      this.changeProps(initialArgs);
    }
  }

  internalDestroy() {
    this.unlisten();
  }

  unlisten() {
    // Override in child to unlisten all models
  }

  /**
   *  Force a record to be an observed instance that will
   *  trigger observers on the controller state.
   *
   *  You need this if you're using Spraypaint `.save()` to create a
   *  record and want the updated record to trigger state updates.
   */
  observable(obj) {
    this.state._tempObservable = obj;
    return this.state._tempObservable;
  }

  changeProps(newProps: Props) {
    // Override in sub-class to respond to changes in props.
  }

  /**
   * Partially set state
   */
  setState(newState: Partial<State>) {
    Object.keys(newState).forEach(key => {
      this.state[key] = newState[key];
    });
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
function StartControllerScope(ControllerClass, ControlledComponent) {
  // Use React.memo here so if props don't change then we don't re-render and
  // allocate a new controller instance.
  return React.memo(controllerInitialArgs => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [controller] = useState(new ControllerClass());

    // @ts-ignore
    if (controllerInitialArgs?.controllerRef) {
      // @ts-ignore
      if (typeof controllerInitialArgs.controllerRef === 'function') {
        // @ts-ignore
        controllerInitialArgs.controllerRef(controller);
      } else if (
        // @ts-ignore
        controllerInitialArgs.controllerRef.hasOwnProperty('current')
      ) {
        // @ts-ignore
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
        <ControlledComponent {...controllerInitialArgs} />
      </Controller>
    );
  });
}

const ControllerContext = React.createContext(null);

/**
 * A component that initializes a controller instance and wraps its
 * child with a context containing that instance.
 */
function Controller({ children, controller, controllerInitialArgs }) {
  const parentController = useContext(ControllerContext);

  controller.internalInitialize(parentController, controllerInitialArgs);

  // Give controller a chance to deregister when it is removed.
  useEffect(() => {
    return () => {
      debug('Destroying controller');
      if (controller.destroy) controller.destroy();
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
 *
 */
function ControlledComponent({ children, controller }) {
  return (
    <ControllerContext.Provider value={controller}>
      {children}
    </ControllerContext.Provider>
  );
}

/**
 * Returns the controller instance created by the closest
 * ControllerContext.
 */
function useController<Controller extends ApplicationController>(): Controller {
  const controller = useContext(ControllerContext);
  const statefulController = controller;
  return statefulController as Controller;
}

export {
  ApplicationController,
  StartControllerScope,
  ControlledComponent,
  useController,
};
