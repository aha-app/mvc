import React from 'react';
import ApplicationController, {
  StartControllerScope,
  useController,
} from '../src';

class Item {
  id: string;
  name: string;
  done: boolean;

  constructor(name: string) {
    this.id = String(Date.now());
    this.name = name;
    this.done = false;
  }

  markDone() {
    this.done = true;
  }
}

interface State {
  items: Array<Item>;
}

class ListController extends ApplicationController<State> {
  get initialState() {
    return { items: [] };
  }

  actionAdd(name: string) {
    this.state.items.push(new Item(name));
  }

  actionRemove(id: string) {
    const index = this.state.items.findIndex(item => item.id === id);
    if (index !== -1) {
      this.state.items.splice(index, 1);
    }
  }

  actionToggle(id: string) {
    const item = this.state.items.find(item => item.id === id);
    if (item) {
      item.markDone();
    }
  }

  actionUpdate(id: string, name: string) {
    const item = this.state.items.find(item => item.id === id);
    if (item) {
      item.name = name;
    }
  }
}

const ListItem: React.FC<{ itemId: string }> = ({ itemId }) => {
  const controller = useController(ListController);
  const item = controller.state.items.find(item => item.id === itemId)!;

  return (
    <div style={{ margin: '0 0 10px' }}>
      <input
        type='checkbox'
        checked={item.done}
        onChange={() => controller.actionToggle(item.id)}
      />
      <input
        type='text'
        value={item.name}
        onChange={e => controller.actionUpdate(item.id, e.target.value)}
      />
      <button onClick={() => controller.actionRemove(item.id)}>Remove</button>
    </div>
  );
};

const List = () => {
  const controller = useController(ListController);

  return (
    <div>
      <h1>Todo list</h1>
      <input
        type='text'
        placeholder='New item'
        onKeyDown={e => {
          if (e.key === 'Enter') {
            controller.actionAdd(e.currentTarget.value);
            e.currentTarget.value = '';
          }
        }}
      />

      {controller.state.items.map(item => (
        <ListItem itemId={item.id} key={item.id} />
      ))}
    </div>
  );
};

export default StartControllerScope(ListController, List);
