import { createBrowserHistory } from 'history';
import { observe, unobserve } from '@aha-app/mvc';

// Remove leading or trailing slashes from a path segment.
function cleanSegment(segment) {
  return segment.replace(/^\//, '').replace(/\/$/, '');
}

// Helper class for building paths segment by segment.
class PathBuilder {
  constructor() {
    this.path = null;
  }

  segment(str) {
    this.path = this.path || '';
    if (!str?.length) {
      throw new Error(
        `Added empty segment to path in stateToPath after '${this.path}'`
      );
    }
    this.path += '/' + cleanSegment(str);
  }

  addedSegment() {
    return this.path !== null;
  }
}

class RouteBuilder {
  prefix = [];
  routeList = [];

  // Add a namespace.
  namespace(path, subRoutes) {
    this.prefix.push(path);
    subRoutes();
    this.prefix.pop();
  }

  // Add a route.
  add(path, callback) {
    this.routeList.push({
      prefix: [...this.prefix],
      path,
      callback,
    });
  }

  // Generate and return the routing table.
  generate() {
    const routesTable = [];
    for (const route of this.routeList) {
      const path = this.combineSegments([...route.prefix, route.path]);
      const [matcher, paramNames] = this.compilePath(path);

      routesTable.push({
        path,
        matcher,
        paramNames,
        callback: route.callback,
      });
    }
    return routesTable;
  }

  combineSegments(segments) {
    let path = '';
    for (const segment of segments) {
      let cleanedSegment = cleanSegment(segment);

      if (cleanedSegment !== '') {
        path += '/' + cleanedSegment;
      }
    }

    // Verify that * only occurs at end, and only occurs once.
    if (path.match(/\*.*.$/)) {
      throw new Error(
        `'*' can only appear at the end of a route path for '${path}'`
      );
    }
    if (path.match(/\*/g)?.length > 1) {
      throw new Error(`'*' can only appear in a route path once for '${path}'`);
    }

    return path;
  }

  compilePath(path) {
    let regexSource = '^';
    const paramNames = [];

    // Compile parameters.
    regexSource += path
      .replace(/\*/, '') // Remove trailing *
      .replace(/[\\.*+^$?{}|()[\]]/g, '\\$&') // Escape special regex chars
      .replace(/:(\w+)/g, (_, paramName) => {
        paramNames.push(paramName);
        return '([^\\/]+)';
      });

    // Handle a trailing *
    if (path.endsWith('*')) {
      paramNames.push('wildcard');
      regexSource += '(.*)$';
    } else {
      regexSource += '$';
    }

    return [new RegExp(regexSource, 'i'), paramNames];
  }
}

class ApplicationRouter {
  // The routing table. Routes are listed in priority order. Each route is:
  //
  //   {
  //     path,
  //     matcher,
  //     paramNames,
  //     callback,
  //   }
  routes = [];

  // History library instance for wrapping the browser's history and location APIs.
  history = null;
  historyUnlisten = null;

  constructor(controller) {
    this.controller = controller;
    const builder = new RouteBuilder();
    controller.routes(builder);
    this.routes = builder.generate();
    // This is useful when debugging:
    // this.logRoutes();

    this.history = createBrowserHistory();

    // This function is reactive and will execute automatically any time
    // the controller state that it depends upon is modified.
    const observerFunction = () => {
      const builder = new PathBuilder();
      this.controller.stateToPath(builder);

      if (
        builder.addedSegment() &&
        builder.path !== this.history.location.pathname
      ) {
        console.debug(`Router setting location to ${builder.path}`);
        this.history.push(builder.path);
      }
    };
    if (this.controller.stateToPath) {
      this.observer = observe(observerFunction, { lazy: true });
    }
  }

  destroy() {
    if (this.historyUnlisten) {
      this.historyUnlisten();
    }
    if (this.observer) {
      unobserve(this.observer);
    }
  }

  // Bring the application in sync with the browser by navigating to the
  // current path.
  navigateSync() {
    this.navigate(this.history.location.pathname);
    this.observer();

    if (!this.historyUnlisten) {
      // Listen for changes to the current location.
      this.historyUnlisten = this.history.listen((location, action) => {
        if (action === 'POP') {
          this.navigate(location.pathname);
        }
      });
    }
  }

  // Navigate to a path.
  navigate(path) {
    // Find a matching route.
    for (const route of this.routes) {
      const matches = route.matcher.exec(path);
      if (!matches) continue;

      // Found a match.
      console.debug(`Routing: ${path} => ${route.path}`);

      if (matches.length - 1 !== route.paramNames.length) {
        throw new Error(
          `Route returned ${matches.length - 1} matches, but expected ${
            route.paramNames.length
          } for ${route.path}`
        );
      }

      const args = {};
      matches
        .slice(1)
        .forEach((match, index) => (args[route.paramNames[index]] = match));

      route.callback({ controller: this.controller, ...args });

      return;
    }

    console.error(`Could not match route for ${path}`);
  }

  logRoutes() {
    for (const route of this.routes) {
      console.log(`${route.path}`);
    }
  }
}

// Mixin for ApplicationController so that it can synchronize state with the
// browser location.
//
// Use like:
//
//     class MyController extends RoutingBehaviors(ApplicationController) {
//
// or
//
//    class MyController extends ApplicationController {}
//    MyController = RoutingBehaviors(MyController);
//
const RoutingBehaviors = superclass =>
  class extends superclass {
    constructor() {
      super();

      this.router = new ApplicationRouter(this);
    }

    internalDestroy() {
      super.internalDestroy();
      this.router.destroy();
    }
  };

export { PathBuilder };
export default RoutingBehaviors;
