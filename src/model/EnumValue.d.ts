/**
 * Wraps a string treating it as a GraphQL Enum. These will not be
 * wrapped in quotes when injected into argument lists.
 */
export default class EnumValue {
  constructor(type: any, value: any);
  type: any;
  value: any;
  toString(): any;
  toJSON(): any;
}
