# mvc: A simple MVC framework with React views

"Have your state and mutate it too"

This framework combines other libraries to provide a Model-View-Controller (MVC)
architecture for code in the browser. The key libraries are:

- Model - GraphQL
- View - [React](https://reactjs.org/)
- Controller - [React Easy State](https://github.com/RisingStack/react-easy-state)

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

## Example

```js
import React from 'react';
import { ApplicationController, ApplicationView } from '@aha-app/mvc';

class CounterController extends ApplicationController {
  get initializeState() {
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
  const controller = useController();
  const { count } = controller.state;

  return (
    <div>
      <div>{count}</div>
      <div>
        <button onClick={() => controller.actionIncrement()}>+</button>
        <button onClick={() => controller.actionDecrement()}>-</button>
      </div>
    </div>
  );
};

export default ApplicationView(Counter);
```

## API

## Licensing

mvc is [MIT licensed](./LICENSE) and is Copyright 2020-2023 Aha! Labs Inc.
