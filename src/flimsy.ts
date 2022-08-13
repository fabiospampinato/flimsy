
/* TYPES - INTERNAL */

type Callback<T = void> = () => T;

type EqualsFunction<T> = ( value: T, valueNext: T ) => boolean;

type ErrorFunction = ( error: unknown ) => void;

type RootFunction<T> = ( dispose: Callback ) => T;

type UpdateFunction<T> = ( value: T ) => T;

/* TYPES - EXPORTED */

type Getter<T> = {
  (): T
};

type Setter<T> = {
  ( update: UpdateFunction<T> ): T,
  ( value: T ): T
};

type Context<T> = {
  id: symbol,
  defaultValue: T,
  get (): T,
  set ( value: T ): void
};

type Options<T> = {
  equals?: false | EqualsFunction<T>
};

/* GLOBALS */

let BATCH: Map<Signal<any>, any> | undefined;
let OBSERVER: Observer | undefined;
let TRACKING = false;
let SYMBOL_ERRORS = Symbol ();

/* OBJECTS */

class Wrapper {

  /* API */

  static wrap <T> ( fn: Callback<T>, observer: Observer | undefined, tracking: boolean ): T {

    const OBSERVER_PREV = OBSERVER;
    const TRACKING_PREV = TRACKING;

    OBSERVER = observer;
    TRACKING = tracking;

    try {

      return fn ();

    } catch ( error: unknown ) {

      const fns = observer?.get<ErrorFunction[]> ( SYMBOL_ERRORS );

      if ( fns ) {

        fns.forEach ( fn => fn ( error ) );

      } else {

        throw error;

      }

    } finally {

      OBSERVER = OBSERVER_PREV;
      TRACKING = TRACKING_PREV;

    }

  }

}

class Signal<T = unknown> {

  /* VARIABLES */

  public parent: Computation<T> | undefined;
  public value: T;
  public equals: EqualsFunction<T>;
  public observers: Set<Computation> = new Set ();

  /* CONSTRUCTOR */

  constructor ( value: T, { equals }: Options<T> = {} ) {

    this.value = value;
    this.equals = ( equals === false ) ? () => false : equals || Object.is;

  }

  /* API */

  get = (): T => {

    if ( TRACKING && OBSERVER instanceof Computation ) {

      this.observers.add ( OBSERVER );

      OBSERVER.signals.add ( this );

    }

    if ( this.parent?.waiting ) {

      this.parent.update ();

    }

    return this.value;

  }

  set = ( value: UpdateFunction<T> | T ): T => {

    const valueNext = ( value instanceof Function ) ? value ( this.value ) : value;

    if ( !this.equals ( this.value, valueNext ) ) {

      if ( BATCH ) {

        BATCH.set ( this, valueNext );

      } else {

        this.value = valueNext;

        this.stale ( 1 );
        this.stale ( -1 );

      }

    }

    return this.value;

  }

  stale = ( change: 1 | -1 ): void => {

    this.observers.forEach ( observer => {

      observer.stale ( change );

    });

  }

}

class Observer {

  /* VARIABLES */

  public parent: Observer | undefined = OBSERVER;
  public cleanups: Callback[] = [];
  public contexts: Record<symbol, any> = {};
  public observers: Set<Observer> = new Set ();
  public signals: Set<Signal> = new Set ();

  /* API */

  dispose = (): void => {

    this.observers.forEach ( observer => {

      observer.dispose ();

    });

    this.signals.forEach ( signal => {

      signal.observers.delete ( this );

    });

    this.cleanups.forEach ( cleanup => {

      cleanup ();

    });

    this.cleanups = [];
    this.contexts = {};
    this.observers = new Set ();
    this.signals = new Set ();

    this.parent?.observers.delete ( this );

  }

  get = <T> ( id: symbol ): T | undefined => {

    if ( id in this.contexts ) {

      return this.contexts[id];

    } else {

      return this.parent?.get <T> ( id );

    }

  }

  set = <T> ( id: symbol, value: T ): void => {

    this.contexts[id] = value;

  }

}

class Root extends Observer {

  /* API */

  wrap <T> ( fn: RootFunction<T> ): T {

    const fnWithDispose = () => fn ( this.dispose );

    return Wrapper.wrap ( fnWithDispose, this, false );

  }

}

class Computation<T = unknown> extends Observer {

  /* VARIABLES */

  public fn: Callback<T>;
  public signal: Signal<T>;
  public waiting: number = 0;

  /* CONSTRUCTOR */

  constructor ( fn: Callback<T>, options?: Options<T> ) {

    super ();

    this.fn = fn;
    this.signal = new Signal<T> ( this.run (), options );
    this.signal.parent = this;

  }

  /* API */

  run = (): T => {

    this.dispose ();

    this.parent?.observers.add ( this );

    return Wrapper.wrap ( this.fn, this, true );

  }

  update = (): void => {

    this.waiting = 0;

    this.signal.set ( this.run () );

  }

  stale = ( change: 1 | -1 ): void => {

    if ( !this.waiting && change < 0 ) return;

    this.waiting += change;

    this.signal.stale ( change );

    if ( !this.waiting ) {

      this.update ();

    }

  }

}

/* METHODS */

function createSignal <T> (): [Getter<T | undefined>, Setter<T | undefined>];
function createSignal <T> ( value: T, options?: Options<T> ): [Getter<T>, Setter<T>];
function createSignal <T> ( value?, options? ) {

  const {get, set} = new Signal<T> ( value, options );

  return [get, set];

}

function createEffect ( fn: Callback ): void {

  new Computation ( fn );

}

function createMemo <T> ( fn: Callback<T>, options?: Options<T> ): Getter<T> {

  return new Computation ( fn, options ).signal.get;

}

function createRoot <T> ( fn: RootFunction<T> ): T {

  return new Root ().wrap ( fn );

}

function createContext <T> (): Context<T | undefined>;
function createContext <T> ( defaultValue: T ): Context<T>;
function createContext <T> ( defaultValue?: T ) {

  const id = Symbol ();

  const get = (): T | undefined => OBSERVER?.get ( id ) ?? defaultValue;
  const set = ( value: T ): void => OBSERVER?.set ( id, value );

  return { id, defaultValue, get, set };

}

function useContext <T> ( context: Context<T> ): T {

  return context.get ();

}

function onCleanup ( fn: Callback ): void {

  OBSERVER?.cleanups.push ( fn );

}

function onError ( fn: ErrorFunction ): void {

  if ( !OBSERVER ) return;

  OBSERVER.contexts[SYMBOL_ERRORS] ||= [];
  OBSERVER.contexts[SYMBOL_ERRORS].push ( fn );

}

function batch <T> ( fn: Callback<T> ): T {

  if ( BATCH ) return fn ();

  const batch = BATCH = new Map<Signal, any> ();

  try {

    return fn ();

  } finally {

    BATCH = undefined;

    batch.forEach ( ( value, signal ) => signal.stale ( 1 ) );
    batch.forEach ( ( value, signal ) => signal.set ( () => value ) );
    batch.forEach ( ( value, signal ) => signal.stale ( -1 ) );

  }

}

function untrack <T> ( fn: Callback<T> ): T {

  return Wrapper.wrap ( fn, OBSERVER, false );

}

/* EXPORT */

export {createContext, createEffect, createMemo, createRoot, createSignal, onCleanup, onError, useContext, batch, untrack};
export type {Getter, Setter, Context, Options};
