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

    it('generates multiple aliases', () => {
      const fragment = new Fragment()
        .fragment(
          new Fragment('feature')
            .argument('id', 123, 'ID!')
            .alias('feature_1')
            .attr('id')
        )
        .fragment(
          new Fragment('feature')
            .argument('id', 321, 'ID!')
            .alias('feature_2')
            .attr('id')
        )
        .resolve();

      expect(print(fragment.toDocument())).toEqual(
        print(gql`
          query GetData($feature0id: ID!, $feature1id: ID!) {
            feature_1: feature(id: $feature0id) {
              id
            }
            feature_2: feature(id: $feature1id) {
              id
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
      .argument('enum', new EnumValue('AnEnum', 'VALUE'))
      .argument('requiredEnum', new EnumValue('RequiredEnum', 'RVALUE'), true);

    it('sets the parameter types', () => {
      expect(fragment.toParameters()).toEqual([
        ['id', 'ID!'],
        ['name', 'String'],
        ['age', 'Int'],
        ['stationary', 'Boolean'],
        ['vision', '[Int]'],
        ['attributes', 'PersonAttributes'],
        ['enum', 'AnEnum'],
        ['requiredEnum', 'RequiredEnum!'],
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
        requiredEnum: 'RVALUE',
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
        requiredEnum: 'RVALUE',
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
            $requiredEnum: RequiredEnum!
          ) {
            features(
              id: $id
              name: $name
              age: $age
              stationary: $stationary
              vision: $vision
              attributes: $attributes
              enum: $enum
              requiredEnum: $requiredEnum
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
          new Fragment('relatedRecords')
            .fragment(new Fragment('', 'Epic').union().attr('name'))
            .fragment(new Fragment('', 'Feature').union().attr('name'))
        );

      expect(print(root.toDocument())).toEqual(
        print(gql`
          query feature($id: ID!) {
            feature(id: $id) {
              relatedRecords {
                ... on Epic {
                  name
                }
                ... on Feature {
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

  describe('merge', () => {
    it('merges a simple attribute only fragment', () => {
      const f1 = new Fragment('test').attr('id', 'name');
      const f2 = new Fragment('test').attr('id', 'age');
      const f3 = f1.merge(f2);
      const f4 = f2.merge(f1);

      expect(print(f3.toDocument('Test'))).toEqual(
        print(gql`
          query Test {
            test {
              id
              name
              age
            }
          }
        `)
      );

      expect(print(f4.toDocument('Test'))).toEqual(
        print(gql`
          query Test {
            test {
              id
              age
              name
            }
          }
        `)
      );
    });

    it('merges subqueries', () => {
      const f1 = new Fragment('test')
        .attr('id')
        .fragment(
          new Fragment('children')
            .attr('id', 'name')
            .fragment(new Fragment('grandchildren').attr('id', 'name'))
        )
        .fragment(new Fragment('parents').attr('id'));
      const f2 = new Fragment('test')
        .attr('name')
        .fragment(new Fragment('children').attr('name', 'age'))
        .fragment(new Fragment('pets').attr('id', 'name', 'age'));

      const f3 = f1.merge(f2);
      const f4 = f2.merge(f1);

      expect(print(f3.toDocument('Test'))).toEqual(
        print(gql`
          query Test {
            test {
              id
              name
              children {
                id
                name
                age
                grandchildren {
                  id
                  name
                }
              }
              parents {
                id
              }
              pets {
                id
                name
                age
              }
            }
          }
        `)
      );

      expect(print(f4.toDocument('Test'))).toEqual(
        print(gql`
          query Test {
            test {
              name
              id
              children {
                name
                age
                id
                grandchildren {
                  id
                  name
                }
              }
              pets {
                id
                name
                age
              }
              parents {
                id
              }
            }
          }
        `)
      );
    });

    it('merges aliases', () => {
      const f1 = new Fragment('test').fragment(
        new Fragment('children').attr('name').alias('myChildren')
      );
      const f2 = new Fragment('test')
        .fragment(new Fragment('children').attr('id').alias('myChildren'))
        .fragment(new Fragment('children').attr('id', 'age'));
      const f3 = f1.merge(f2);
      expect(print(f3.toDocument('Test'))).toEqual(
        print(gql`
          query Test {
            test {
              myChildren: children {
                name
                id
              }
              children {
                id
                age
              }
            }
          }
        `)
      );
    });

    it('can merge the same args', () => {
      const f1 = new Fragment('test').attr('name').argument('id', '123');
      const f2 = new Fragment('test').attr('id').argument('id', '123');

      expect(f1.canMerge(f2)).toBeTruthy();
      const f3 = f1.merge(f2);

      expect(f3.toVariables()).toEqual({ id: '123' });

      expect(print(f3.toDocument('Test'))).toEqual(
        print(gql`
          query Test($id: ID!) {
            test(id: $id) {
              name
              id
            }
          }
        `)
      );
    });

    it('cannot merge different args', () => {
      const f1 = new Fragment('test').attr('name').argument('id', '123');
      const f2 = new Fragment('test').attr('id').argument('id', '321');

      expect(f1.canMerge(f2)).toBeFalsy();

      expect(() => {
        f1.merge(f2);
      }).toThrowError('Cannot merge fragments with different variables');
    });

    it('cannot merge different child args', () => {
      const f1 = new Fragment('test').fragment(
        new Fragment('children')
          .attr('name')
          .argument('ageFilter', { greaterThan: 10 }, 'ChildAgeFilter')
      );
      const f2 = new Fragment('test').fragment(
        new Fragment('children').attr('id')
      );

      expect(f1.canMerge(f2)).toBeFalsy();

      expect(() => {
        f1.merge(f2);
      }).toThrowError('Cannot merge fragments with different variables');
    });
  });
});
