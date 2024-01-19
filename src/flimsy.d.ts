type Callback<T = void> = () => T;
type EqualsFunction<T> = (value: T, valueNext: T) => boolean;
type ErrorFunction = (error: unknown) => void;
type RootFunction<T> = (dispose: Callback) => T;
type UpdateFunction<T> = (value: T) => T;
type Getter<T> = {
    (): T;
};
type Setter<T> = {
    (update: UpdateFunction<T>): T;
    (value: T): T;
};
type Context<T> = {
    id: symbol;
    defaultValue: T;
    get(): T;
    set(value: T): void;
};
type Options<T> = {
    equals?: false | EqualsFunction<T>;
};
declare class Signal<T = unknown> {
    parent: Computation<T> | undefined;
    value: T;
    equals: EqualsFunction<T>;
    observers: Set<Computation>;
    constructor(value: T, { equals }?: Options<T>);
    get: () => T;
    set: (value: UpdateFunction<T> | T) => T;
    stale: (change: 1 | -1, fresh: boolean) => void;
}
declare class Observer {
    parent: Observer | undefined;
    cleanups: Callback[];
    contexts: Record<symbol, any>;
    observers: Set<Observer>;
    signals: Set<Signal>;
    dispose: () => void;
    get: <T>(id: symbol) => T;
    set: <T>(id: symbol, value: T) => void;
}
declare class Computation<T = unknown> extends Observer {
    fn: Callback<T>;
    signal: Signal<T>;
    waiting: number;
    fresh: boolean;
    constructor(fn: Callback<T>, options?: Options<T>);
    run: () => T;
    update: () => void;
    stale: (change: 1 | -1, fresh: boolean) => void;
}
declare function createSignal<T>(): [Getter<T | undefined>, Setter<T | undefined>];
declare function createSignal<T>(value: T, options?: Options<T>): [Getter<T>, Setter<T>];
declare function createEffect(fn: Callback): void;
declare function createMemo<T>(fn: Callback<T>, options?: Options<T>): Getter<T>;
declare function createRoot<T>(fn: RootFunction<T>): T;
declare function createContext<T>(): Context<T | undefined>;
declare function createContext<T>(defaultValue: T): Context<T>;
declare function useContext<T>(context: Context<T>): T;
declare function getOwner(): Observer | undefined;
declare function runWithOwner<T>(observer: Observer | undefined, fn: () => T): T;
declare function onCleanup(fn: Callback): void;
declare function onError(fn: ErrorFunction): void;
declare function batch<T>(fn: Callback<T>): T;
declare function untrack<T>(fn: Callback<T>): T;
export { createContext, createEffect, createMemo, createRoot, createSignal, getOwner, runWithOwner, onCleanup, onError, useContext, batch, untrack };
export type { Getter, Setter, Context, Options };
