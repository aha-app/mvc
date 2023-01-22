import ApplicationModel from './ApplicationModel';
import ModelCollection from './ModelCollection';

/**
 * Declares `modelClass` as a model type, which can be used to
 * automatically wrap GraphQL objects.
 *
 * Example: export default model(Feature);
 *
 * Additonal parameters can specify a list of mixins to apply to the model
 * class. A mixin is either an object that will extend the model prototype or a
 * function that receives the class and can return a new or modified class.
 *
 * ```js
 * const Feature = model(Feature, { hello() { return 'hello'; } })
 * new Feature().hello; // 'hello'
 * ```
 *
 * ```js
 * const Feature = model(Feature, modelClass => class extends modelClass { hello() { return 'hello'; } });
 * new Feature().hello; // 'hello'
 * ```
 *
 * Function mixins can do things like override methods.
 *
 * @template {{typename: string}} T
 * @param {T} modelClass
 * @param {Array<Function|object>} mixins
 * @returns {T}
 */
export function model(modelClass, ...mixins) {
  const mixedClass = Array.from(mixins).reduce((acc, mixin) => {
    if (typeof mixin === 'function') {
      return mixin(acc);
    } else {
      acc.extend(mixin);
      return acc;
    }
  }, modelClass);
  // set the class name after mixins are applied
  Object.defineProperty(mixedClass, 'name', { value: modelClass.name });
  ApplicationModel.models[modelClass.typename] = mixedClass;
  return mixedClass;
}

/**
 * Wrap `object` in a model object if it can be wrapped.
 *
 * @template {ApplicationModel} M
 * @param {M|{__typename: string}} object
 * @param {object} options
 * @param {import('./RelationAttribute').RelationAttribute=} options.parent
 * @returns {M}
 */
export const modelInstance = (object, options = {}) => {
  if (object instanceof ApplicationModel) {
    return object;
  } else if (ApplicationModel.models[object.__typename]) {
    const Model = ApplicationModel.models[object.__typename];
    return new Model(object, options);
  } else {
    // We don't have a model defined for __typename, but can still use
    // it as a regular object.
    // @ts-ignore
    return object;
  }
};

/**
 * Given a value returned from a GraphQL query, return a wrapped
 * version of that value. If you have a bare JS object and want to do
 * something smarter with it, this is the method you want.
 *
 * For example, will wrap models in the correct ApplicationModel
 * subclass, will wrap paginated models in a ModelCollection, will
 * deeply wrap Array and object values, etc.
 *
 * @param {*} attr
 * @param {object} options
 * @param {import('./RelationAttribute').RelationAttribute=} options.parent
 * @param {import('./Query').default=} options.query
 */
export const modelAttribute = (attr, options = {}) => {
  if (attr === null || attr === undefined) {
    return attr;
  } else if (Array.isArray(attr)) {
    return attr.map(obj => modelAttribute(obj, options));
  } else if (typeof attr === 'object' && attr instanceof ApplicationModel) {
    return attr;
  } else if (typeof attr === 'object' && attr.nodes) {
    return new ModelCollection(attr, options);
  } else if (typeof attr === 'object' && attr.__typename) {
    return modelInstance(attr, options);
  } else if (typeof attr === 'object' && !options.json) {
    return modelObject(attr);
  } else {
    return attr;
  }
};

/**
 * Given an object, wraps all of its values using modelAttribute.
 */
export const modelObject = (object, options = {}) => {
  const modelObject = {};
  Object.keys(object).forEach(key => {
    modelObject[key] = modelAttribute(object[key], options);
  });
  return modelObject;
};
