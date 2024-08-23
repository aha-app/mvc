import '@testing-library/jest-dom';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useState } from 'react';
import {
  ApplicationController,
  ApplicationView,
  StartControllerScope,
  useController,
} from '../src';

interface Props {}

interface State {
  count: number;
}

class CounterController extends ApplicationController<State, Props> {
  get initialState() {
    return { count: 0 };
  }

  async initialize(props: Props) {
    this.observe(() => this.storeCounterState());
  }

  actionIncrement() {
    this.state.count += 1;
  }

  storedCounter: number;
  storeCounterState() {
    this.storedCounter = this.state.count;
  }
}

let renderCountText = 0;

const Counter = () => {
  const controller = useController(CounterController);
  const { count } = controller.state;

  return (
    <div>
      <h1>Simple counter</h1>
      <p className='count'>{count}</p>
      <p>
        <button onClick={() => controller.actionIncrement()}>+</button>
      </p>
    </div>
  );
};

const ControlledCounter = StartControllerScope(
  CounterController,
  ApplicationView(Counter)
);

describe('observe', () => {
  it('stops running reactions once the controller is destroyed', async () => {
    renderCountText = 0;

    let controller;
    const { container, unmount } = render(
      <ControlledCounter controllerRef={c => (controller = c)} />
    );
    const count = container.querySelector('.count');

    expect(count).toHaveTextContent('0');
    await act(async () => controller.actionIncrement());
    expect(count).toHaveTextContent('1');
    expect(controller.storedCounter).toBe(1);
    unmount();
    console.log('unmounted');
    await act(async () => controller.actionIncrement());
    expect(controller.storedCounter).toBe(1);
  });
});
