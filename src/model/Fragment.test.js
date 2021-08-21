import { print } from 'graphql';
import gql from 'graphql-tag';
import { createDraft, produce } from 'immer';
import Fragment from './Fragment';
import EnumValue from './EnumValue';

describe('Fragment', () => {
  it('generates a fragment with attributes', () => {
    const fragment = createDraft(new Fragment('features'));
    fragment.attrs.push('id');

    expect(print(fragment.toDocument())).toEqual(
      print(gql`
        query features {
          features {
            id
          }
        }
      `)
    );
  });

  describe('alias', () => {
    it('generates a fragment with aliases', () => {
      const fragment = new Fragment('feature')
        .argument('id', 123, 'ID!')
        .alias('record')
        .fragment(new Fragment('extensionFields').attr('value'));

      expect(print(fragment.toDocument('GetExtensionFields'))).toEqual(
        print(gql`
          query GetExtensionFields($id: ID!) {
            record: feature(id: $id) {
              extensionFields {
                value
              }
            }
          }
        `)
      );
    });
  });

  describe('variables', () => {
    const fragment = createDraft(new Fragment('features'));

    fragment.variables = [
      { key: 'name', name: 'name', type: 'String', value: 'a name' },
    ];

    it('generates the variables', () => {
      expect(fragment.toVariables()).toEqual({ name: 'a name' });
    });

    it('generates the document', () => {
      expect(print(fragment.toDocument())).toEqual(
        print(gql`
          query features($name: String) {
            features(name: $name)
          }
        `)
      );
    });
  });

  describe('arguments', () => {
    const fragment = new Fragment('features')
      .argument('id', '123')
      .argument('name', 'Howard')
      .argument('age', 45)
      .argument('stationary', true)
      .argument('vision', [50, 50])
      .argument('attributes', { zookeeper: true }, 'PersonAttributes')
      .argument('enum', new EnumValue('AnEnum', 'VALUE'));

    it('sets the parameter types', () => {
      expect(fragment.toParameters()).toEqual([
        ['id', 'ID!'],
        ['name', 'String'],
        ['age', 'Int'],
        ['stationary', 'Boolean'],
        ['vision', '[Int]'],
        ['attributes', 'PersonAttributes'],
        ['enum', 'AnEnum'],
      ]);
    });

    it('sets the variables', () => {
      expect(fragment.toVariables()).toEqual({
        id: '123',
        name: 'Howard',
        age: 45,
        stationary: true,
        vision: [50, 50],
        attributes: {
          zookeeper: true,
        },
        enum: 'VALUE',
      });
    });

    it('converts nested variables', () => {
      let nestedFragment = fragment.argument(
        'filters',
        {
          enum: new EnumValue('AnEnum', 'VALUE2'),
          array: [new EnumValue('AnEnum', 'VALUE3')],
        },
        'Filters'
      );

      expect(nestedFragment.toVariables()).toEqual({
        id: '123',
        name: 'Howard',
        age: 45,
        stationary: true,
        vision: [50, 50],
        attributes: {
          zookeeper: true,
        },
        enum: 'VALUE',
        filters: {
          enum: 'VALUE2',
          array: ['VALUE3'],
        },
      });
    });

    it('generates the document', () => {
      expect(print(fragment.toDocument('Features'))).toEqual(
        print(gql`
          query Features(
            $id: ID!
            $name: String
            $age: Int
            $stationary: Boolean
            $vision: [Int]
            $attributes: PersonAttributes
            $enum: AnEnum
          ) {
            features(
              id: $id
              name: $name
              age: $age
              stationary: $stationary
              vision: $vision
              attributes: $attributes
              enum: $enum
            )
          }
        `)
      );
    });
  });

  describe('fragments with children', () => {
    const root = produce(new Fragment(), root => {
      root.name = 'features';
      root.type = 'Feature';
      root._query = 'features(workflowStatus: $workflowStatus)';
      root.variables = [
        {
          key: 'workflowStatus',
          name: 'workflowStatus',
          type: 'ID',
          value: 321,
        },
      ];
      root.attrs = ['id', 'name'];

      const hasMany = createDraft(new Fragment());
      hasMany.name = 'requirements';
      hasMany.type = 'Requirement';
      hasMany._query = 'requirements(workflowStatus: $workflowStatus)';
      hasMany.variables = [
        {
          key: 'workflowStatus',
          name: 'workflowStatus',
          type: 'ID',
          value: 123,
        },
      ];
      hasMany.attrs = ['id', 'name'];

      const belongsTo = createDraft(new Fragment());
      belongsTo.name = 'epic';
      belongsTo.type = 'Epic';
      belongsTo._query = 'epic';
      belongsTo.attrs = ['id', 'referenceNum'];

      root.fragments = [hasMany, belongsTo];
    });

    it('generates an unresolved fragment', () => {
      expect(root.toVariables()).toEqual({ workflowStatus: 123 });

      expect(print(root.toDocument())).toEqual(
        print(gql`
          query features($workflowStatus: ID, $workflowStatus: ID) {
            features(workflowStatus: $workflowStatus) {
              id
              name
              requirements(workflowStatus: $workflowStatus) {
                id
                name
              }
              epic {
                id
                referenceNum
              }
            }
          }
        `)
      );
    });

    it('generates a resolved fragment', () => {
      const resolved = root.resolve();

      expect(resolved.toVariables()).toEqual({
        workflowStatus: 321,
        requirements0workflowStatus: 123,
      });

      expect(print(resolved.toDocument('GetFeatures'))).toEqual(
        print(
          gql`
            query GetFeatures(
              $workflowStatus: ID
              $requirements0workflowStatus: ID
            ) {
              features(workflowStatus: $workflowStatus) {
                id
                name
                requirements(workflowStatus: $requirements0workflowStatus) {
                  id
                  name
                }
                epic {
                  id
                  referenceNum
                }
              }
            }
          `
        )
      );
    });

    it('generates unions', () => {
      const root = new Fragment('feature', 'Feature')
        .argument('id', '123')
        .fragment(
          new Fragment('relatedRecords').fragment(
            new Fragment('', 'Epic').union().attr('name')
          )
        );

      expect(print(root.toDocument())).toEqual(
        print(gql`
          query feature($id: ID!) {
            feature(id: $id) {
              relatedRecords {
                ... on Epic {
                  name
                }
              }
            }
          }
        `)
      );
    });

    it('generates mutations', () => {
      const mutation = produce(root, draft => {
        draft.name = 'updateFeature';
        draft.variables = [
          {
            key: 'id',
            name: 'id',
            type: 'ID',
            value: 123,
          },
          {
            key: 'attributes',
            name: 'attributes',
            type: 'FeatureAttributes',
            value: { name: 'new name' },
          },
        ];
      }).resolve();

      expect(print(mutation.toDocument('UpdateFeature', 'mutation'))).toEqual(
        print(
          gql`
            mutation UpdateFeature(
              $id: ID
              $attributes: FeatureAttributes
              $requirements0workflowStatus: ID
            ) {
              updateFeature(id: $id, attributes: $attributes) {
                id
                name
                requirements(workflowStatus: $requirements0workflowStatus) {
                  id
                  name
                }
                epic {
                  id
                  referenceNum
                }
              }
            }
          `
        )
      );
    });
  });
});
