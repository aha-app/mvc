/**
 * A simple proxy to represent a pointer to the model that instantiated this
 * one.
 *
 * ```js
 * const feature = await Feature.select('id').merge({description: Note.select('htmlBody')}).find('TTT-123');
 * const note = feature.description;
 * note.parent // this is a RelationAttribute
 * note.parent.typename // Feature
 * note.parent.attribute // 'description'
 * ```
 */
export class RelationAttribute {
  /**
   * @param {import('./ApplicationModel').default} model
   * @param {string=} attribute
   */
  constructor(model, attribute) {
    // @ts-ignore
    return new Proxy(model, {
      get(target, prop, receiver) {
        if (prop === 'attribute') return attribute;
        return Reflect.get(target, prop, receiver);
      },
      has(target, prop) {
        if (prop === 'attribute') return true;
        return Reflect.has(target, prop);
      },
    });
  }
}
