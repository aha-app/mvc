import { humanize } from 'inflected';

export default class Errors {
  constructor(errors = {}) {
    this.errors = {};

    if (errors.attributes) {
      errors.attributes.forEach(error => {
        this.errors[error.name] = {
          messages: error.messages,
          fullMessages: error.fullMessages,
          codes: error.codes,
        };
      });
    }
  }

  /**
   * @returns {boolean} true if there are no errors, false otherwise
   */
  get isEmpty() {
    return Object.keys(this.errors).length === 0;
  }

  /**
   * Returns a list of partial error messages ('is blank') for an attribute.
   *
   * @param {string} attribute name of an attribute
   * @returns {string[]} partial error messages for that attribute
   */
  on(attribute) {
    return this.errors[attribute]?.messages || [];
  }

  /**
   * Does this attribute have errors?
   *
   * @param {string} attribute name of an attribute
   * @returns {boolean} true if the attribute has errors, false otherwise
   */
  has(attribute) {
    return this.on(attribute).length > 0;
  }

  /**
   * Add a new error to an attribute.
   *
   * @param {string} attribute name of an attribute
   * @param {string} message the partial error message to add
   * @param {object} options additional error details. `fullMessage` defines a customized full error message. `code` defines a short string code that can be used instead of string parsing.
   */
  add(attribute, message = 'is invalid', options = {}) {
    if (!this.errors[attribute]) {
      this.errors[attribute] = {};
    }

    const attributeErrors = this.errors[attribute];

    if (!attributeErrors.messages) attributeErrors.messages = [];

    if (!attributeErrors.codes)
      attributeErrors.codes = [...this.codesFor(attribute)];

    if (!attributeErrors.fullMessages)
      attributeErrors.fullMessages = [...this.fullMessagesFor(attribute)];

    attributeErrors.messages.push(message);

    if (options.code) {
      attributeErrors.codes.push(options.code);
    } else {
      attributeErrors.codes.push(message);
    }

    if (options.fullMessage) {
      attributeErrors.fullMessages.push(options.fullMessage);
    } else {
      attributeErrors.fullMessages.push(
        this.generateMessage(attribute, message)
      );
    }
  }

  /**
   * Clear all errors.
   */
  clear() {
    this.errors = {};
  }

  /**
   * Remove all errors from an attribute.
   *
   * @param {string} attribute name of an attribute
   */
  delete(attribute) {
    delete this.errors[attribute];
  }

  /**
   * Get all full error messages on all attributes.
   *
   * @returns {string[]}
   */
  get fullMessages() {
    return Object.keys(this.errors).reduce((acc, attr) => {
      return acc.concat(this.fullMessagesFor(attr));
    }, []);
  }

  /**
   * Returns short string error codes for an attribute.
   *
   * @param {string} attribute name of an attribute
   * @returns {string[]} a list of short error codes for that attribute
   */
  codesFor(attribute) {
    if (!this.has(attribute)) return [];
    const attributeErrors = this.errors[attribute];

    if (attributeErrors.codes) {
      return attributeErrors.codes;
    }

    return this.on(attribute);
  }

  /**
   * Returns full messages for an attribute
   *
   * @param {string} attribute name of an attribute
   * @returns {string[]} full error messages for that attribute
   */
  fullMessagesFor(attribute) {
    if (!this.has(attribute)) return [];
    const attributeErrors = this.errors[attribute];

    if (attributeErrors.fullMessages) {
      return attributeErrors.fullMessages;
    }

    if (attribute === 'base') {
      return this.on('base');
    }

    return this.on(attribute).map(msg => this.generateMessage(attribute, msg));
  }

  /**
   * Generate a full error message
   *
   * @param {string} attribute name of an attribute
   * @param {string} msg a short error message
   * @returns {string} full error message based on those properties
   */
  generateMessage(attribute, msg) {
    return `${humanize(attribute)} ${msg}`;
  }
}
