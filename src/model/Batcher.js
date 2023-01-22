import ApplicationModel from './ApplicationModel';
import Fragment from './Fragment';
import { modelAttribute } from './modelBuilder';

export class Batch {
  constructor() {
    this._fragments = [];
    this._aliases = [];
    /**
     * @type {Record<string, Array<(data: unknown, error?: unknown) => void>>}
     */
    this._callbacks = {};
    this._executed = false;
  }

  get length() {
    return this._fragments.length;
  }

  get executed() {
    return this._executed;
  }

  /**
   * @param {Aha.Fragment} fragment
   * @param {((data: unknown, error?: unknown) => void)} callback
   */
  add(fragment, callback) {
    if (this.executed) throw new Error('This batch has already executed');

    // If any of the fragments being batched can be merged together then merge
    // them and combine the callbacks
    for (let index in this._fragments) {
      const existing = this._fragments[index];
      if (existing.name === fragment.name) {
        // It's faster to catch an error than to check if a merge is possible
        try {
          const merged = this._fragments[index].merge(fragment);
          const alias = existing._alias;
          this._fragments[index] = merged;
          this._callbacks[alias].push(callback);
          return;
        } catch (err) {}
      }
    }

    const alias = `query_${this._fragments.length}`;
    this._aliases.push(alias);
    this._fragments.push(fragment.alias(alias));
    this._callbacks[alias] = [callback];
    return alias;
  }

  get fragment() {
    const fragment = this._fragments.reduce((acc, f) => {
      return acc.fragment(f);
    }, new Fragment());

    return fragment;
  }

  async execute() {
    if (this.executed) throw new Error('This batch has already executed');
    this._executed = true;

    // If there's nothing to do return early
    if (this._fragments.length === 0) return [];

    const resolvedFragment = this.fragment.resolve();
    const returnedData = [];

    try {
      this._data = await ApplicationModel.client.query(
        resolvedFragment.toDocument('GetBatch', 'query'),
        {
          variables: resolvedFragment.toVariables(),
        }
      );
    } catch (err) {
      // If an error occurs during fetch then spread it to all waiting listeners
      for (let alias of this._aliases) {
        const callbacks = this._callbacks[alias];
        callbacks.forEach(callback => callback(null, err));
      }

      // Re-raise the error to stop the flow here
      throw err;
    }

    for (let alias of this._aliases) {
      const callbacks = this._callbacks[alias];
      const aliasData = this._data[alias];
      if (aliasData) {
        callbacks.forEach(callback => returnedData.push(callback(aliasData)));
      } else {
        callbacks.forEach(callback =>
          callback(null, new Error(`No data ${alias}`))
        );
      }
    }

    return returnedData;
  }
}

/**
 * Usage:
 *
 * ```js
 * const batcher = new Batcher({timeout: 1000});
 * const [f1, r1] = await Promise.all([
 *   batcher.find(Feature.select('id', 'name'), 'ABC-123'),
 *   batcher.find(Requirement.select('id', 'name', 'ABC-123-1')),
 *   batcher.all(Epic.select('id', 'name').where({projectId: currentProject.id}))
 * ]);
 * ```
 */
export default class Batcher {
  /**
   * @param {Object} options
   * @param {number=} options.timeout Batch will get executed within this timeout in milliseconds
   * @param {number=} options.limit Batch will get executed if it reaches this number of queries
   */
  constructor(options = {}) {
    /** @type {Batch} */
    this._currentBatch = null;
    this._timeout = null;
    this._options = options;
  }

  /**
   * @hidden
   *
   * Get the currently active batch, creating and queing one up if there is not
   * one
   */
  get currentBatch() {
    if (!this._currentBatch) {
      this._currentBatch = new Batch();

      if (this._options.timeout) {
        setTimeout(() => this.executeBatch(), this._options.timeout);
      }
    }
    return this._currentBatch;
  }

  /**
   * Find a model by id
   *
   * @template {Aha.ApplicationModel} M
   * @param {Aha.Query<M>} query
   * @param {string} id
   */
  async find(query, id) {
    const firstQuery = query.argument({ id }).first();
    const fragment = firstQuery.buildQueryFragment();

    return new Promise((resolve, reject) => {
      this.currentBatch.add(fragment, (data, err) => {
        if (err) return reject(err);
        const model = modelAttribute(data, { query: firstQuery });
        resolve(model);
        return model;
      });
      this.checkLimit();
    });
  }

  /**
   * @template {Aha.Query<any, any>} Q
   * @param {Q} query
   * @param {Aha.Filters<Q>} filters
   * @returns {Promise<Aha.QueryModel<Q> | null>}
   */
  async findBy(query, filters) {
    const byQuery = query.where(filters).per(1).multiple();
    const fragment = byQuery.buildQueryFragment();

    return new Promise((resolve, reject) => {
      this.currentBatch.add(fragment, (data, err) => {
        if (err) return reject(err);
        if (!data) return resolve(null);
        const model = modelAttribute(data, { query: byQuery })[0];
        resolve(model);
        return model;
      });
      this.checkLimit();
    });
  }

  /**
   * Get all models using a query
   *
   * @param {import('./Query').default} query
   */
  async all(query) {
    const fragment = query.buildQueryFragment();

    return new Promise((resolve, reject) => {
      this.currentBatch.add(fragment, (data, err) => {
        if (err) return reject(err);
        const list = modelAttribute(data, { query });
        resolve(list);
        return list;
      });
      this.checkLimit();
    });
  }

  /**
   * @hidden
   *
   * Execute the batch immediately if it has reached the query limit
   */
  checkLimit() {
    if (
      this._options.limit &&
      this._options.limit > 0 &&
      this._options.limit <= this.currentBatch.length
    ) {
      this.executeBatch();
    }
  }

  /**
   * @hidden
   *
   * Executes the batch and sets the current batch to null so a new one will be
   * created on the next call
   * @returns {Promise<Array<ApplicationModel|ApplicationModel[]>>}
   */
  async executeBatch() {
    const batch = this._currentBatch;
    this._currentBatch = null;

    // There might not be a batch
    if (batch) return batch.execute();
  }

  /**
   * Manually execute the batch. Optionally provide a callback to add the
   * finders so that the whole batch operation can be wrapped up in this one
   * call.
   *
   * @example
   *   const b = new Batcher();
   *   const [feature, requirements] = await b.execute(() => {
   *     b.find(Feature.select('id'), 'FEAT-123'),
   *     b.all(Requirement.select('id').where({featureId: 'FEAT-123'}))
   *   });
   *
   * @param {((batcher: this) => void)=} batcherUpdate
   * @returns {Promise<Array<ApplicationModel|ApplicationModel[]>>}
   */
  async execute(batcherUpdate) {
    if (batcherUpdate) batcherUpdate(this);
    return this.executeBatch() || [];
  }
}
