# mvc: A simple MVC framework with React views

"Have your state and mutate it too"

This framework combines other libraries to provide a Model-View-Controller (MVC)
architecture for code in the browser. The key libraries are:

- Model - GraphQL
- View - [React](https://reactjs.org/)
- Controller - [React Easy State](https://github.com/RisingStack/react-easy-state)

## Examples

### Basic Counter

The simplest MVC pattern: a controller owns the state, action methods mutate it, and the view re-renders automatically.

```tsx
import {
  ApplicationController,
  ApplicationView,
  StartControllerScope,
  useController,
} from '@aha-app/mvc';

interface CounterState {
  count: number;
}

class CounterController extends ApplicationController<CounterState> {
  get initialState() {
    return { count: 0 };
  }

  actionIncrement() {
    this.state.count += 1;
  }

  actionDecrement() {
    this.state.count -= 1;
  }
}

const Counter = () => {
  const controller = useController(CounterController);
  const { count } = controller.state;

  return (
    <div>
      <p>{count}</p>
      <button onClick={() => controller.actionIncrement()}>+</button>
      <button onClick={() => controller.actionDecrement()}>-</button>
    </div>
  );
};

export default StartControllerScope(
  CounterController,
  ApplicationView(Counter)
);
```

### Lifecycle & Async

Use `initialize` for setup and `destroy` for cleanup. Both are called automatically when the component mounts and unmounts.

```tsx
interface TimerState {
  elapsed: number;
}

class TimerController extends ApplicationController<TimerState> {
  private intervalId: ReturnType<typeof setInterval>;

  get initialState() {
    return { elapsed: 0 };
  }

  async initialize() {
    this.intervalId = setInterval(() => {
      this.actionTick();
    }, 1000);
  }

  destroy() {
    clearInterval(this.intervalId);
  }

  actionTick() {
    this.state.elapsed += 1;
  }

  actionReset() {
    this.state.elapsed = 0;
  }
}

const Timer = () => {
  const controller = useController(TimerController);

  return (
    <div>
      <p>{controller.state.elapsed}s</p>
      <button onClick={() => controller.actionReset()}>Reset</button>
    </div>
  );
};

export default StartControllerScope(
  TimerController,
  ApplicationView(Timer)
);
```

### Nested Components

Scope the controller once at the top of the tree. Any descendant wrapped in `ApplicationView` can access the same controller instance with `useController` and will re-render only when the state it reads changes.

```tsx
interface FormState {
  values: Record<string, string>;
}

class FormController extends ApplicationController<FormState> {
  get initialState() {
    return { values: {} };
  }

  actionUpdate(field: string, value: string) {
    this.state.values[field] = value;
  }
}

const FormField = ApplicationView<{ name: string }>(({ name }) => {
  const controller = useController(FormController);

  return (
    <input
      value={controller.state.values[name] || ''}
      onChange={(e) => controller.actionUpdate(name, e.target.value)}
      placeholder={name}
    />
  );
});

const FormSummary = ApplicationView(() => {
  const controller = useController(FormController);
  const { values } = controller.state;

  return (
    <pre>{JSON.stringify(values, null, 2)}</pre>
  );
});

const Form = () => {
  return (
    <div>
      <FormField name="firstName" />
      <FormField name="lastName" />
      <FormSummary />
    </div>
  );
};

export default StartControllerScope(
  FormController,
  ApplicationView(Form)
);
```

### Parent-Child Controllers

When a child controller is nested inside a parent's component tree, action calls automatically resolve up the hierarchy. A child can also find its parent with `findControllerInstance`.

```tsx
interface AppState {
  notifications: string[];
}

class AppController extends ApplicationController<AppState> {
  get initialState() {
    return { notifications: [] };
  }

  actionNotify(message: string) {
    this.state.notifications.push(message);
  }
}

interface EditorState {
  content: string;
}

class EditorController extends ApplicationController<EditorState, {}, AppController> {
  get initialState() {
    return { content: '' };
  }

  actionUpdateContent(content: string) {
    this.state.content = content;
  }

  actionSave() {
    const app = this.findControllerInstance(AppController);
    app.actionNotify('Document saved');
  }
}

const Notifications = ApplicationView(() => {
  const controller = useController(AppController);

  return (
    <ul>
      {controller.state.notifications.map((msg, i) => (
        <li key={i}>{msg}</li>
      ))}
    </ul>
  );
});

const Editor = () => {
  const controller = useController(EditorController);

  return (
    <div>
      <textarea
        value={controller.state.content}
        onChange={(e) => controller.actionUpdateContent(e.target.value)}
      />
      <button onClick={() => controller.actionSave()}>Save</button>
    </div>
  );
};

const EditorPanel = StartControllerScope(
  EditorController,
  ApplicationView(Editor)
);

const App = () => {
  return (
    <div>
      <Notifications />
      <EditorPanel />
    </div>
  );
};

export default StartControllerScope(
  AppController,
  ApplicationView(App)
);
```

### Observing State Changes

Use `this.observe()` to run side effects whenever observed state changes. Reactions set up this way are automatically cleaned up when the controller is destroyed.

```tsx
interface SearchState {
  query: string;
  results: string[];
}

class SearchController extends ApplicationController<SearchState> {
  get initialState() {
    return { query: '', results: [] };
  }

  async initialize() {
    this.observe(() => {
      const query = this.state.query;
      if (query.length >= 2) {
        this.actionSearch(query);
      }
    });
  }

  actionSetQuery(query: string) {
    this.state.query = query;
  }

  async actionSearch(query: string) {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    this.state.results = await response.json();
  }
}

const Search = () => {
  const controller = useController(SearchController);
  const { query, results } = controller.state;

  return (
    <div>
      <input
        value={query}
        onChange={(e) => controller.actionSetQuery(e.target.value)}
        placeholder="Search..."
      />
      <ul>
        {results.map((result, i) => (
          <li key={i}>{result}</li>
        ))}
      </ul>
    </div>
  );
};

export default StartControllerScope(
  SearchController,
  ApplicationView(Search)
);
```

## Running the demo

```
yarn
yarn demo
```

To run with React in production mode:

```
yarn demo:production
```

## Running the tests

Tests use [jest](https://jestjs.io/) and [testing-library](https://testing-library.com/docs/react-testing-library/intro). To run them:

```
yarn test [--watch]
```

## Objectives

The framework has these objectives:

#### Optimized for developer ergonomics

The first priority is a simple API that is easy for developers to adopt. Any complexity should be hidden within the framework. This also means minimizing caveats and gotchas, so a developer is unlikely to be surprised.

#### Opinionated & familiar to Rails developers

There should be one "right" way code pattern so that developers don't have to think hard about how to organize their code. Where possible we will borrow ideas from Ruby on Rails.

#### Simple state management that just works

Managing state for frameworks like Redux that require immutability for performance places a lot of burden on the developer. Updating immutable structures is more complex. State management should be simple, and not require any more knowledge or methods than vanilla Javascript. This is provided through the magic of [React Easy State](https://github.com/RisingStack/react-easy-state).

#### Explicit model classes

Using plain old javascript objects to represent state models is error prone, and makes it hard to discover what methods can operate on which objects. Typescipt is only solution to this problem, but we believe that explicit model classes with object oriented encapsulation provides a more productive solution when the objective is to create functionality as efficiently as possible. Apollo GraphQL is included as the recommended way to achieve this, but is not strictly necessary and all of the controller benefits can be achieved with a different model implementation.

#### Optimal React re-rendering without developer overhead

Avoiding re-rendering is critical for good React performance. In most cases the developer should not need to write explicit memoization code, or use immutable state, to get this performance. In fact if the framework handles re-render automatically it is likely to give better performance than alternatives where the developer must do it explicitly. This is also provided automatically by React Easy State.

#### Proportionality

The framework should be lightweight enough to be attractive to use for very simple, even single-component, applications. It should also scale to sophisticated applications involving many components and many controllers. A developer should not have to think too hard to determine if it is worth the overhead of introducing the framework - they should always want to reach for it.

## API

## Licensing

mvc is [MIT licensed](./LICENSE) and is Copyright 2020-2023 Aha! Labs Inc.
