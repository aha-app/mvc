import React, { useContext, useEffect, useState } from 'react';
import { store } from '@aha-app/react-easy-state';
import Debug from 'debug';
//import ReactiveRegister from 'javascripts/reactive_register';
import { randomId } from '../utils/randomId';
import CAF from 'caf';
import _ from 'lodash';

const debug = Debug('framework:controller');

class ControllerNoActionError extends Error {}

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
class ApplicationController {
  constructor() {
    this.id = randomId();
    this.parent = null;
    this.state = undefined;
    this.subscriptions = [];
    this.cancelTokens = {};

    return new Proxy(this, {
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
  }

  internalInitialize(parentController, initialArgs) {
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
   * Subscribe to a reactive update based on pattern and action.
   *
   * @param {string | string[]} pattern a reactive update pattern. Example: "Project-123/Feature-456"
   * @param {string} action_or_callback one of ["create", "update", "destroy"]
   * @param {function} callback a function that receives the parentId and childId of a reactive update. Example: callback("projects-123", "features-456")
   */
  subscribe(pattern, action_or_callback, callback) {
    if (!callback) {
      callback = action_or_callback;
      action_or_callback = ['create', 'update', 'destroy'];
    }
    const subscribedActions =
      action_or_callback instanceof Array
        ? action_or_callback
        : [action_or_callback];

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
    /*TODO: ReactiveRegister.register(
      subscriptionId,
      pattern,
      async (change, ownPageChanges, ownComponentChanges, messageClientId) => {
        if (messageClientId === window.frameworkClientId()) {
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
    );*/
    return subscriptionId;
  }

  unsubscribe(subscriptionId) {
    // TODO: ReactiveRegister.deregister(subscriptionId);
    const index = this.subscriptions.indexOf(subscriptionId);
    if (index >= 0) this.subscriptions.splice(index, 1);
  }

  unsubscribeAll() {
    this.subscriptions.slice().forEach(subscriptionId => {
      this.unsubscribe(subscriptionId);
    });
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

  changeProps(newProps) {
    // Override in sub-class to respond to changes in props.
  }

  /**
   * Partially set state
   */
  setState(newState) {
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
 */
function StartControllerScope(ControllerClass, ControlledComponent) {
  // Use React.memo here so if props don't change then we don't re-render and
  // allocate a new controller instance.
  return React.memo(controllerInitialArgs => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [controller] = useState(new ControllerClass());
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
  ControlledComponent,
  useController,
};
