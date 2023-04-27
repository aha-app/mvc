import { ApplicationController, StartControllerScope, ControlledComponent, useController } from './controller/ApplicationController';
import { raw, observe, unobserve } from '@nx-js/observer-util';
import { randomId } from './utils/randomId';
import type { ComponentType } from 'react';
declare function ApplicationView<T extends ComponentType>(component: T): T;
export default ApplicationController;
export { ApplicationController, StartControllerScope, ControlledComponent, useController, ApplicationView, raw, observe, unobserve, randomId, };
