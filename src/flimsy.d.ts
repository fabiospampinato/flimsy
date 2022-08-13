declare type Callback<T = void> = () => T;
declare type EqualsFunction<T> = (value: T, valueNext: T) => boolean;
declare type ErrorFunction = (error: unknown) => void;
declare type RootFunction<T> = (dispose: Callback) => T;
declare type UpdateFunction<T> = (value: T) => T;
declare type Getter<T> = {
    (): T;
};
declare type Setter<T> = {
    (update: UpdateFunction<T>): T;
    (value: T): T;
};
declare type Context<T> = {
    id: symbol;
    defaultValue: T;
    get(): T;
    set(value: T): void;
};
declare type Options<T> = {
    equals?: false | EqualsFunction<T>;
};
declare function createSignal<T>(): [Getter<T | undefined>, Setter<T | undefined>];
declare function createSignal<T>(value: T, options?: Options<T>): [Getter<T>, Setter<T>];
declare function createEffect(fn: Callback): void;
declare function createMemo<T>(fn: Callback<T>, options?: Options<T>): Getter<T>;
declare function createRoot<T>(fn: RootFunction<T>): T;
declare function createContext<T>(): Context<T | undefined>;
declare function createContext<T>(defaultValue: T): Context<T>;
declare function useContext<T>(context: Context<T>): T;
declare function onCleanup(fn: Callback): void;
declare function onError(fn: ErrorFunction): void;
declare function batch<T>(fn: Callback<T>): T;
declare function untrack<T>(fn: Callback<T>): T;
export { createContext, createEffect, createMemo, createRoot, createSignal, onCleanup, onError, useContext, batch, untrack };
export type { Getter, Setter, Context, Options };
