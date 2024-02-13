import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useState } from 'react';
import {
  ApplicationController,
  StartControllerScope,
  useController,
} from '../src';

interface Props {
  greeting: string;
  greeting2: string;
}

interface State {}

class GreetingController extends ApplicationController<State, Props> {
  get text() {
    return `${this.props.greeting} ${this.props.greeting2}`;
  }
}

let renderCountText = 0;

const Text = () => {
  const controller = useController(GreetingController);
  renderCountText++;

  return <p className='text'>{controller.text}</p>;
};

const Content = StartControllerScope(GreetingController, () => {
  return <Text />;
});

const MyComponent = () => {
  const [greeting, setGreeting] = useState('Hello');

  return (
    <>
      <h1>Reactive props</h1>
      <p>
        Greeting:{' '}
        <input
          name='greeting'
          value={greeting}
          onChange={e => setGreeting(e.target.value)}
        />
      </p>
      <Content greeting={greeting} greeting2={greeting} />
    </>
  );
};

describe('controller props', () => {
  it('update reactively without unneeded renders', async () => {
    renderCountText = 0;

    const { container } = render(<MyComponent />);

    expect(screen.getByRole('heading')).toHaveTextContent('Reactive props');

    expect(renderCountText).toEqual(1);

    const text = container.querySelector('.text');
    const greeting = container.querySelector('[name=greeting]') as Element;

    expect(text).toHaveTextContent('Hello Hello');

    await userEvent.click(greeting);
    await userEvent.keyboard('!');
    expect(text).toHaveTextContent('Hello! Hello!');
    expect(renderCountText).toEqual(2);

    userEvent.paste('!!!');
    expect(text).toHaveTextContent('Hello!!!! Hello!!!!');
    expect(renderCountText).toEqual(3);

    await userEvent.keyboard('{Control>}a{/Control}');
    await userEvent.paste('Bonjour');
    expect(text).toHaveTextContent(/^Bonjour Bonjour$/);
    expect(renderCountText).toEqual(4);
  });

  it('provides old props for comparison in changeProps method', async () => {
    let oldProp, newProp;
    class PropChangeController extends ApplicationController {
      changeProps(newProps, oldProps): void {
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
});
