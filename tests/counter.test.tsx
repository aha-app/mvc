import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import Counter from '../demo/counter';


describe('counter example', () => {

  it('renders', async () => {

    const {container}=  render(<Counter />);

    expect(screen.getByRole('heading')).toHaveTextContent('Counter example');
    expect(container.querySelector('.count')).toHaveTextContent('0');

    await userEvent.click(screen.getByText('+'));
    await userEvent.click(screen.getByText('+'));
    expect(container.querySelector('.count')).toHaveTextContent('2');

    await userEvent.click(screen.getByText('-'));
    expect(container.querySelector('.count')).toHaveTextContent('-');


  });

})
