import {
  ApplicationController,
  StartControllerScope,
  ControlledComponent,
  useController,
} from './controller/ApplicationController';
// @ts-ignore
import { view } from '@aha-app/react-easy-state';
import { raw, observable, observe, unobserve } from '@nx-js/observer-util';
import { randomId } from './utils/randomId';
import type { ComponentType } from 'react';

type ApplicationView = {
  __ahaMVCApplicationView?: boolean;
};

function ApplicationView<C extends ComponentType>(component: C): C;
function ApplicationView<T extends {}>(
  component: ComponentType<T>
): ComponentType<T>;

function ApplicationView<T extends ComponentType & ApplicationView>(
  component: T
): T {
  component.__ahaMVCApplicationView = true;
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
  observable,
  observe,
  unobserve,
  // utils
  randomId,
};
