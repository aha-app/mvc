/**
 * Stub client for tests and using model classes without an API
 *
 * @implements {ApplicationModelClient}
 */
export default class NullClient {
  apiError(error) {
    console.error(`NullClient API error: ${error.message}`);
  }

  evict(options = {}) {}

  cacheId(attributes = {}) {
    return `${attributes.__typename}:${attributes.id}`;
  }

  /** @template T */
  async query(queryString, options = {}) {
    console.info('Ignoring query on null client');
    return Promise.resolve(/** @type {T} */ ({}));
  }

  /** @template T */
  async mutate(mutationString, options = {}) {
    console.info('Ignoring mutate on null client');
    return Promise.resolve(/** @type {T} */ ({}));
  }
}
