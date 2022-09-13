
/* TYPES - INTERNAL */

type Callback<T = void> = () => T;

type EqualsFunction<T> = ( value: T, valueNext: T ) => boolean;

type ErrorFunction = ( error: unknown ) => void;

type RootFunction<T> = ( dispose: Callback ) => T;

type UpdateFunction<T> = ( value: T ) => T;

/* TYPES - EXPORTED */

// Type for the getter function for signals
type Getter<T> = {
  (): T
};

// Type for the setter function for signals
type Setter<T> = {
  // It can either be called with an update function, which will be called with the current value
  ( update: UpdateFunction<T> ): T,
  // Or the new value directly, it mustn't be a function though, or it will treated as an update function
  ( value: T ): T
};

type Context<T> = {
  // Unique identifier for the context
  id: symbol,
  // Default value for the context
  defaultValue: T,
  // Function that reads the value from the context
  get (): T,
  // Function that sets the value on the context of the nearest observer
  set ( value: T ): void
};

// Type for the options that signals support
type Options<T> = {
  // Custom equality function, which is either a function that checks for equality of two values, or "false", which behaves like using "() => false", i.e. the signal will always trigger and update
  equals?: false | EqualsFunction<T>
};

/* GLOBALS */

// It says whether we are currently batching and where to keep the pending values
let BATCH: Map<Signal<any>, any> | undefined;
// It says what the current observer is, depending on the call stack, if any
let OBSERVER: Observer | undefined;
// Whether signals should register themselves as dependencies for the parent computation or not
let TRACKING = false;
// Unique symbol for errors, so that we can store them in the context and reuse the code for that
let SYMBOL_ERRORS = Symbol ();

/* OBJECTS */

// Useless class wrapper
class Wrapper {

  /* API */

  // Function that executes a function and sets the OBSERVER and TRACKING variables
  // Basically it keeps track of what the previous OBSERVER and TRACKING values were, sets the new ones, and then restores the old ones back after the function has finished executing
  static wrap <T> ( fn: Callback<T>, observer: Observer | undefined, tracking: boolean ): T {

    const OBSERVER_PREV = OBSERVER;
    const TRACKING_PREV = TRACKING;

    OBSERVER = observer;
    TRACKING = tracking;

    // Important to wrap this in a try..catch as the function may throw, messing up the restoration
    try {

      return fn ();

    // Catching the error, as the observer, or one of its ancestors, may be able to handle it via an error handler
    } catch ( error: unknown ) {

      // Getting the closest error handlers
      const fns = observer?.get<ErrorFunction[]> ( SYMBOL_ERRORS );

      // Some handlers, just calling them then
      if ( fns ) {

        fns.forEach ( fn => fn ( error ) );

      // No handlers, throwing
      } else {

        throw error;

      }

    } finally {

      OBSERVER = OBSERVER_PREV;
      TRACKING = TRACKING_PREV;

    }

  }

}

// Signals make values reactive, as going through function calls to get/set values for them enables the automatic dependency tracking and computation re-execution
class Signal<T = unknown> {

  /* VARIABLES */

  // It's important to keep track of the "parent" memo, if any, because we need to know when reading a signal if it belongs to a parent which isn't up to date, so that we can refresh it in that case
  public parent: Computation<T> | undefined;
  // The current value of the signal
  public value: T;
  // The equality function
  public equals: EqualsFunction<T>;
  // List of observers to notify when the value of the signal changes
  // It's a set because sooner or later we must deduplicate registrations
  // Like, if a signal is read multiple times inside an observer the observer must still be only refreshed once when that signal is updated
  public observers: Set<Computation> = new Set ();

  /* CONSTRUCTOR */

  constructor ( value: T, { equals }: Options<T> = {} ) {

    this.value = value;
    // Expanding "false" to "() => false"
    // "false" is just a convenient shortcut for that
    this.equals = ( equals === false ) ? () => false : equals || Object.is;

  }

  /* API */

