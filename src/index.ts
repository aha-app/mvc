import {
  ApplicationController,
  ControlledComponent,
  StartControllerScope,
  useController,
} from './controller/ApplicationController';
import { observable, observe, raw, unobserve } from '@nx-js/observer-util';
import { ApplicationView } from './ApplicationView';
import { randomId } from './utils/randomId';

// Export our public API.
export default ApplicationController;
export {
  // Controller
  ApplicationController,
  // View
  ApplicationView,
  ControlledComponent,
  StartControllerScope,
  observable,
  observe,
  // utils
  randomId,
  // observer.
  raw,
  unobserve,
  useController,
};
