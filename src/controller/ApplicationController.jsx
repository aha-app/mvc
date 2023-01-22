import React, { useContext, useEffect, useState } from 'react';
import { store } from '@aha-app/react-easy-state';
import Debug from 'debug';
import { randomId } from '../utils/randomId';
import CAF from 'caf';
import _ from 'lodash';

const debug = Debug('framework:controller');

class ControllerNoActionError extends Error {}

/**
 * @template P
 * @typedef {{new (): { initialize(props: P): Promise<void> }}} ApplicationControllerConstructor
 */

/**
 * @template {ApplicationControllerConstructor<any>} T
 * @typedef {T extends ApplicationControllerConstructor<infer P> ? P : never} GetControllerProps
 */

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
 * @template {{}} State
 * @template {{}} Props
 * @template {ApplicationController<any,any,any>} Parent
 */
class ApplicationController {
  constructor() {
    this.id = randomId();
    /** @type {Parent} */
    this.parent = null;
    /** @type {State & {_tempObservable: any}} */
    this.state = undefined;
    this.subscriptions = [];
    this.cancelTokens = {};
    /** @type {() => void} */
    this.destroy = undefined;

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

  /**
   * Controllers can override this method to initialize at mount with the
   * original props passed to the controller wrapped component.
   *
   * @abstract
   * @param {Props} props
   * @return {Promise<void>}
   */
  async initialize(props) {}

  /**
   * @param {ApplicationController<any,any>} parentController
   * @param {Props} initialArgs
   */
  internalInitialize(parentController, initialArgs) {
    if (!this.initialized) {
      this.parent = parentController;

      debug(
        `Initializing ${this.constructor.name}${
          parentController ? ' > ' + parentController.constructor.name : ''
        }`
      );

      // @ts-ignore
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
    // Unregister reactive updates.
    this.unsubscribeAll();
    this.unlisten();
  }

  unlisten() {
    // Override in child to unlisten all models
  }

  /**
   * @typedef ReactiveChange
   * @prop {'update'|'destroy'|'create'} action
   * @prop {string} path
   * @prop {{}} meta
   */

  /**
   * @callback SubscribeCallback
   * @param {string} parentId
   * @param {string} childId
   * @param {ReactiveChange} change
   * @returns {void}
   */
  /**
   * Subscribe to a reactive update based on pattern and action.
   *
   * @param {string | string[]} pattern a reactive update pattern. Example: "Project-123/Feature-456"
   * @param {string|string[]|SubscribeCallback} action_or_callback one of ["create", "update", "destroy"]
   * @param {SubscribeCallback=} callback a function that receives the parentId and childId of a reactive update. Example: callback("projects-123", "features-456")
   * @param {object} options
   * @param {boolean=} options.ignoreOwnChanges
   */
  subscribe(pattern, action_or_callback, callback, options = {}) {
    const { ignoreOwnChanges = true } = options;

    /** @type {string[]} */
    let subscribedActions;

    if (typeof action_or_callback === 'function') {
      callback = action_or_callback;
      subscribedActions = ['create', 'update', 'destroy'];
    } else if (action_or_callback instanceof Array) {
      subscribedActions = action_or_callback;
    } else if (typeof action_or_callback === 'string') {
      subscribedActions = [action_or_callback];
    }

    // Use reactive updates to detect record changes.
    const subscriptionId = `controller-${this.id}-${subscribedActions.join(
      ','
    )}-${pattern}`;

    if (this.subscriptions.includes(subscriptionId)) {
      console.warn(
        `Re-registering an already registered reactive pattern for this controller: ${subscriptionId}`
      );
      this.unsubscribe(subscriptionId);
    }

    this.subscriptions.push(subscriptionId);
    ReactiveRegister.register(
      subscriptionId,
      pattern,
      async (change, ownPageChanges, ownComponentChanges, messageClientId) => {
        if (
          ignoreOwnChanges &&
          messageClientId === window.frameworkClientId()
        ) {
          debug(`Ignoring our own change ${change.path}`);
          return;
        }

        if (subscribedActions.includes(change.action)) {
          debug(`Handling update ${change.path}`);
          // Split parent and child key into components.
          const [p, c] = change.path.split('/');

          callback(p, c, change);
        }
      }
    );
    return subscriptionId;
  }

  unsubscribe(subscriptionId) {
    ReactiveRegister.deregister(subscriptionId);
    const index = this.subscriptions.indexOf(subscriptionId);
    if (index >= 0) this.subscriptions.splice(index, 1);
  }

  unsubscribeAll() {
    this.subscriptions.slice().forEach(subscriptionId => {
      this.unsubscribe(subscriptionId);
    });
  }

  /**
   * Force a record to be an observed instance that will
   * trigger observers on the controller state.
   *
   * You need this if you're using `.save()` to create a
   * record and want the updated record to trigger state updates.
   */
  observable(obj) {
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
   *
   * @param {string} scope
   * @param {((signal:any) => Promise<any>)} fn
   */
  cancelable(scope, fn) {
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
  cancelPending(scope) {
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
  finishPending(scope) {
    delete this.cancelTokens[scope];
  }

  /**
   * Override in controller class to respond to changes in props
   *
   * @abstract
   * @param {Props} newProps
   */
  changeProps(newProps) {}

  /**
   * Partially set state
   *
   * @param {Partial<State>} newState
   */
  setState(newState) {
    Object.keys(newState).forEach(key => {
      this.state[key] = newState[key];
    });
  }

  /**
   * Returns the root controller.
   *
   * @returns {ApplicationController} The root controller.
   */
  get rootController() {
    let controller = this;
    while (controller.parent) {
      controller = controller.parent;
    }

    return controller;
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
 *
 * @template {ApplicationControllerConstructor<any>} T
 * @param {T} ControllerClass
 * @param {React.ComponentType<Partial<GetControllerProps<T>>>} ControlledComponent
 * @returns {React.ComponentType<GetControllerProps<T>>}
 */
// eslint-disable-next-line aha-app/no-undocumented-props
function StartControllerScope(ControllerClass, ControlledComponent) {
  // Use React.memo here so if props don't change then we don't re-render and
  // allocate a new controller instance.
  return React.memo(controllerInitialArgs => {
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
 * @template Props
 * @typedef ControllerProps
 * @prop {React.ReactNode} children
 * @prop {ApplicationController<any, Props>} controller
 * @prop {Props} controllerInitialArgs
 */

/**
 * A component that initializes a controller instance and wraps its
 * child with a context containing that instance.
 *
 * @template {{}} Props
 * @type {React.FC<ControllerProps<Props>>}
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
 * @type {React.FC<{controller: ApplicationController}>}
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
 *
 * @template T
 * @returns {T}
 */
const useController = () => {
  const controller = useContext(ControllerContext);

  const statefulController = controller;

  return statefulController;
};

export {
  ApplicationController,
  StartControllerScope,
  Controller,
  ControllerContext,
  ControlledComponent,
  useController,
};
