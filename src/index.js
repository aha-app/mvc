import {
  ApplicationController,
  StartControllerScope,
  ControlledComponent,
  useController,
} from "./controller/ApplicationController";
import ApplicationModel, {
  attr,
  belongsTo,
  hasMany,
} from "./model/ApplicationModel";
import { view as ApplicationView } from "@aha-app/react-easy-state";
import { raw } from "@nx-js/observer-util";

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
  attr,
  belongsTo,
  hasMany,
  // View
  ApplicationView,
  // observer.
  raw,
};