  // Getting the value from the signal
  get = (): T => {

    // Registering the signal as a dependency, if we are tracking and the parent is a computation (which can be re-executed, in contrast with roots for example)
    if ( TRACKING && OBSERVER instanceof Computation ) {

      this.observers.add ( OBSERVER );

      OBSERVER.signals.add ( this );

    }

    // There is a parent and it's stale, we need to refresh it first
    // Refreshing the parent may cause other computations to be refreshed too, if needed
    // If we don't do this we get a "glitch", your code could simulaneously see values that don't make sense toghether, like "count" === 3 and "doubleCount" === 4 because it hasn't been updated yet maybe
    if ( this.parent?.waiting ) {

      this.parent.update ();

    }

    return this.value;

  }

  // Updating the value
  set = ( value: UpdateFunction<T> | T ): T => {

    // Resolving the passed value, if it's a function it's called with the current value
    const valueNext = ( value instanceof Function ) ? value ( this.value ) : value;

    // Are they equal according to the equals function? If they are there's nothing to do, nothing changed, nothing to re-run
    if ( !this.equals ( this.value, valueNext ) ) {

      // Are we batching? If so let's store this new value for later
      if ( BATCH ) {

        BATCH.set ( this, valueNext );

      } else {

        // Setting the new value for the signal
        this.value = valueNext;

        // Notifying observers now

        // First of all the observers and their observers and so on are marked as stale
        // We also tell them that something actually changed, so when it comes down to it they should update themselves
        this.stale ( 1, true );

        // Then they are marked as non-stale
        // We also tell them that something actually changed, so when it comes down to it they should update themselves
        this.stale ( -1, true );

        // It looks silly but this is crucial
        // Basically if we don't do that computations might be executed multiple times
        // We want to execute them as few times as possible to get the best performance
        // Also while Flimsy doesn't care about performance notifying observers like this is easy and robust

      }

    }

    return this.value;

  }

  // Propagating change of the "stale" status to every observer of this signal
  // +1 means a signal you depend on is stale, wait for it
  // -1 means a signal you depend on just became non-stale, maybe you can update yourself now if you are not waiting for anything else
  // The "fresh" value tells observers whether something actually changed or not
  // If nothing changed, not for this signal nor for any other signal that a computation is listening to, then the computation will just not be re-executed, for performance
  // If at least one signal changed the computation will eventually be re-executed
  stale = ( change: 1 | -1, fresh: boolean ): void => {

    this.observers.forEach ( observer => {

      observer.stale ( change, fresh );

    });

  }

}

// An observer is something that can have signals as dependencies
class Observer {

  /* VARIABLES */

  // The parent observer, if any, we need this because context reads and errors kind of bubble up
  public parent: Observer | undefined = OBSERVER;
  // List of custom cleanup functions to call
  public cleanups: Callback[] = [];
  // Object containg data for the context, plus error handlers, if any, since we are putting those there later in this file
  public contexts: Record<symbol, any> = {};
  // List of child observers, we need this because when this observer is disposed it has to tell its children to dispose themselves too
  public observers: Set<Observer> = new Set ();
  // List of signals that this observer depends on, we need this because when this observer is disposed it has to tell signals to not refresh it anymore
  public signals: Set<Signal> = new Set ();

  /* API */

  // Disposing, clearing everything
  dispose = (): void => {

    // Clearing child observers, recursively
    this.observers.forEach ( observer => {

      observer.dispose ();

    });

    // Clearing signal dependencies
    this.signals.forEach ( signal => {

      signal.observers.delete ( this );

    });

    // Calling custom cleanup functions
    this.cleanups.forEach ( cleanup => {

      cleanup ();

    });

    // Actually emptying the intenral objects
    this.cleanups = [];
    this.contexts = {};
    this.observers = new Set ();
    this.signals = new Set ();

    // Unlinking it also from the parent, not doing this will cause memory leaks because this observer won't be garbage-collected as long as its parent is alive
    this.parent?.observers.delete ( this );

  }

  // Getting something from the context
  get = <T> ( id: symbol ): T | undefined => {

    // Do we have a value for this id?
    if ( id in this.contexts ) {

      return this.contexts[id];

    // Does the parent have a value for this id?
    } else {

      return this.parent?.get <T> ( id );

    }

  }

  // Setting something in the context
  set = <T> ( id: symbol, value: T ): void => {

    this.contexts[id] = value;

  }

}

