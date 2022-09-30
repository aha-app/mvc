declare module "@aha-app/mvc" {
  export class ApplicationController<S, P = {}> {
    state: S;
    parent: ApplicationController<any> | null;
    initialize(props: P): void;
    unlisten(): void;
    subscribe(
      pattern: string | string[],
      action: string | string[],
      callback: Function
    ): string;
    subscribe(pattern: string | string[], callback: Function): string;
    unsubscribe(subscriptionId: string): void;
    observable<T>(obj: T): T;
    cancelable(scope: string, fn: Function): Function;
    cancelPending(scope: string): void;
    cancelAllPending(): void;
    finishPending(scope: string): void;
    changeProps(props: P): void;
    setState(newState: Partial<S>): void;
  }

  export function StartControllerScope<
    P,
    S,
    C extends ApplicationController<S, P>
  >(
    controller: { new (props: P): C },
    component: React.ComponentType
  ): React.ComponentType<P>;
  export function useController<S, C extends ApplicationController<S>>(): C;
  export function ControlledComponent<
    P extends {
      controller: { new (props: P): ApplicationController<any, P> };
    }
  >(props: P): React.ComponentType;
  export function ApplicationView<Component>(c: Component): Component;
}
