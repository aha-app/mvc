// Maintain a registry of model instances that want to have changes to
// attribute values synchronized optimistically in the client.
//
// We use WeakRef here so that if there are no references to the model other
// than this code, then it can be garbage collected.

import WeakRef from 'javascripts/WeakRef';
export default class SynchronizedModelRegistry {
  static globalRegistry = null;

  models = {};

  static get instance() {
    this.globalRegistry =
      this.globalRegistry || new SynchronizedModelRegistry();
    return this.globalRegistry;
  }

  // Register a model instance for synchronization.
  register(model) {
    if (!model.id) return;

    this.models[this.modelKey(model)] =
      this.models[this.modelKey(model)] || new Set();
    this.models[this.modelKey(model)].add(new WeakRef(model)); // eslint-disable-line no-undef
  }

  modelKey(model) {
    return `${model.typename}-${model.id}`;
  }

  // Synchronize a change from model to all other instances of the same record.
  synchronize(model, changedAttributes) {
    for (const ref of this.models[this.modelKey(model)] || []) {
      const instance = ref.deref();
      if (!instance) continue;

      for (const attribute in changedAttributes) {
        if (instance.constructor.hasField(attribute)) {
          instance[attribute] = changedAttributes[attribute];
        }
      }
    }
  }
}