// A root is a special kind of observer, the function passed to it receives the "dispose" function
// Plus in contrast to Computations the function here will not be re-executed
// Plus a root doesn't link itself with its parent, so the parent won't dispose of child roots simply because it doesn't know about them. As a consequence you'll have to eventually dispose of roots yourself manually
// Still the Root has to know about its parent, because contexts reads and errors bubble up
class Root extends Observer {

  /* API */

  wrap <T> ( fn: RootFunction<T> ): T {

    // Making a customized function, so that we can reuse the Wrapper.wrap function, which doesn't pass anything to our function
    const fnWithDispose = () => fn ( this.dispose );

    // Calling our function, with "this" as the current observer, and "false" as the value for TRACKING
    return Wrapper.wrap ( fnWithDispose, this, false );

  }

}

// A computation is an observer like a root, but it can be re-executed and it can be disposed from its parent
class Computation<T = unknown> extends Observer {

  /* VARIABLES */

  // Function to potentially re-execute
  public fn: Callback<T>;
  // Internal signal holding the last value returned by the function
  public signal: Signal<T>;
  // Little counter to keep track of the stale status of this computation
  // waiting > 0 means that number of our dependencies are stale, so we should wait for them if we can
  // waiting === 0 means this computation contains a fresh value, it's not waiting for anything, all of its dependencies are up-to-date
  // waiting < 0 doesn't make sense and never happens
  public waiting: number = 0;
  // The fresh flag tells the computation whether one of its dependencies changed or not, if some of its dependencies got re-executed but nothing really changed then we just don't re-execute this computation
  public fresh: boolean = false;

  /* CONSTRUCTOR */

  constructor ( fn: Callback<T>, options?: Options<T> ) {

    super ();

    this.fn = fn;
    // Creating the internal signal, we have a dedicated "run" function because we don't want to call `signal.set` the first time, because if we did that we might have a bug if we are using a custom equality comparison as that would be called with "undefined" as the current value the first time
    this.signal = new Signal<T> ( this.run (), options );
    // Linking this computation with the parent, so that we can get a reference to the computation from the signal when we want to check if the computation is stale or not
    this.signal.parent = this;

  }

  /* API */

  // Execute the computation
  // It first disposes of itself basically
  // Then it re-executes itself
  // This way dynamic dependencies become possible also
  run = (): T => {

    // Disposing
    this.dispose ();

    // Linking with parent again
    this.parent?.observers.add ( this );

    // Doing whatever the function does, "this" becomes the observer and "true" means we are tracking the function
    return Wrapper.wrap ( this.fn, this, true );

  }

  // Same as run, but also update the signal
  update = (): void => {

    // Resetting "waiting", as it may be > 0 here if the computation got forcefully refreshed
    this.waiting = 0;

    // Doing whatever run does and updating the signal
    this.signal.set ( this.run () );

  }

  // Propagating change of the "stale" status to every observer of the internal signal
  // Propagating a "false" "fresh" status too, it will be the signal itself that will propagate a "true" one when and if it will actually change
  stale = ( change: 1 | -1, fresh: boolean ): void => {

    // If this.waiting is already 0 but change is -1 it means the computation got forcefully refreshed already
    // So there's nothing to do here, refreshing again would be wasteful and setting this to -1 would be non-sensical
    if ( !this.waiting && change < 0 ) return;

    // Marking computations depending on us as stale
    // We only need to do this once, when the "waiting" counter goes from 0 to 1
    // We also tell them that nothing changed, becuase we don't know if something will change yet
    if ( !this.waiting && change > 0 ) {

      this.signal.stale ( 1, false );

    }

    // Update the counter
    this.waiting += change;

    // Internally we need to use the "fresh" status we recevied to understand if at least one of our dependencies changed
    this.fresh ||= fresh;

    // Are we still waiting for something?
    if ( !this.waiting ) {

      // Resetting the counter now, as maybe the update function won't be executed
      this.waiting = 0;

      // Did something actually change? If so we actually update
      if ( this.fresh ) {

        this.update ();

      }

      // Now finally we mark computations depending on us as unstale
      // We still tell them that we don't know if something changed here
      // if something changed the signal itself will propagate its own true "fresh" status
      this.signal.stale ( -1, false );

    }

  }

}

