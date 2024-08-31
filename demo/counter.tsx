import React from 'react';
import {
  ApplicationController,
  StartControllerScope,
  useController,
} from '../src';

interface ControllerState {
  count: number;
}

class CounterController extends ApplicationController<ControllerState> {
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
      <h1>Simple counter</h1>
      <p className='count'>{count}</p>
      <p>
        <button onClick={() => controller.actionIncrement()}>+</button>
        <button onClick={() => controller.actionDecrement()}>-</button>
      </p>
    </div>
  );
};

export default StartControllerScope(CounterController, Counter);
