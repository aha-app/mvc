import * as React from 'react';
import * as ReactDOM from 'react-dom';
import Counter from './counter';
import Text from './text';

export const App = () => {
  return (
    <div>
      <Counter />
      <Text />
    </div>
  );
};

ReactDOM.render(<App />, document.getElementById('root'));
