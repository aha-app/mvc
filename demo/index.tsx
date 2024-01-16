import * as React from 'react';
import * as ReactDOM from 'react-dom';
import Counter from './counter';

export const App = () => {
  return (
    <div>
      <Counter />
    </div>
  );
};

ReactDOM.render(<App />, document.getElementById('root'));
