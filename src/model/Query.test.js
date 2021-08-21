import { gql } from '@apollo/client';
import { print } from 'graphql/language/printer';
import Query from './Query';
import ApolloModelClient from './ApolloModelClient';
import ApplicationModel from './ApplicationModel';
import { AvatarSizeEnum } from './Enums';

class Release extends ApplicationModel {
  static typename = 'Release';
  static fields = {
    epics: { type: 'hasMany', args: { filters: 'EpicFilters' } },
    features: { type: 'hasMany' },
  };
  static filterType = 'ReleaseFilters';
  static filters = {
    projectId: { type: 'ID' },
  };
}

class Epic extends ApplicationModel {
  static typename = 'Epic';
  static fields = {
    features: { type: 'hasMany', args: { filters: 'FeatureFilters' } },
  };
  static filterType = 'EpicFilters';
  static filters = {
    workflowStatus: { type: 'ID' },
  };
}

class Feature extends ApplicationModel {
  static typename = 'Feature';
  static fields = {
    // relatedRecords: { type: 'hasMany' },
  };
  static filterType = 'FeatureFilters';
  static filters = {
    id: { type: 'ID' },
  };
}

describe('Query', () => {
  it('generates one-level query', () => {
    const query = new Query(Release)
      .select(['id', 'name'])
      .select('referenceNum')
      .select({ avatarUrl: { size: AvatarSizeEnum.SIZE_160 } })
      .where({ projectId: 123 })
      .order({ name: 'ASC' });

    expect(print(query.query)).toEqual(
      print(gql`
        query Release(
          $filters: ReleaseFilters
          $order: [ReleaseOrderClause!]
          $avatarUrl0_0size: AvatarSizeEnum
        ) {
          releases(filters: $filters, order: $order) {
            nodes {
              id
              name
              referenceNum
              avatarUrl(size: $avatarUrl0_0size)
            }
          }
        }
      `)
    );

    expect(query.queryVariables).toEqual({
      avatarUrl0_0size: 'SIZE_160',
      filters: { projectId: 123 },
      order: [{ name: 'name', direction: 'ASC' }],
    });
  });

  it('generates a paginated query', () => {
    const query = new Query(Feature)
      .select('id', 'name')
      .order({ name: 'ASC' })
      .page(1)
      .stats(['isLastPage']);

    const fragment = query.queryFragment;

    expect(print(fragment.toDocument('Features'))).toEqual(
      print(gql`
        query Features($order: [FeatureOrderClause!], $page: Int) {
          features(order: $order, page: $page) {
            isLastPage
            nodes {
              id
              name
            }
          }
        }
      `)
    );

    expect(fragment.toVariables()).toEqual({
      page: 1,
      order: [{ name: 'name', direction: 'ASC' }],
    });
  });

  it('generates complex nested query', () => {
    const query = new Query(Release)
      .select(['id', 'name'])
      .where({ projectId: 123 })
      .order({ name: 'ASC' })
      .merge({
        epics: new Query(Epic)
          .select(['id', 'name'])
          .where({ workflowStatus: 123 })
          .merge({
            features: new Query(Feature)
              .select(['id', 'name'])
              .order({ rank: 'ASC' }),
          }),
        features: new Query(Feature)
          .select(['id', 'name'])
          .order({ name: 'ASC' }),
      });

    expect(print(query.query)).toEqual(
      print(gql`
        query Release(
          $filters: ReleaseFilters
          $order: [ReleaseOrderClause!]
          $epics0_0filters: EpicFilters
          $features0_0_0order: [FeatureOrderClause!]
          $features0_1order: [FeatureOrderClause!]
        ) {
          releases(filters: $filters, order: $order) {
            nodes {
              id
              name
              epics(filters: $epics0_0filters) {
                id
                name
                features(order: $features0_0_0order) {
                  id
                  name
                }
              }
              features(order: $features0_1order) {
                id
                name
              }
            }
          }
        }
      `)
    );

    expect(query.queryVariables).toEqual({
      filters: { projectId: 123 },
      order: [{ direction: 'ASC', name: 'name' }],
      epics0_0filters: { workflowStatus: 123 },
      features0_0_0order: [{ direction: 'ASC', name: 'rank' }],
      features0_1order: [{ direction: 'ASC', name: 'name' }],
    });
  });

  describe('select', () => {
    it('selects fields when passed an array', () => {
      const q = new Query(Feature).select(['id', 'name']);
      expect(Array.from(q.attrs)).toEqual(['id', 'name']);
    });

    it('selects fields when passed a bare arguments list', () => {
      const q = new Query(Feature).select('id', 'name');
      expect(Array.from(q.attrs)).toEqual(['id', 'name']);
    });
  });

  describe('merge', () => {
    it('generates a subquery when only passed column names', () => {
      const q = new Query(Feature)
        .select(['id', 'name'])
        .merge({ requirements: ['id', 'name'] });

      expect(print(q.query)).toEqual(
        print(gql`
          query Feature {
            features {
              nodes {
                id
                name
                requirements {
                  id
                  name
                }
              }
            }
          }
        `)
      );
    });
  });

  describe('union', () => {
    it('generates a union with no subquery', () => {
      const query = new Query(Feature).select('id').merge({
        relatedRecords: new Query(Epic).select('name').union(),
      });

      expect(print(gql(query.queryString))).toEqual(
        print(gql`
          query Feature {
            features {
              nodes {
                id
                relatedRecords {
                  ... on Epic {
                    name
                  }
                }
              }
            }
          }
        `)
      );
    });

    it('generates a union type for a subquery', () => {
      const epicQuery = new Query(Epic).select(['id', 'name']).merge({
        features: new Query(Feature)
          .select('id')
          .where({ workflowStatus: 123 }),
      });
      const featureQuery = new Query(Feature).select([
        'id',
        'name',
        'commentCount',
      ]);

      const q = new Query(Feature).select(['id', 'name']).merge({
        relatedRecords: featureQuery.union(epicQuery),
      });

      expect(print(q.query)).toEqual(
        print(gql`
          query Feature($features0_0_1_0filters: FeatureFilters) {
            features {
              nodes {
                id
                name
                relatedRecords {
                  ... on Feature {
                    id
                    name
                    commentCount
                  }
                  ... on Epic {
                    id
                    name
                    features(filters: $features0_0_1_0filters) {
                      id
                    }
                  }
                }
              }
            }
          }
        `)
      );

      expect(q.queryVariables).toEqual({
        features0_0_1_0filters: { workflowStatus: 123 },
      });
    });
  });

  describe('ApolloClient cacheId', () => {
    let client;
    beforeEach(() => {
      client = ApplicationModel.client;
      ApplicationModel.client = new ApolloModelClient({ mocks: [] });
    });

    afterEach(() => {
      ApplicationModel.client = client;
    });

    it('does not generate a cache id for multiple-record calls', () => {
      expect(
        new Query(Feature).select('id', 'name').argument({ id: '123' }).cacheId
      ).toBeUndefined();
    });

    it('does not generate a cache id without an ID argument', () => {
      expect(
        new Query(Feature).select('id', 'name').where({ id: '123' }).first()
          .cacheId
      ).toBeUndefined();
    });

    it('does not generates a cache id unless selecting the id', () => {
      expect(
        new Query(Feature).select('name').argument({ id: '123' }).first()
          .cacheId
      ).toBeUndefined();
    });

    it('generates a cache id based on arguments', () => {
      expect(
        new Query(Feature).select('id', 'name').argument({ id: '123' }).first()
          .cacheId
      ).toEqual('Feature:123');
    });
  });
});
