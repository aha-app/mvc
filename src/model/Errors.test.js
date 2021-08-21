import Errors from './Errors';

describe('Errors', () => {
  let errors;

  describe('a new error object', () => {
    beforeEach(() => {
      errors = new Errors();
    });

    it('is empty', () => {
      expect(errors.isEmpty).toBeTruthy();
    });

    it('has no errors on an attribute', () => {
      expect(errors.on('name')).toEqual([]);
      expect(errors.has('name')).toBeFalsy();
      expect(errors.fullMessagesFor('name')).toEqual([]);
      expect(errors.fullMessages).toEqual([]);
    });

    it('can add a basic error', () => {
      errors.add('name');
      expect(errors.has('name')).toBeTruthy();

      expect(errors.on('name')).toEqual(['is invalid']);
      expect(errors.codesFor('name')).toEqual(['is invalid']);
      expect(errors.fullMessagesFor('name')).toEqual(['Name is invalid']);
    });

    it('can add a more customized error', () => {
      errors.add('name', "can't be blank", {
        code: 'blank',
        fullMessage: "Summary can't be blank",
      });
      expect(errors.has('name')).toBeTruthy();

      expect(errors.on('name')).toEqual(["can't be blank"]);
      expect(errors.codesFor('name')).toEqual(['blank']);
      expect(errors.fullMessagesFor('name')).toEqual([
        "Summary can't be blank",
      ]);
    });
  });

  describe('with populated errors', () => {
    beforeEach(() => {
      errors = new Errors({
        attributes: [
          {
            name: 'name',
            messages: ["can't be blank", 'is invalid'],
            codes: ['blank', 'invalid'],
            fullMessages: ["Summary can't be blank", 'Summary is invalid'],
          },
          {
            name: 'description',
            messages: ['is too long'],
          },
          {
            name: 'base',
            messages: ['This record needs more things'],
          },
        ],
      });
    });

    it('is not empty', () => {
      expect(errors.isEmpty).toBeFalsy();
    });

    it('reads attributes if they exist', () => {
      expect(errors.has('name')).toBeTruthy();

      expect(errors.on('name')).toEqual(["can't be blank", 'is invalid']);
      expect(errors.codesFor('name')).toEqual(['blank', 'invalid']);
      expect(errors.fullMessagesFor('name')).toEqual([
        "Summary can't be blank",
        'Summary is invalid',
      ]);
    });

    it("generates attributes if they don't exist", () => {
      expect(errors.has('description')).toBeTruthy();

      expect(errors.on('description')).toEqual(['is too long']);
      expect(errors.codesFor('description')).toEqual(['is too long']);
      expect(errors.fullMessagesFor('description')).toEqual([
        'Description is too long',
      ]);
    });

    it('returns all messages in a flat list', () => {
      expect(errors.fullMessages).toEqual([
        "Summary can't be blank",
        'Summary is invalid',
        'Description is too long',
        'This record needs more things',
      ]);
    });

    it('clears all messages', () => {
      errors.clear();
      expect(errors.isEmpty).toBeTruthy();
      expect(errors.fullMessages).toEqual([]);
    });

    it('deletes messages on a single entry', () => {
      errors.delete('name');
      expect(errors.fullMessages).toEqual([
        'Description is too long',
        'This record needs more things',
      ]);
    });

    it('adds new errors', () => {
      errors.add('description');

      expect(errors.on('description')).toEqual(['is too long', 'is invalid']);
      expect(errors.codesFor('description')).toEqual([
        'is too long',
        'is invalid',
      ]);
      expect(errors.fullMessagesFor('description')).toEqual([
        'Description is too long',
        'Description is invalid',
      ]);
    });
  });
});
