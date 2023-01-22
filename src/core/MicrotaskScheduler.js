import { unobserve, observe as unscheduledObserve } from '@nx-js/observer-util';

/**
 * A scheduler for observer-util / react-easy-state observer functions
 * that will batch calls until the next microtask.
 *
 * This is useful when performing actions that modify the same value
 * multiple times, like Array#splice.
 */
class MicrotaskScheduler {
  constructor() {
    this.reactions = new Set();
    this.queuedFlush = false;
  }

  flush() {
    this.reactions.forEach(reaction => reaction());
  }

  queueFlush() {
    if (!this.queuedFlush) {
      queueMicrotask(() => {
        this.flush();
        this.queuedFlush = false;
      });
      this.queuedFlush = true;
    }
  }

  add(reaction) {
    this.reactions.add(reaction);
    this.queueFlush();
  }

  delete(reaction) {
    this.reactions.delete(reaction);
    this.queueFlush();
  }

  static defaultScheduler = new MicrotaskScheduler();
}

/**
 * Observes `fn`, executing if any observed data inside `fn` changes. `fn`
 * uses the microtask scheduler by default, and will only execute once per
 * microtask.
 *
 * @param {() => void} fn the function to run
 * @param {Parameters<typeof unscheduledObserve>[1]} options options, the same as those taken by observer-util's observe.
 */
function observe(fn, options = {}) {
  return unscheduledObserve(fn, {
    scheduler: MicrotaskScheduler.defaultScheduler,
    ...options,
  });
}

export default MicrotaskScheduler;
export { observe, unobserve };
