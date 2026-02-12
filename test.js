// src/controller/ApplicationController.tsx
import React, { useContext, useEffect, useState } from 'react';
import { store } from '@aha-app/react-easy-state';
import Debug from 'debug';

// src/utils/randomId.ts
var add = function (x, y, base) {
  const z = [];
  const n = Math.max(x.length, y.length);
  let carry = 0;
  let i = 0;
  while (i < n || carry) {
    const xi = i < x.length ? x[i] : 0;
    const yi = i < y.length ? y[i] : 0;
    const zi = carry + xi + yi;
    z.push(zi % base);
    carry = Math.floor(zi / base);
    i++;
  }
  return z;
};
var multiplyByNumber = function (num, x, base) {
  if (num < 0) {
    return null;
  }
  if (num === 0) {
    return [];
  }
  let result = [];
  let power = x;
  while (true) {
    if (num & 1) {
      result = add(result, power, base);
    }
    num = num >> 1;
    if (num === 0) {
      break;
    }
    power = add(power, power, base);
  }
  return result;
};
var parseToDigitsArray = function (str, base) {
  const digits = str.split('');
  const ary = [];
  let i = digits.length - 1;
  while (i >= 0) {
    const n = parseInt(digits[i], base);
    if (isNaN(n)) {
      return null;
    }
    ary.push(n);
    i--;
  }
  return ary;
};
var convertBase = function (str, fromBase, toBase) {
  const digits = parseToDigitsArray(str, fromBase);
  if (digits === null) {
    return null;
  }
  let outArray = [];
  let power = [1];
  let i = 0;
  while (i < digits.length) {
    if (digits[i]) {
      outArray = add(
        outArray,
        multiplyByNumber(digits[i], power, toBase),
        toBase
      );
    }
    power = multiplyByNumber(fromBase, power, toBase);
    i++;
  }
  let out = '';
  i = outArray.length - 1;
  while (i >= 0) {
    out += outArray[i].toString(toBase);
    i--;
  }
  return out;
};
var randomId = function () {
  const time = /* @__PURE__ */ new Date();
  const now = Math.round((time.getTime() / 1e3) * 256);
  const now_low = now & 4294967295;
  const now_high = (now - now_low) / 4294967296 - 1;
  const num = [];
  num[0] = (now_high >> 0) & 255;
  num[1] = (now_low >> 24) & 255;
  num[2] = (now_low >> 16) & 255;
  num[3] = (now_low >> 8) & 255;
  num[4] = (now_low >> 0) & 255;
  num[5] = Math.floor(Math.random() * 255);
  num[6] = Math.floor(Math.random() * 255);
  num[7] = Math.floor(Math.random() * 255);
  let hex = '';
  let _i = 0;
  const _len = num.length;
  while (_i < _len) {
    const n = num[_i];
    const h = n.toString(16);
    if (n < 16) {
      hex = `${hex}0${h}`;
    } else {
      hex = hex + h;
    }
    _i++;
  }
  return convertBase(hex, 16, 10);
};

// src/controller/ApplicationController.tsx
import { cloneDeep } from 'lodash';
var debug = Debug('framework:controller');
var ControllerNoActionError = class extends Error {};
var ApplicationController = class {
  constructor() {
    this._debug = Debug(`controller:${this.constructor.name}`);
    this.id = randomId();
    this.initialized = false;
    this.parent = null;
    this.state = void 0;
    this.proxiedThis = new Proxy(this, {
      // Traverse up through the controller hierarchy and find one that responds
      // to the specified action.
      get(targetController, prop, receiver) {
        if (typeof prop === 'string' && prop.startsWith('action')) {
          let currentController = targetController;
          let currentProxy = receiver;
          do {
            if (prop in currentController) {
              return function (...args) {
                return currentController[prop](...args);
              };
            }
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
  async initialize(props) {}
  /**
   * Internal initializer function
   *
   * @hidden
   */
  internalInitialize(parentController, initialArgs) {
    if (!this.initialized) {
      this.parent = parentController;
      debug(
        `Initializing ${this.constructor.name}${parentController ? ' > ' + parentController.constructor.name : ''}`
      );
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
  get initialState() {
    if ('initialState' in this.constructor) {
      return this.constructor.initialState;
    }
    return {};
  }
  /**
   * Internal destroy function. Do not override
   * @private
   */
  internalDestroy() {
    this.destroy();
  }
  /**
   * Finds a controller in this controller's hierarchy that matches a finder.
   */
  findController(finder) {
    let controller = this;
    do {
      if (finder(controller)) {
        return controller;
      }
      controller = controller.parent;
    } while (controller);
  }
  findControllerInstance(controllerClass) {
    return this.findController(
      _controller => _controller instanceof controllerClass
    );
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
  observable(obj) {
    this.state._tempObservable = obj;
    return this.state._tempObservable;
  }
  /**
   * Override in controller class to respond to changes in props
   *
   * @abstract
   */
  changeProps(newProps, oldProps) {}
  /**
   * Partially set state
   */
  setState(newState) {
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
  debug(formatter, ...args) {
    this._debug(formatter, ...args);
  }
};
function StartControllerScope(ControllerClass, ControlledComponent2) {
  return React.memo(controllerInitialArgs => {
    const [controller] = useState(new ControllerClass());
    if (
      controllerInitialArgs == null
        ? void 0
        : controllerInitialArgs.controllerRef
    ) {
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
    return /* @__PURE__ */ React.createElement(
      Controller,
      {
        controller,
        controllerInitialArgs,
        key: controller.id,
      },
      /* @__PURE__ */ React.createElement(ControlledComponent2, {
        ...controllerInitialArgs,
      })
    );
  });
}
var ControllerContext = React.createContext(null);
function Controller({ children, controller, controllerInitialArgs }) {
  const parentController = useContext(ControllerContext);
  controller.internalInitialize(parentController, controllerInitialArgs);
  useEffect(() => {
    return () => {
      debug('Destroying controller');
      controller.internalDestroy();
    };
  }, [controller]);
  return /* @__PURE__ */ React.createElement(
    ControllerContext.Provider,
    { value: controller },
    children
  );
}
var ControlledComponent = ({ children, controller }) => {
  return /* @__PURE__ */ React.createElement(
    ControllerContext.Provider,
    { value: controller },
    children
  );
};
function useController(controllerClass = void 0) {
  let controller = useContext(ControllerContext);
  if (controllerClass) {
    controller = controller.findControllerInstance(controllerClass);
  }
  const statefulController = controller;
  return statefulController;
}

// src/index.ts
import { view } from '@aha-app/react-easy-state';
import { raw, observable, observe, unobserve } from '@nx-js/observer-util';
function ApplicationView(component) {
  return view(component);
}
var src_default = ApplicationController;
export {
  ApplicationController,
  ApplicationView,
  ControlledComponent,
  StartControllerScope,
  src_default as default,
  observable,
  observe,
  randomId,
  raw,
  unobserve,
  useController,
};
//# sourceMappingURL=index.js.map
