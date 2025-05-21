import {
  ApplicationController,
  StartControllerScope,
  ControlledComponent,
  useController,
  type GenericApplicationController,
} from './controller/ApplicationController';
import { raw, observable, observe, unobserve } from '@nx-js/observer-util';
import { randomId } from './utils/randomId';
import View, { type FCLike } from './view/ApplicationView';

// Export our public API.
export default ApplicationController;
export {
  // Controller
  ApplicationController,
  StartControllerScope,
  ControlledComponent,
  useController,
  // View
  View as ApplicationView,
  // observer.
  raw,
  observable,
  observe,
  unobserve,
  // utils
  randomId,
};

export type { GenericApplicationController, FCLike };
