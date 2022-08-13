# Flimsy

A single-file <1kb min+gzip simplified implementation of the reactive core of [`Solid`](https://www.solidjs.com), optimized for clean code.

Check out the [annotated source](/src/flimsy.annotated.ts), if you'd like to more in depth understand how `Solid` works, or if you'd like to write something similar yourself, this should be a good starting point for you.

## Comparison

Compared to how `Solid`'s reactivity system actually works there are the following (known) differences:

- "Only" these functions are implemented: `createSignal`/`createEffect`/`createMemo`/`createRoot`/`createContext`/`useContext`/`onCleanup`/`onError`/`batch`/`untrack`.
- `createSignal`'s setter doesn't give you the current updated value inside a batch, but instead gives you the same value that the getter would give you.
- `createEffect` doesn't schedule effects, they are executed immediately just like memos. In `Solid` they are scheduled _if_ they exist inside a root.
- `createEffect` and `createMemo` don't pass the previous execution's return value to your function, just put the value in a variable outside of the function yourself to remember it, if you need that.
- `createContext` gives you `get`/`set` functions instead of a `Provider` component, as the `Provider` component only really makes sense in a UI context and `Solid` doesn't expose a lower-level context primitive.
- `createContext`'s `set` function will register the context value with the parent observer, so you need to create a custom parent observer yourself (which is basically what `Provider` does), if you need that.
- `Flimsy` uses a [`MobX`](https://github.com/mobxjs/mobx)-like propagation algorithm, where computations in the reactive graph are marked stale/ready, `Solid` should work similarly, but I don't understand it well enough to know what the differences may be.
- `Flimsy` doesn't care about performance nor memory usage, it instead optimizes for clean code.
- `Flimsy` is probably buggier, hence the name, though if you'd like to use this in production please open an issue, I'll wire it with [`oby`](https://github.com/vobyjs/oby)'s extensive test suite.
- `Solid`'s reactivity system doesn't do anything on the server by default, you'll have to explicitly use the browser build to make it work, `Flimsy` is isomorphic.

## Install

```sh
npm install --save flimsy
```

## Usage

You should be able to use these functions pretty much just like you would use `Solid`'s, for example:

```ts
import {createSignal, createEffect, createMemo} from 'flimsy';

// Make a counter, a memo from the counter, and log both in an effect

const [count, setCount] = createSignal ( 0 );

const double = createMemo ( () => count () * 2 );

createEffect ( () => {

  console.log ( 'count', count () );
  console.log ( 'double', double () );

});
```

## License

MIT © Fabio Spampinato
