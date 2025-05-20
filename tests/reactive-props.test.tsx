import { describe, it, expect, afterEach, vi } from 'vitest';

import '@testing-library/jest-dom/vitest';
// allows testing individual renders and DOM snapshots
import {
  createRenderStream,
  useTrackRenders,
  cleanup,
} from '@testing-library/react-render-stream/pure';

import userEvent from '@testing-library/user-event';
import { Suspense, useEffect, useState } from 'react';
import {
  ApplicationController,
  ApplicationView,
  ControlledComponent,
  StartControllerScope,
  useController,
} from '../src/index.ts';

// > Keep in mind that if you use the /pure import, you have to call the cleanup export manually
// > after each test.
afterEach(() => cleanup());

it('update reactively without unneeded renders', async () => {
  interface Props {}

  interface State {
    greeting: string;
  }

  class GreetingController extends ApplicationController<State, Props> {
    get initialState() {
      return {
        greeting: 'World',
      };
    }
    actionSetGreeting(greeting: string) {
      this.state.greeting = greeting;
    }
  }

  const Text = ApplicationView(() => {
    useTrackRenders({ name: 'Text' });
    const controller = useController(GreetingController);

    return <p data-testid='text'>Hello, {controller.state.greeting}!</p>;
  });

  const Input = ApplicationView(() => {
    useTrackRenders({ name: 'Input' });
    const controller = useController(GreetingController);
    const initialGreeting = controller.initialState.greeting;

    return (
      <p>
        Greeting:{' '}
        <input
          name='greeting'
          // Using only initialState means this component doesn't have to rerender
          // when the greeting changes
          defaultValue={initialGreeting}
          onChange={e => controller.actionSetGreeting(e.target.value)}
        />
      </p>
    );
  });

  const GreetingApp = StartControllerScope(
    GreetingController,
    ApplicationView(() => {
      useTrackRenders({ name: 'GreetingApp' });
      return (
        <>
          <h1>Greeting app</h1>
          <Input />
          <Text />
        </>
      );
    })
  );

  const { takeRender, render } = createRenderStream();

  // Initial render
  const container = await render(<GreetingApp />);
  let { renderedComponents, count } = await takeRender();
  const text = container.getByTestId('text');
  const input = container.getByRole('textbox');

  expect(container.getByRole('heading')).toHaveTextContent('Greeting app');
  expect(count).toEqual(1);
  expect(renderedComponents.sort()).toEqual(['GreetingApp', 'Input', 'Text']);
  expect(text).toHaveTextContent('Hello, World!');

  // Second render
  await userEvent.click(input);
  await userEvent.keyboard('!');
  ({ renderedComponents, count } = await takeRender());

  expect(text).toHaveTextContent('Hello, World!!');
  expect(count).toEqual(2);
  expect(renderedComponents).toEqual(['Text']); // look, no 'Input' or 'GreetingApp'!

  // Third render
  await userEvent.keyboard('{Control>}a{/Control}');
  await userEvent.paste('my ragtime gal');
  ({ renderedComponents, count } = await takeRender());

  expect(text).toHaveTextContent('Hello, my ragtime gal!');
  expect(count).toEqual(3);
  expect(renderedComponents).toEqual(['Text']);
});

it('state is always consistent even with Suspense', async ({
  onTestFinished,
}) => {
  class TearingController extends ApplicationController<{ color: string }> {
    get initialState() {
      return {
        color: 'red',
      };
    }
    // changes color in 16ms, and again at 48 ms
    async initialize() {
      await new Promise(res => setTimeout(res, 16));
      this.state.color = 'blue';
      await new Promise(res => setTimeout(res, 32));
      this.state.color = 'green';
    }
  }

  // Takes 32 ms to load data for SlowComponent
  const fakeLoadData = new Promise<string>(res =>
    setTimeout(() => res("I'm slow."), 32)
  );

  // Takes 32 ms before first render
  const SlowComponent = ApplicationView(() => {
    useTrackRenders({ name: 'SlowComponent' });

    const controller = useController(TearingController);
    const { color } = controller.state;

    const text = use(fakeLoadData);

    return <p style={{ backgroundColor: color }}>{text}</p>;
  });

  const FastComponent = ApplicationView(() => {
    useTrackRenders({ name: 'FastComponent' });

    const controller = useController(TearingController);

    return <p style={{ backgroundColor: controller.state.color }}>I'm fast.</p>;
  });

  const controller = new TearingController();
  controller.internalInitialize(null, {});
  onTestFinished(() => {
    controller.internalDestroy();
  });

  const ColorApp = ApplicationView(() => {
    useTrackRenders({ name: 'ColorApp' });
    return (
      <Suspense fallback='Suspense fallback'>
        <ControlledComponent controller={controller}>
          <FastComponent />
          <SlowComponent />
        </ControlledComponent>
      </Suspense>
    );
  });

  const { takeRender, render, totalRenderCount } = createRenderStream();

  // Initial render with 'red' - SlowComponent not ready, suspends
  const container = await render(<ColorApp />);
  await takeRender();

  expect(container.container).toMatchInlineSnapshot(`
    <div>
      Suspense fallback
    </div>
  `);

  // Color changes from 'red' to 'blue', then SlowComponent resolves. Note that FastComponent,
  // which was already rendered with 'red' when SlowComponent suspended, re-renders with 'blue'
  // for consistency.
  await takeRender();

  expect(container.container).toMatchInlineSnapshot(`
    <div>
      <p
        style="background-color: blue;"
      >
        I'm fast.
      </p>
      <p
        style="background-color: blue;"
      >
        I'm slow.
      </p>
    </div>
  `);

  // Color changes from 'blue' to 'green', and both components are ready
  await takeRender();

  expect(container.container).toMatchInlineSnapshot(`
    <div>
      <p
        style="background-color: green;"
      >
        I'm fast.
      </p>
      <p
        style="background-color: green;"
      >
        I'm slow.
      </p>
    </div>
  `);

  expect(totalRenderCount()).toBe(3);
});

it('provides old props for comparison in changeProps method', async () => {
  type Props = { prop: number };

  let oldProp: number | undefined, newProp: number | undefined;
  class PropChangeController extends ApplicationController<{}, Props> {
    changeProps(newProps: Props, oldProps: Props): void {
      oldProp = oldProps.prop;
      newProp = newProps.prop;
    }
  }

  const controller = new PropChangeController();
  controller.internalInitialize(null, { prop: 1 });

  expect(oldProp).toBe(undefined);
  expect(newProp).toBe(undefined);

  controller.internalInitialize(null, { prop: 2 });

  expect(oldProp).toBe(1);
  expect(newProp).toBe(2);

  controller.internalInitialize(null, { prop: 3 });

  expect(oldProp).toBe(2);
  expect(newProp).toBe(3);
});

// Polyfill of React 19 `use()` function, adapted from
// https://github.com/dai-shi/react18-use/blob/main/src/use.ts
function use<T>(
  usable: PromiseLike<T> & {
    status?: 'pending' | 'fulfilled' | 'rejected';
    value?: T;
    reason?: unknown;
  }
) {
  if (usable.status === 'pending') {
    throw usable;
  } else if (usable.status === 'fulfilled') {
    return usable.value as T;
  } else if (usable.status === 'rejected') {
    throw usable.reason;
  } else {
    usable.status = 'pending';
    usable.then(
      v => {
        usable.status = 'fulfilled';
        usable.value = v;
      },
      e => {
        usable.status = 'rejected';
        usable.reason = e;
      }
    );
    throw usable;
  }
}
