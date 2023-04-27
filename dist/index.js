// src/controller/ApplicationController.tsx
import React, { useContext, useEffect, useState } from "react";
import { store } from "@aha-app/react-easy-state";
import Debug from "debug";

// src/utils/randomId.ts
var add = function(x, y, base) {
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
var multiplyByNumber = function(num, x, base) {
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
var parseToDigitsArray = function(str, base) {
  const digits = str.split("");
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
var convertBase = function(str, fromBase, toBase) {
  const digits = parseToDigitsArray(str, fromBase);
  if (digits === null) {
    return null;
  }
  let outArray = [];
  let power = [1];
  let i = 0;
  while (i < digits.length) {
    if (digits[i]) {
      outArray = add(outArray, multiplyByNumber(digits[i], power, toBase), toBase);
    }
    power = multiplyByNumber(fromBase, power, toBase);
    i++;
  }
  let out = "";
  i = outArray.length - 1;
  while (i >= 0) {
    out += outArray[i].toString(toBase);
    i--;
  }
  return out;
};
var randomId = function() {
  const time = new Date();
  const now = Math.round(time.getTime() / 1e3 * 256);
  const now_low = now & 4294967295;
  const now_high = (now - now_low) / 4294967296 - 1;
  const num = [];
  num[0] = now_high >> 0 & 255;
  num[1] = now_low >> 24 & 255;
  num[2] = now_low >> 16 & 255;
  num[3] = now_low >> 8 & 255;
  num[4] = now_low >> 0 & 255;
  num[5] = Math.floor(Math.random() * 255);
  num[6] = Math.floor(Math.random() * 255);
  num[7] = Math.floor(Math.random() * 255);
  let hex = "";
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
import CAF from "caf";
import { cloneDeep } from "lodash";
var debug = Debug("framework:controller");
var ControllerNoActionError = class extends Error {
};
var ApplicationController = class {
  constructor() {
    this.id = randomId();
    this.initialized = false;
    this.parent = null;
    this.state = void 0;
    this.cancelTokens = {};
    this.proxiedThis = new Proxy(this, {
      get(targetController, prop, receiver) {
        if (typeof prop === "string" && prop.startsWith("action")) {
          let currentController = targetController;
          let currentProxy = receiver;
          do {
            if (prop in currentController) {
              return function(...args) {
                return currentController[prop](...args);
              };
            }
            currentController = currentController.parent;
            currentProxy = currentProxy.parent;
          } while (currentController);
          throw new ControllerNoActionError(`Unable to find an action ${prop} on ${targetController.constructor.name}`);
        } else {
          return Reflect.get(targetController, prop, receiver);
        }
      },
      has(targetController, prop) {
        if (typeof prop === "string" && prop.startsWith("action")) {
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
      }
    });
    return this.proxiedThis;
  }
  async initialize(props) {
  }
  internalInitialize(parentController, initialArgs) {
    if (!this.initialized) {
      this.parent = parentController;
      debug(`Initializing ${this.constructor.name}${parentController ? " > " + parentController.constructor.name : ""}`);
      this.state = store(cloneDeep(this.constructor.initialState));
      if (this.initialize)
        this.initialize(initialArgs);
      this.initialized = true;
    } else {
      this.changeProps(initialArgs);
    }
  }
  destroy() {
  }
  internalDestroy() {
    this.destroy();
  }
  observable(obj) {
    this.state._tempObservable = obj;
    return this.state._tempObservable;
  }
  cancelable(scope, fn) {
    let token = this.cancelTokens[scope];
    if (!token) {
      token = this.cancelTokens[scope] = new CAF.cancelToken();
    }
    const cancelableFn = CAF(function* (signal) {
      return yield fn(signal);
    });
    return cancelableFn(token.signal);
  }
  cancelPending(scope) {
    if (this.cancelTokens[scope]) {
      this.cancelTokens[scope].abort(`Cancelled pending functions for ${this.constructor.name}/${scope}`);
    }
    delete this.cancelTokens[scope];
  }
  cancelAllPending() {
    Object.keys(this.cancelTokens).forEach((scope) => this.cancelPending(scope));
  }
  finishPending(scope) {
    delete this.cancelTokens[scope];
  }
  changeProps(newProps) {
  }
  setState(newState) {
    Object.keys(newState).forEach((key) => {
      this.state[key] = newState[key];
    });
  }
  static extend(mixin) {
    Object.keys(mixin).forEach((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(mixin, key);
      Object.defineProperty(this.prototype, key, descriptor);
    });
  }
};
function StartControllerScope(ControllerClass, ControlledComponent2) {
  return React.memo((controllerInitialArgs) => {
    const [controller] = useState(new ControllerClass());
    if (controllerInitialArgs == null ? void 0 : controllerInitialArgs.controllerRef) {
      if (typeof controllerInitialArgs.controllerRef === "function") {
        controllerInitialArgs.controllerRef(controller);
      } else if (controllerInitialArgs.controllerRef.hasOwnProperty("current")) {
        controllerInitialArgs.controllerRef.current = controller;
      } else {
        throw new Error("The controllerRef prop must be passed the value provided by useRef() or useCallback().");
      }
    }
    return /* @__PURE__ */ React.createElement(Controller, {
      controller,
      controllerInitialArgs,
      key: controller.id
    }, /* @__PURE__ */ React.createElement(ControlledComponent2, {
      ...controllerInitialArgs
    }));
  });
}
var ControllerContext = React.createContext(null);
function Controller({
  children,
  controller,
  controllerInitialArgs
}) {
  const parentController = useContext(ControllerContext);
  controller.internalInitialize(parentController, controllerInitialArgs);
  useEffect(() => {
    return () => {
      debug("Destroying controller");
      if (controller.destroy)
        controller.destroy();
      controller.internalDestroy();
    };
  }, [controller]);
  return /* @__PURE__ */ React.createElement(ControllerContext.Provider, {
    value: controller
  }, children);
}
var ControlledComponent = ({ children, controller }) => {
  return /* @__PURE__ */ React.createElement(ControllerContext.Provider, {
    value: controller
  }, children);
};
function useController(controllerClass = void 0) {
  let controller = useContext(ControllerContext);
  if (controllerClass) {
    do {
      if (controller.constructor === controllerClass)
        break;
      controller = controller.parent;
    } while (controller);
  }
  const statefulController = controller;
  return statefulController;
}

// src/index.ts
import { view } from "@aha-app/react-easy-state";
import { raw, observe, unobserve } from "@nx-js/observer-util";
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
  observe,
  randomId,
  raw,
  unobserve,
  useController
};
//# sourceMappingURL=index.js.map
