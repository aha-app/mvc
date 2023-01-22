import { gql } from '@apollo/client';
import { print } from 'graphql/language/printer';
import { MockLink } from '@apollo/client/testing';
import Query from './Query';
import ApolloModelClient from './ApolloModelClient';
import ApplicationModel from './ApplicationModel';
import { AvatarSizeEnum } from './Enums';
import { NotFoundError } from './Errors';

class BookmarksRecordPosition extends ApplicationModel {
  static typename = 'BookmarksRecordPosition';
  static fields = {};
  static filterType = 'ReleaseFilters';
  static filters = {
    bookmarkType: { type: '[String]' },
  };
}

class Release extends ApplicationModel {
  static typename = 'Release';
  static fields = {
    id: { type: 'attr' },
    name: { type: 'attr' },
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
    bookmarksRecordPositions: {
      type: 'hasMany',
      args: { filters: 'RecordPositionFilters' },
    },
    customFieldValues: {
      type: 'hasMany',
      args: { id: '[ID!]!' },
    },
  };
  static filterType = 'FeatureFilters';
  static filters = {
    id: { type: 'ID' },
  };
}

class CustomFieldValue extends ApplicationModel {
  static typename = 'CustomFieldValue';
  static fields = { id: { type: 'attr' } };
  static filterType = 'CustomFieldValueFilters';
  static filters = {
    id: { type: 'ID' },
  };
}

class Bookmark extends ApplicationModel {
  static typename = 'Bookmark';
  static fields = {
    id: { type: 'attr' },
    features: {
      type: 'hasMany',
      args: { page: 'Int', per: 'Int' },
    },
  };
}

describe('Query', () => {
  describe('select', () => {
    it('adds to the selected attributes', () => {
      const query = new Query(Release).select('id', 'name');
      const attrs = [...query.attrs];
      expect(attrs).toHaveLength(2);
      expect(attrs).toContainEqual('id');
      expect(attrs).toContainEqual('name');
    });

    it('only adds once', () => {
      const query = new Query(Release)
        .select('id', 'name')
        .select('name', 'age');
      const attrs = [...query.attrs];
      expect(attrs).toHaveLength(3);
    });
  });

  describe('selectAll', () => {
    it('adds all available attrs', () => {
      const query = new Query(Release).selectAll();
      const attrs = [...query.attrs];
      expect(attrs).toHaveLength(2);
      expect(attrs).toContainEqual('id');
      expect(attrs).toContainEqual('name');
    });
  });

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

  it('generates a paginated subquery', () => {
    const query = new Query(Bookmark).select('id').merge({
      features: new Query(Feature).select(['id', 'name']).page(1),
    });

    expect(print(query.query)).toEqual(
      print(gql`
        query Bookmark($features0_0page: Int) {
          bookmarks {
            nodes {
              id
              features(page: $features0_0page) {
                nodes {
                  id
                  name
                }
              }
            }
          }
        }
      `)
    );
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

  describe('deepMerge', () => {
    it('deeply merges subqueries into an existing query', () => {
      const q = new Query(Feature)
        .select(['id', 'name'])
        .merge({
          release: ['id', 'name'],
          epic: new Query(Epic)
            .select(['id', 'name'])
            .merge({ team: ['id', 'name'] }),
        })
        .deepMerge({
          release: ['referenceNum'],
          epic: {
            release: ['id', 'name'],
            project: ['id'],
            team: ['referenceNum'],
          },
        });

      expect(print(q.query)).toEqual(
        print(gql`
          query Feature {
            features {
              nodes {
                id
                name
                release {
                  id
                  name
                  referenceNum
                }
                epic {
                  id
                  name
                  team {
                    id
                    name
                    referenceNum
                  }
                  release {
                    id
                    name
                  }
                  project {
                    id
                  }
                }
              }
            }
          }
        `)
      );
    });

    it('deeply merges arguments and filters', () => {
      const q = new Query(Feature)
        .select('id')
        .deepMerge({
          bookmarksRecordPositions: BookmarksRecordPosition.select('id').where({
            bookmarkType: 'Bookmarks::TeamBacklog',
          }),
          customFieldValues: CustomFieldValue.select('id').argument({
            id: 1,
            key: 'priority',
          }),
        })
        .deepMerge({
          bookmarksRecordPositions: BookmarksRecordPosition.select('id').where({
            bookmarkType: 'Bookmarks::WorkflowBoard',
          }),
          customFieldValues: CustomFieldValue.select('key').argument({
            id: [1, 2, 3],
            key: ['custom_field', 'priority'],
          }),
        })
        .deepMerge({
          bookmarksRecordPositions: BookmarksRecordPosition.select('id').where({
            bookmarkType: 'Bookmarks::IterationPlan',
          }),
          customFieldValues: CustomFieldValue.select('key').argument({
            key: ['custom_field'],
          }),
        });

      expect(print(q.query)).toEqual(
        print(gql`
          query Feature(
            $bookmarksRecordPositions0_0filters: RecordPositionFilters
            $customFieldValues0_1id: [ID!]!
            $customFieldValues0_1key: [String]
          ) {
            features {
              nodes {
                id
                bookmarksRecordPositions(
                  filters: $bookmarksRecordPositions0_0filters
                ) {
                  id
                }
                customFieldValues(
                  id: $customFieldValues0_1id
                  key: $customFieldValues0_1key
                ) {
                  id
                  key
                }
              }
            }
          }
        `)
      );

      expect(q.queryVariables).toEqual({
        bookmarksRecordPositions0_0filters: {
          bookmarkType: [
            'Bookmarks::TeamBacklog',
            'Bookmarks::WorkflowBoard',
            'Bookmarks::IterationPlan',
          ],
        },
        customFieldValues0_1id: [1, 2, 3],
        customFieldValues0_1key: ['priority', 'custom_field'],
      });
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

  describe('find', () => {
    it('handles not found errors', async () => {
      jest
        .spyOn(ApplicationModel.client, 'query')
        .mockRejectedValueOnce(new NotFoundError('not found'));

      const featureQuery = new Query(Feature).select([
        'id',
        'name',
        'commentCount',
      ]);

      // Expect the assertions in the catch block
      expect.assertions(2);

      try {
        await featureQuery.find('FEAT-123');
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundError);
        expect(error.message).toEqual(
          'Could not find feature FEAT-123: not found'
        );
      }
    });

    it('reraises errors', async () => {
      const error = new Error('invalid something');
      jest.spyOn(ApplicationModel.client, 'query').mockRejectedValueOnce(error);

      const featureQuery = new Query(Feature).select([
        'id',
        'name',
        'commentCount',
      ]);

      // Expect the assertions in the catch block
      expect.assertions(1);

      try {
        await featureQuery.find('FEAT-123');
      } catch (caughtError) {
        expect(caughtError).toEqual(error);
      }
    });
  });

  describe('ApolloClient cacheId', () => {
    let client;
    beforeEach(() => {
      client = ApplicationModel.client;
      const mockLink = new MockLink([]);
      ApplicationModel.client = new ApolloModelClient({
        addHttpLink: false,
        links: [mockLink],
      });
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
