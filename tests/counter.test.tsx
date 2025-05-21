import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import Counter from '../demo/counter';

describe('counter example', () => {
  it('renders and handles state changes', async () => {
    const user = userEvent.setup();

    const { container } = render(<Counter />);

    expect(screen.getByRole('heading')).toHaveTextContent('Simple counter');

    const count = container.querySelector('.count');

    expect(count).toHaveTextContent('0');

    await user.click(screen.getByText('+'));
    await user.click(screen.getByText('+'));
    expect(count).toHaveTextContent('2');

    await user.click(screen.getByText('-'));
    expect(count).toHaveTextContent('1');
  });
});
