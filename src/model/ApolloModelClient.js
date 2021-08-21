import {
  ApolloClient,
  InMemoryCache,
  gql,
  from,
  HttpLink,
} from '@apollo/client';
import { MockLink } from '@apollo/client/testing';

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

class ApolloModelClient {
  constructor(options = {}) {
    const httpLink = new HttpLink({
      uri: options.uri || '/api/v2/graphql',
    });

    let links = options.links || [];
    if (options.mocks) {
      links.push(new MockLink(options.mocks));
    } else {
      links.push(httpLink);
    }

    this.apollo = new ApolloClient({
      cache: new InMemoryCache(),
      defaultOptions: {
        query: {
          fetchPolicy: 'network-only',
        },
      },
      link: from(links),
    });

    this.requestQueue = {};
  }

  apiError(message) {
    console.error(`GraphQL API error: ${message}`);
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
      this.apiError(e.message);
      throw new Error(e.message);
    }
    if (result.errors && result.errors.length > 0) {
      const errorMessage = result.errors[0].message;
      this.apiError(errorMessage);
      throw new Error(errorMessage);
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
      this.apiError(e.message);
      throw e;
    }
    if (result.errors && result.errors.length > 0) {
      const errorMessage = result.errors[0].message;
      this.apiError(errorMessage);
    }

    return result.data;
  }
}

export default ApolloModelClient;
