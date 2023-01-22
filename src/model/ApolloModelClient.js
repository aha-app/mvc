import {
  ApolloClient,
  InMemoryCache,
  gql,
  from,
  HttpLink,
} from '@apollo/client';
import { NotFoundError } from './Errors';

/**
 * @typedef {Partial<import('@apollo/client').QueryOptions<any> & { cacheId: string }>} QueryOptions
 */

/**
 * @param {string|import('graphql').DocumentNode} query
 * @returns {import('graphql').DocumentNode}
 */
function toDocumentNode(query) {
  return typeof query === 'string'
    ? gql`
        ${query}
      `
    : query;
}

/**
 * @implements {ApplicationModelClient}
 */
class ApolloModelClient {
  constructor(options = {}) {
    const { addHttpLink = true } = options;

    let links = options.links || [];
    if (options.mocks) {
      throw new Error(
        'Do not pass in mocks directly to ApolloModelClient, instead pass in an MockLink as options.mockLink.'
      );
    }

    if (addHttpLink) {
      const httpLink = new HttpLink({
        uri: options.uri || '/api/v2/graphql',
      });

      links.push(httpLink);
    }

    this.apollo = new ApolloClient({
      cache: new InMemoryCache(),
      defaultOptions: {
        query: {
          // We aren't actively using any caching, and it causes some odd behaviours for card layouts
          fetchPolicy: 'no-cache',
        },
      },
      link: from(links),
    });

    this.requestQueue = {};
  }

  /**
   * @param {Error} error
   * @param {ApiErrorOptions=} options
   */
  apiError(error, options) {
    const { raise = false } = options;
    const { message } = error;

    console.error(`GraphQL API error: ${message}`);

    if (raise) {
      if (/status code 404/.test(message)) {
        throw new NotFoundError(message);
      } else {
        throw error;
      }
    }
  }

  evict(options = {}) {
    return this.apollo.cache.evict(options);
  }

  cacheId(attributes = {}) {
    return this.apollo.cache.identify(attributes);
  }

  /**
   * Sends a GraphQL query.
   *
   * @param {string|import('graphql').DocumentNode} queryString The query GraphQL request, as a plain string
   * @param {QueryOptions} options Options applying to the query
   * @returns {Promise<object>} The JSON response to the query
   */
  async query(queryString, options = {}) {
    const query = toDocumentNode(queryString);

    let result;
    try {
      result = await this.apollo.query({
        query,
        variables: options.variables || {},
        errorPolicy: 'all',
      });
    } catch (e) {
      this.apiError(e, { raise: true });
    }
    if (result.errors && result.errors.length > 0) {
      const errorMessage = result.errors[0].message;
      this.apiError(new Error(errorMessage), { raise: true });
    }
    return result.data;
  }

  /**
   * Sends a GraphQL mutation request.
   *
   * @param {string|import('graphql').DocumentNode} mutationString The mutation GraphQL query, as a plain string
   * @param {object} options Options applying to the mutation
   * @returns {Promise<object>} The JSON response to the query
   */
  async mutate(mutationString, options = {}) {
    const mutation = toDocumentNode(mutationString);

    let result;

    try {
      result = await this.apollo.mutate({
        mutation,
        variables: options.variables || {},
      });
    } catch (e) {
      this.apiError(e, { raise: true });
    }
    if (result.errors && result.errors.length > 0) {
      const errorMessage = result.errors[0].message;
      this.apiError(new Error(errorMessage));
      throw new Error(errorMessage);
    }

    return result.data;
  }
}

export default ApolloModelClient;
