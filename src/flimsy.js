/* TYPES - INTERNAL */
/* GLOBALS */
let BATCH;
let OBSERVER;
let TRACKING = false;
let SYMBOL_ERRORS = Symbol();
/* OBJECTS */
class Wrapper {
    /* API */
    static wrap(fn, observer, tracking) {
        const OBSERVER_PREV = OBSERVER;
        const TRACKING_PREV = TRACKING;
        OBSERVER = observer;
        TRACKING = tracking;
        try {
            return fn();
        }
        catch (error) {
            const fns = observer?.get(SYMBOL_ERRORS);
            if (fns) {
                fns.forEach(fn => fn(error));
            }
            else {
                throw error;
            }
        }
        finally {
            OBSERVER = OBSERVER_PREV;
            TRACKING = TRACKING_PREV;
        }
    }
}
class Signal {
    /* CONSTRUCTOR */
    constructor(value, { equals } = {}) {
        this.observers = new Set();
        /* API */
        this.get = () => {
            if (TRACKING && OBSERVER instanceof Computation) {
                this.observers.add(OBSERVER);
                OBSERVER.signals.add(this);
            }
            if (this.parent?.waiting) {
                this.parent.update();
            }
            return this.value;
        };
        this.set = (value) => {
            const valueNext = (value instanceof Function) ? value(this.value) : value;
            if (!this.equals(this.value, valueNext)) {
                if (BATCH) {
                    BATCH.set(this, valueNext);
                }
                else {
                    this.value = valueNext;
                    this.stale(1, true);
                    this.stale(-1, true);
                }
            }
            return this.value;
        };
        this.stale = (change, fresh) => {
            this.observers.forEach(observer => {
                observer.stale(change, fresh);
            });
        };
        this.value = value;
        this.equals = (equals === false) ? () => false : equals || Object.is;
    }
}
class Observer {
    constructor() {
        /* VARIABLES */
        this.parent = OBSERVER;
        this.cleanups = [];
        this.contexts = {};
        this.observers = new Set();
        this.signals = new Set();
        /* API */
        this.dispose = () => {
            this.observers.forEach(observer => {
                observer.dispose();
            });
            this.signals.forEach(signal => {
                signal.observers.delete(this);
            });
            this.cleanups.forEach(cleanup => {
                cleanup();
            });
            this.cleanups = [];
            this.contexts = {};
            this.observers = new Set();
            this.signals = new Set();
            this.parent?.observers.delete(this);
        };
        this.get = (id) => {
            if (id in this.contexts) {
                return this.contexts[id];
            }
            else {
                return this.parent?.get(id);
            }
        };
        this.set = (id, value) => {
            this.contexts[id] = value;
        };
    }
}
class Root extends Observer {
    /* API */
    wrap(fn) {
        const fnWithDispose = () => fn(this.dispose);
        return Wrapper.wrap(fnWithDispose, this, false);
    }
}
class Computation extends Observer {
    /* CONSTRUCTOR */
    constructor(fn, options) {
        super();
        this.waiting = 0;
        this.fresh = false;
        /* API */
        this.run = () => {
            this.dispose();
            this.parent?.observers.add(this);
            return Wrapper.wrap(this.fn, this, true);
        };
        this.update = () => {
            this.waiting = 0;
            this.signal.set(this.run());
        };
        this.stale = (change, fresh) => {
            if (!this.waiting && change < 0)
                return;
            if (!this.waiting && change > 0) {
                this.signal.stale(1, false);
            }
            this.waiting += change;
            this.fresh || (this.fresh = fresh);
            if (!this.waiting) {
                this.waiting = 0;
                if (this.fresh) {
                    this.update();
                }
                this.signal.stale(-1, false);
            }
        };
        this.fn = fn;
        this.signal = new Signal(this.run(), options);
        this.signal.parent = this;
    }
}
function createSignal(value, options) {
    const { get, set } = new Signal(value, options);
    return [get, set];
}
function createEffect(fn) {
    new Computation(fn);
}
function createMemo(fn, options) {
    return new Computation(fn, options).signal.get;
}
function createRoot(fn) {
    return new Root().wrap(fn);
}
function createContext(defaultValue) {
    const id = Symbol();
    const get = () => OBSERVER?.get(id) ?? defaultValue;
    const set = (value) => OBSERVER?.set(id, value);
    return { id, defaultValue, get, set };
}
function useContext(context) {
    return context.get();
}
function onCleanup(fn) {
    OBSERVER?.cleanups.push(fn);
}
function onError(fn) {
    var _a;
    if (!OBSERVER)
        return;
    (_a = OBSERVER.contexts)[SYMBOL_ERRORS] || (_a[SYMBOL_ERRORS] = []);
    OBSERVER.contexts[SYMBOL_ERRORS].push(fn);
}
function batch(fn) {
    if (BATCH)
        return fn();
    const batch = BATCH = new Map();
    try {
        return fn();
    }
    finally {
        BATCH = undefined;
        batch.forEach((value, signal) => signal.stale(1, false));
        batch.forEach((value, signal) => signal.set(() => value));
        batch.forEach((value, signal) => signal.stale(-1, false));
    }
}
function untrack(fn) {
    return Wrapper.wrap(fn, OBSERVER, false);
}
/* EXPORT */
export { createContext, createEffect, createMemo, createRoot, createSignal, onCleanup, onError, useContext, batch, untrack };
