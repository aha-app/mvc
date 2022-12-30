import {
  ApplicationController,
  StartControllerScope,
  ControlledComponent,
  useController,
} from './controller/ApplicationController';
import { view } from '@aha-app/react-easy-state';
import { raw, observe, unobserve } from '@nx-js/observer-util';
import { randomId } from './utils/randomId';

function ApplicationView<T extends React.ComponentType>(component: T): T {
  return view(component);
}

// Export our public API.
export default ApplicationController;
export {
  // Controller
  ApplicationController,
  StartControllerScope,
  ControlledComponent,
  useController,
  // View
  ApplicationView,
  // observer.
  raw,
  observe,
  unobserve,
  // utils
  randomId,
};
