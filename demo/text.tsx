import React from 'react';
import {
  ApplicationController,
  ApplicationView,
  StartControllerScope,
  useController,
} from '../src';

interface ControllerState {
  values: Record<string, string>;
  value?: string;
}

class TextController extends ApplicationController<ControllerState> {
  get initialState() {
    return { values: { a: 'Hello world' } };
  }

  actionUpdate(id: string, value: string) {
    this.state.values[id] = value;
  }
}

const TextInput = ApplicationView<{ id: string }>(({ id }) => {
  const controller = useController(TextController);
  const { values } = controller.state;

  return (
    <div style={{ margin: '0 0 10px' }}>
      <input
        type='text'
        placeholder={`Value for ${id}`}
        value={values[id] || ''}
        onChange={e => controller.actionUpdate(id, e.target.value)}
      />
    </div>
  );
});

const Text = () => {
  const fields = ['a', 'b'];

  return (
    <div>
      <h1>Text inputs</h1>

      {fields.map(id => (
        <TextInput id={id} key={id} />
      ))}
    </div>
  );
};

export default StartControllerScope(TextController, ApplicationView(Text));
