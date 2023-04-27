import React from 'react';
import type { ComponentType, FC, ReactNode } from 'react';
export type GenericApplicationController = ApplicationController<any, any, any>;
type ApplicationControllerConstructor<P> = {
    new (): {
        initialize(props: P): Promise<void>;
    };
};
type GetControllerConstructor<T> = {
    new (): T;
};
type GetControllerProps<T extends ApplicationControllerConstructor<any>> = T extends ApplicationControllerConstructor<infer P> ? P : never;
/**
 * General rules to follow for using controllers:
 *
 * 1. Any data that should trigger React re-rendering should be stored in
 *    the `state` object.
 * 2. After adding data to `state` get a new reference to it, via the `state`
 *    object before using it again. This ensures that the new access or mutation
 *    is tracked.
 * 3. The `state` object, and any content within it, must only be mutated
 *    inside an `action...` function.
 * 4. Action functions can be called from anywhere, including event handlers,
 *    callbacks, after `await`, render methods, and from within other action
 *    functions.
 *
 */
declare class ApplicationController<State = any, Props = any, Parent extends ApplicationController<any, any, any> = any> {
    id: string;
    initialized: boolean;
    parent: Parent;
    state: State & {
        _tempObservable: any;
    };
    cancelTokens: Record<string, any>;
    proxiedThis: any;
    constructor();
    /**
     * Controllers can override this method to initialize at mount with the
     * original props passed to the controller wrapped component.
     *
     * @abstract
     */
    initialize(props: Props): Promise<void>;
    /**
     * Internal initializer function
     *
     * @hidden
     */
    internalInitialize(parentController: Parent, initialArgs: Props): void;
    /**
     * Controllers can override this method to cleanup when removed
     */
    destroy(): void;
    internalDestroy(): void;
    /**
     * Force a record to be an observed instance that will
     * trigger observers on the controller state.
     *
     * You need this if you're using `.save()` to create a
     * record and want the updated record to trigger state updates.
     */
    observable(obj: any): any;
    /**
     * Run an async function that can be canceled using
     * `cancelPending`. When canceled, the async function will not run
     * its `then` (or anything following the `await`).
     *
     * `scope` is an arbitrary string that can be used in
     * `cancelPending` to cancel only pending functions of a certain
     * type.
     *
     * For example:
     *   await this.cancelable("loadFilters", async () => ...)
     *   this.cancelPending("loadFilters")
     */
    cancelable(scope: string, fn: (signal: any) => Promise<any>): any;
    /**
     * Cancel all running cancelable functions created using `scope`.
     */
    cancelPending(scope: string): void;
    /**
     * Cancel all running cancelable functions.
     */
    cancelAllPending(): void;
    /**
     * Cleanup the cancelable state after the operation is complete.
     */
    finishPending(scope: string): void;
    /**
     * Override in controller class to respond to changes in props
     *
     * @abstract
     */
    changeProps(newProps: Props): void;
    /**
     * Partially set state
     */
    setState(newState: Partial<State>): void;
    /**
     * Extends instances of this controller with the properties defined in
     * `mixin`. Will overwrite any existing properties of the same name.
     */
    static extend(mixin: any): void;
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
declare function StartControllerScope<T extends ApplicationControllerConstructor<any>>(ControllerClass: T, ControlledComponent: ComponentType<Partial<GetControllerProps<T>>>): ComponentType<GetControllerProps<T>>;
export declare const ControllerContext: React.Context<any>;
/**
 * A component that initializes a controller instance and wraps its
 * child with a context containing that instance.
 */
declare function Controller<Props = {}>({ children, controller, controllerInitialArgs, }: {
    children: ReactNode;
    controller: ApplicationController<any, Props, any>;
    controllerInitialArgs: Props;
}): JSX.Element;
/**
 * Associate a controller with existing components. Useful if the same controller
 * needs to live longer than its direct parent in the component hierarchy.
 */
declare const ControlledComponent: FC<{
    controller: ApplicationController<any, any, any>;
}>;
/**
 * Returns the controller instance created by the closest
 * ControllerContext.
 */
declare function useController<T extends ApplicationController>(controllerClass?: GetControllerConstructor<T> | undefined): T;
export { ApplicationController, StartControllerScope, Controller, ControlledComponent, useController, };
