import { gql } from '@apollo/client';
import { print } from 'graphql';
import ApplicationModel from './ApplicationModel';
import Batcher from './Batcher';

const { Feature, Epic } = ApplicationModel.models;

/**
 * @implements {ApplicationModelClient}
 */
class TestClient {
  constructor() {
    this.responses = [];
    this.queries = [];
  }
  evict(options = {}) {}
  cacheId(attributes = {}) {
    return '1';
  }
  /**
   * @param {Error} error
   * @param {ApiErrorOptions} options
   */
  apiError(error, options) {
    throw error;
  }

  add(response) {
    this.responses.push(response);
  }

  async query(queryString, options = {}) {
    this.queries.push([queryString, options]);
    const nextResponse = this.responses.shift();
    return Promise.resolve(nextResponse);
  }
  async mutate(queryString, options = {}) {
    const nextResponse = this.responses.shift();
    return Promise.resolve(nextResponse);
  }
}
describe('Batcher', () => {
  let testClient;
  const prevClient = ApplicationModel.client;

  beforeEach(() => {
    testClient = new TestClient();
    ApplicationModel.client = testClient;
  });

  afterEach(() => (ApplicationModel.client = prevClient));

  describe('timeout only', () => {
    it('runs synchonous queries separately', async () => {
      testClient.add({
        query_0: { __typename: 'Feature', name: 'hello' },
      });
      testClient.add({
        query_0: { __typename: 'Feature', name: 'bye' },
      });

      const b = new Batcher({ timeout: 10 });
      const f1 = await b.find(Feature.select('name'), 'ABC-123');
      const f2 = await b.find(Feature.select('name'), 'ABC-321');

      expect(f1.name).toEqual('hello');
      expect(f2.name).toEqual('bye');
    });

    it('combines all queries added at the same time', async () => {
      testClient.add({
        query_0: { __typename: 'Feature', name: 'hello' },
        query_1: { __typename: 'Feature', name: 'bye' },
      });

      const b = new Batcher({ timeout: 10 });
      const p1 = b.find(Feature.select('name'), 'ABC-123');
      const p2 = b.find(Feature.select('name'), 'ABC-321');
      const [f1, f2] = await Promise.all([p1, p2]);

      const query = print(testClient.queries[0][0]);
      expect(query).toEqual(
        print(gql`
          query GetBatch($feature0id: ID!, $feature1id: ID!) {
            query_0: feature(id: $feature0id) {
              name
            }
            query_1: feature(id: $feature1id) {
              name
            }
          }
        `)
      );

      expect(f1.name).toEqual('hello');
      expect(f2.name).toEqual('bye');
    });

    it('runs separately over timeout', async () => {
      testClient.add({
        query_0: { __typename: 'Feature', name: 'you say' },
        query_1: { __typename: 'Feature', name: 'bye' },
      });
      testClient.add({
        query_0: { __typename: 'Feature', name: 'hello' },
      });

      const b = new Batcher({ timeout: 10 });
      const p1 = b.find(Feature.select('name'), 'ABC-123');
      const p2 = b.find(Feature.select('name'), 'ABC-321');

      await new Promise(resolve => setTimeout(resolve, 20));
      const p3 = b.find(Feature.select('name'), 'ABC-456');

      const [f1, f2, f3] = await Promise.all([p1, p2, p3]);

      expect(f1.name).toEqual('you say');
      expect(f2.name).toEqual('bye');
      expect(f3.name).toEqual('hello');
    });
  });

  describe('with limit', () => {
    it('runs in one up to limit', async () => {
      testClient.add({
        query_0: { __typename: 'Feature', name: 'hello' },
        query_1: { __typename: 'Feature', name: 'bye' },
      });

      const b = new Batcher({ timeout: 10, limit: 2 });
      const p1 = b.find(Feature.select('name'), 'ABC-123');
      const p2 = b.find(Feature.select('name'), 'ABC-321');
      const [f1, f2] = await Promise.all([p1, p2]);

      expect(f1.name).toEqual('hello');
      expect(f2.name).toEqual('bye');
    });

    it('runs separately over limit', async () => {
      testClient.add({
        query_0: { __typename: 'Feature', name: 'you say' },
        query_1: { __typename: 'Feature', name: 'bye' },
      });
      testClient.add({
        query_0: { __typename: 'Feature', name: 'hello' },
      });

      const b = new Batcher({ timeout: 10, limit: 2 });
      const p1 = b.find(Feature.select('name'), 'ABC-123');
      const p2 = b.find(Feature.select('name'), 'ABC-321');
      const p3 = b.find(Feature.select('name'), 'ABC-456');

      const [f1, f2, f3] = await Promise.all([p1, p2, p3]);

      expect(testClient.queries.length).toEqual(2);

      expect(f1.name).toEqual('you say');
      expect(f2.name).toEqual('bye');
      expect(f3.name).toEqual('hello');
    });
  });

  describe('execute', () => {
    it('allows manual execution of the batch', async () => {
      testClient.add({
        query_0: { __typename: 'Feature', name: 'hello' },
        query_1: { __typename: 'Feature', name: 'bye' },
        query_2: {
          nodes: [
            { __typename: 'Epic', name: 'yes' },
            { __typename: 'Epic', name: 'no' },
          ],
        },
      });

      const b = new Batcher();
      /** @type {any[]} */
      const [f1, f2, epics] = await b.execute(() => {
        b.find(Feature.select('name'), 'ABC-123');
        b.find(Feature.select('name'), 'ABC-321');
        b.all(Epic.select('name').where({ projectId: 'PRJ-123' }));
      });

      expect(f1.name).toEqual('hello');
      expect(f2.name).toEqual('bye');
      expect(epics.length).toEqual(2);
    });
  });

  describe('fragment merging', () => {
    it('merges queries for the same data', async () => {
      testClient.add({
        query_0: {
          __typename: 'Feature',
          name: 'hello',
          id: 'ABC-123',
        },
      });

      const b = new Batcher({ timeout: 10 });
      const p1 = b.find(Feature.select('name'), 'ABC-123');
      const p2 = b.find(Feature.select('id'), 'ABC-123');
      const [f1, f2] = await Promise.all([p1, p2]);

      const query = print(testClient.queries[0][0]);
      expect(query).toEqual(
        print(gql`
          query GetBatch($feature0id: ID!) {
            query_0: feature(id: $feature0id) {
              name
              id
            }
          }
        `)
      );

      expect(f1.name).toEqual('hello');
      expect(f2.name).toEqual('hello');
    });
  });
});
