/**
 * Wraps a string treating it as a GraphQL Enum. These will not be
 * wrapped in quotes when injected into argument lists.
 */
export default class EnumValue {
  constructor(type, value) {
    this.type = type;
    this.value = value;
  }

  toString() {
    return this.value;
  }
}
