import * as React from 'react';
import * as ReactDOM from 'react-dom';
import Counter from './counter';
import Text from './text';
import List from './list';

export const App = () => {
  return (
    <div>
      <Counter />
      <Text />
      <List />
    </div>
  );
};

ReactDOM.render(<App />, document.getElementById('root'));