/* METHODS */

function createSignal <T> (): [Getter<T | undefined>, Setter<T | undefined>];
function createSignal <T> ( value: T, options?: Options<T> ): [Getter<T>, Setter<T>];
function createSignal <T> ( value?, options? ) {

  // Basically pulling apart getter and setter into dedicated functions, to get read/write segregation
  const {get, set} = new Signal<T> ( value, options );

  return [get, set];

}

function createEffect ( fn: Callback ): void {

  // An effect is just a computation that doesn't return anything
  new Computation ( fn );

}

function createMemo <T> ( fn: Callback<T>, options?: Options<T> ): Getter<T> {

  // A memo is a computation that returns a getter to its internal signal, which holds the last return value of the function
  return new Computation ( fn, options ).signal.get;

}

function createRoot <T> ( fn: RootFunction<T> ): T {

  // A root is just a plain observer that exposes the "dispose" method and that will survive its parent observer being disposed
  // Roots are essential for achieving great formance with things like <For> in Solid
  return new Root ().wrap ( fn );

}

function createContext <T> (): Context<T | undefined>;
function createContext <T> ( defaultValue: T ): Context<T>;
function createContext <T> ( defaultValue?: T ) {

  // Making a new identifier for this context
  const id = Symbol ();

  // Making get/set functions dedicated to this context
  // If the getter finds null or undefined as the value then the default value is returned instead
  const get = (): T | undefined => OBSERVER?.get ( id ) ?? defaultValue;
  const set = ( value: T ): void => OBSERVER?.set ( id, value );

  return { id, defaultValue, get, set };

}

function useContext <T> ( context: Context<T> ): T {

  // Just calling the getter
  // this function is implemented for compatibility with Solid
  // Solid's implementation of this is a bit more interesting because it doesn't expose a "get" method on the context directly that can just be called like this
  return context.get ();

}

function onCleanup ( fn: Callback ): void {

  // If there's a current observer let's add a cleanup function to it
  OBSERVER?.cleanups.push ( fn );

}

function onError ( fn: ErrorFunction ): void {

  if ( !OBSERVER ) return;

  // If there's a current observer let's add an error handler function to it, ensuring the array containing these functions exists first though
  OBSERVER.contexts[SYMBOL_ERRORS] ||= [];
  OBSERVER.contexts[SYMBOL_ERRORS].push ( fn );

}

// Batching is an important performance feature, it holds onto updates until the function has finished executing, so that computations are later re-executed the minimum amount of times possible
// Like if you change a signal in a loop, for some reason, then without batching its observers will be re-executed with each iteration
// With batching they are only executed at this end, potentially just 1 time instead of N times
// While batching is active the getter will give you the "old" value of the signal, as the new one hasn't actually been be set yet
function batch <T> ( fn: Callback<T> ): T {

  // Already batching? Nothing else to do then
  if ( BATCH ) return fn ();

  // New batch bucket where to store upcoming values for signals
  const batch = BATCH = new Map<Signal, any> ();

  // Important to use a try..catch as the function may throw, messing up our flushing of updates later on
  try {

    return fn ();

  } finally {

    // Turning batching off
    BATCH = undefined;

    // Marking all the signals as stale, all at once, or each update to each signal will cause its observers to be updated, but there might be observers listening to multiple of these signals, we want to execute them once still if possible
    // We don't know if something will change, so we set the "fresh" flag to "false"
    batch.forEach ( ( value, signal ) => signal.stale ( 1, false ) );
    // Updating values
    batch.forEach ( ( value, signal ) => signal.set ( () => value ) );
    // Now making all those signals as not stale, allowing observers to finally update themselves
    // We don't know if something did change, so we set the "fresh" flag to "false"
    batch.forEach ( ( value, signal ) => signal.stale ( -1, false ) );

  }

}

function untrack <T> ( fn: Callback<T> ): T {

  // Turning off tracking
  // The observer stays the same, but TRACKING is set to "false"
  return Wrapper.wrap ( fn, OBSERVER, false );

}

/* EXPORT */

export {createContext, createEffect, createMemo, createRoot, createSignal, onCleanup, onError, useContext, batch, untrack};
export type {Getter, Setter, Context, Options};
