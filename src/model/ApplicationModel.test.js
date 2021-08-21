import { gql } from '@apollo/client';
import { observable } from '@nx-js/observer-util';
import ApolloModelClient from './ApolloModelClient';
import ApplicationModel from './ApplicationModel';
import Epic from './models/Epic';
import Iteration from './models/Iteration';
import Requirement from './models/Requirement';
import User from './models/User';

function mockClient(mocks = []) {
  ApplicationModel.client = new ApolloModelClient({ mocks: mocks });
}

mockClient();

describe('ApplicationModel', () => {
  describe('idFromReactivePattern', () => {
    it('returns the id given a reactive pattern', () => {
      expect(Epic.idFromReactivePattern('Epic-123')).toEqual('123');
    });

    it("returns undefined given something that's not a reactive pattern", () => {
      expect(Epic.idFromReactivePattern('Feature-123')).toBeUndefined();
    });
  });

  describe('instanceof', () => {
    it('a model instanceof model class is true', () => {
      const epic = new Epic();
      expect(epic instanceof Epic).toBeTruthy();
    });

    it('a model instanceof ApplicationModel is true', () => {
      const epic = new Epic();
      expect(epic instanceof ApplicationModel).toBeTruthy();
    });

    it('a model instanceof a different model is false', () => {
      const epic = new Epic();
      expect(epic instanceof Requirement).toBeFalsy();
    });

    it('a proxy model instanceof model class is true', () => {
      const epic = observable(new Epic());
      expect(epic instanceof Epic).toBeTruthy();
    });

    it('a proxy model instanceof ApplicationModel is true', () => {
      const epic = observable(new Epic());
      expect(epic instanceof ApplicationModel).toBeTruthy();
    });

    it('a proxy model instanceof a different model is false', () => {
      const epic = observable(new Epic());
      expect(epic instanceof Requirement).toBeFalsy();
    });
  });

  describe('fetchAll', () => {
    beforeEach(() => {
      const usersQuery = num => ({
        query: gql`
          query User($page: Int) {
            users(page: $page) {
              isLastPage
              nodes {
                id
                name
                __typename
              }
              __typename
            }
          }
        `,
        variables: { page: num },
      });
      const mocks = [
        {
          request: usersQuery(1),
          result: () => {
            return {
              data: {
                users: {
                  isLastPage: false,
                  nodes: [
                    {
                      id: '6442314274460448331',
                      name: 'Hank Scorpio',
                      __typename: 'User',
                    },
                  ],
                  __typename: 'UserPage',
                },
              },
            };
          },
        },
        {
          request: usersQuery(2),
          result: () => {
            return {
              data: {
                users: {
                  isLastPage: true,
                  nodes: [
                    {
                      id: '6442314274460448332',
                      name: 'Justin Weiss',
                      __typename: 'User',
                    },
                  ],
                  __typename: 'UserPage',
                },
              },
            };
          },
        },
      ];

      mockClient(mocks);
    });

    it('fetches multiple pages based on total count', async () => {
      const users = await User.fetchAll(User.select(['id', 'name']));
      expect(users.length).toBe(2);
    });

    it('calls the callback with each page, if provided', async () => {
      const callback = jest.fn();
      await User.fetchAll(User.select(['id', 'name']), callback);
      expect(callback).toHaveBeenCalledTimes(2);

      const users = callback.mock.calls[0][0];
      expect(users.length).toBe(1);
      expect(users[0].name).toBe('Hank Scorpio');
    });
  });

  describe('blank', () => {
    it('returns an object that can nullify an association', () => {
      expect(User.blank().id).toBeNull();
    });
  });

  describe('constructor', () => {
    // We have to disable sealing in jest tests, so we can't testing this.
    it.skip('seals the object', () => {
      const epic = new Epic({ id: '123' });
      expect(() => {
        epic.foo = 1;
      }).toThrow();
    });
    it('unknown attributes are undefined', () => {
      const epic = new Epic({ id: '123' });
      expect(epic.foo).toBeUndefined();
    });
    it('initializes attributes', () => {
      const epic = new Epic({ id: '123', name: 'Epic name' });
      expect(epic.id).toBe('123');
      expect(epic.name).toBe('Epic name');
      expect(epic.position).toBeUndefined();
    });
    it('creates a default query', () => {
      const epic = new Epic({ id: '123', name: 'Epic name' });
      expect(epic.query).toBeTruthy();
    });
  });

  describe('simple operations', () => {
    beforeEach(() => {
      const mocks = [
        {
          request: {
            query: gql`
              mutation UpdateEpic($id: ID!, $attributes: EpicAttributes!) {
                updateEpic(id: $id, attributes: $attributes) {
                  epic {
                    id
                    __typename
                  }
                  errors {
                    attributes {
                      name
                      messages
                      fullMessages
                      codes
                      __typename
                    }
                    __typename
                  }
                  __typename
                }
              }
            `,
            variables: {
              attributes: {
                workflowStatus: { name: 'In design' },
                teamWorkflowStatus: null,
              },
              id: '123',
            },
          },
          result: () => {
            return {
              data: {
                updateEpic: {
                  epic: {
                    id: '6918431747134755232',
                    __typename: 'Epic',
                  },
                  errors: {
                    attributes: [],
                    __typename: 'Errors',
                  },
                  __typename: 'UpdateEpicPayload',
                },
              },
            };
          },
        },
      ];

      mockClient(mocks);
    });

    it('can update attribute', async () => {
      const epic = new Epic({
        id: '123',
        teamWorkflowStatus: { id: '456', name: 'In progress' },
      });
      epic.workflowStatus = { name: 'In design' };
      epic.teamWorkflowStatus = null;
      await epic.save();
    });
  });

  describe('#destroy', () => {
    it('can destroy a record', async () => {
      const iteration = new Iteration({ id: 123 });

      const deleteIterationMutation = {
        query: gql`
          mutation DeleteIteration($id: ID!) {
            deleteIteration(id: $id) {
              iteration {
                id
                __typename
              }
              errors {
                attributes {
                  name
                  messages
                  fullMessages
                  codes
                  __typename
                }
                __typename
              }
            }
          }
        `,
        variables: { id: 123 },
      };

      const mocks = [
        {
          request: deleteIterationMutation,
          result: () => {
            return {
              data: {
                deleteIteration: {
                  iteration: {
                    id: '123',
                  },
                  errors: {},
                },
              },
            };
          },
        },
      ];

      mockClient(mocks);

      const result = await iteration.destroy();
      expect(result).toEqual(true);
    });
  });
});
