import {
  ApplicationController,
  StartControllerScope,
  ControlledComponent,
  useController,
} from './controller/ApplicationController';
import ApplicationModel, {
  attr,
  belongsTo,
  hasMany,
} from './model/ApplicationModel';
import ApolloModelClient from './model/ApolloModelClient';
import { view as ApplicationView } from '@aha-app/react-easy-state';
import { raw } from '@nx-js/observer-util';
import { randomId } from './utils/randomId';

// Export our public API.
export default ApplicationController;
export {
  // Controller
  ApplicationController,
  StartControllerScope,
  ControlledComponent,
  useController,
  // Model
  ApplicationModel,
  ApolloModelClient,
  attr,
  belongsTo,
  hasMany,
  // View
  ApplicationView,
  // observer.
  raw,
  // utils
  randomId,
};
