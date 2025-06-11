import { render } from '@testing-library/react';
import ApplicationController, {
  StartControllerScope,
  useController,
} from '../src/index.ts';

test('controller props can be a subset of component props', () => {
  interface DemoControllerProps {
    a: number;
    b: string;
  }
  interface DemoComponentProps extends DemoControllerProps {
    children: React.ReactNode;
  }
  
  class DemoController extends ApplicationController<{}, DemoControllerProps> {}
  function DemoComponent(props: DemoComponentProps) {
    return <>{props.children}</>;
  }
  const Demo = StartControllerScope(DemoController, DemoComponent);
  
  // this should typecheck correctly
  expect(<Demo a={1}  b='hello'>text</Demo>).toBeTruthy();
});

test('controller props can be disjoint from component props', () => {
  interface DemoControllerProps {
    a: number;
    b: string;
  }
  interface DemoComponentProps {
    children: React.ReactNode;
  }
  
  class DemoController extends ApplicationController<{}, DemoControllerProps> {}
  function DemoComponent(props: DemoComponentProps) {
    return <>{props.children}</>;
  }
  const Demo = StartControllerScope(DemoController, DemoComponent);

  // this should typecheck correctly
  expect(<Demo a={1} b='hello'>world</Demo>).toBeTruthy();
});

test("controller props can't conflict with component props", () => {
  interface DemoControllerProps {
    a: number;
  }
  interface DemoComponentProps {
    a: string;
  }
  
  class DemoController extends ApplicationController<{}, DemoControllerProps> {}
  function DemoComponent(props: DemoComponentProps) {
    return props.a;
  }
  
  // it would be nice if this didn't typecheck correctly, but inferring { a: never } isn't bad
  const Demo = StartControllerScope(DemoController, DemoComponent);
  // this typechecks correctly
  const test: { a: never } extends React.ComponentProps<typeof Demo> ? true : false = true;

  // this should not typecheck correctly
  // @ts-expect-error
  expect(<Demo a={1} />).toBeTruthy();
});

test('controller returned from useController works with instanceof', () => {
  class DemoController extends ApplicationController {}

  function DemoComponent() {
    const controller = useController(DemoController);

    if (!(controller instanceof DemoController)) {
      throw new Error();
    }

    return null;
  }
  
  const Demo = StartControllerScope(DemoController, DemoComponent);

  render(<Demo />);
});
