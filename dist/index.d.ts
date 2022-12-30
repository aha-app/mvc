/// <reference types="react" />
declare module "controller/ApplicationController" {
    import React from 'react';
    type UndefApp = ApplicationController<unknown, unknown, unknown> | undefined;
    interface ApplicationController<State = object, Props = object, Parent = UndefApp> {
        constructor: Function & {
            initialState: State;
        };
    }
    class ApplicationController<State = object, Props = object, Parent = UndefApp> {
        static initialState: {};
        static use(): any;
        id: string | null;
        parent: Parent | null;
        state: State & {
            _tempObservable: any;
        };
        subscriptions: [];
        cancelTokens: {};
        proxiedThis: this;
        initialized: boolean;
        constructor();
        initialize(props: Props): void | Promise<void>;
        internalInitialize(parentController: Parent, initialArgs: Props): void;
        internalDestroy(): void;
        unlisten(): void;
        /**
         *  Force a record to be an observed instance that will
         *  trigger observers on the controller state.
         *
         *  You need this if you're using Spraypaint `.save()` to create a
         *  record and want the updated record to trigger state updates.
         */
        observable(obj: any): any;
        changeProps(newProps: Props): void;
        /**
         * Partially set state
         */
        setState(newState: Partial<State>): void;
    }
    /**
     * Wrap a root React component using a new instance of a
     * controller. The controller will receive any props passed to the
     * component in its `initialize` method.
     *
     * When wrapped, any child component can use the `useController` hook
     * to receive the controller instance of its closest ancestor with a
     * ControllerScope.
     *
     * Example:
     *   export default StartControllerScope(WorkflowBoardController, WorkflowBoard);
     *
     * Inside a child component:
     *   const controller = useController();
     *
     * A reference to the controller can be retrieved from the component by
     * passing the `controllerRef` prop a value returned by `useRef()`.
     *
     * Example:
     *
     *   const whiteboardController = useRef();
     *   <Whiteboard controllerRef={whiteboardController} />
     *   ...
     *   whiteboardController.current.actionPanIntoView();
     */
    function StartControllerScope(ControllerClass: any, ControlledComponent: any): React.NamedExoticComponent<object>;
    /**
     * Associate a controller with existing components. Useful if the same controller
     * needs to live longer than its direct parent in the component hierarchy.
     *
     */
    function ControlledComponent({ children, controller }: {
        children: any;
        controller: any;
    }): JSX.Element;
    /**
     * Returns the controller instance created by the closest
     * ControllerContext.
     */
    function useController<Controller extends ApplicationController>(): Controller;
    export { ApplicationController, StartControllerScope, ControlledComponent, useController, };
}
declare module "@aha-app/mvc" {
    import { ApplicationController, StartControllerScope, ControlledComponent, useController } from "controller/ApplicationController";
    import { raw, observe, unobserve } from '@nx-js/observer-util';
    import { randomId } from './utils/randomId';
    function ApplicationView<T extends React.ComponentType>(component: T): T;
    export default ApplicationController;
    export { ApplicationController, StartControllerScope, ControlledComponent, useController, ApplicationView, raw, observe, unobserve, randomId, };
}
