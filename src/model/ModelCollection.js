import { modelInstance } from './modelBuilder';

export default class ModelCollection {
  constructor(responseData, options = {}) {
    Object.keys(responseData).forEach(attribute => {
      this[attribute] = responseData[attribute];
    });
    this.options = options;

    this.models = null;

    return new Proxy(this, {
      get(target, prop, receiver) {
        if (prop in target) {
          return Reflect.get(target, prop, receiver);
        } else {
          target.materializeRecords();
          return Reflect.get(target.models, prop, receiver.models);
        }
      },
      set(target, prop, value) {
        if (prop in target) {
          return Reflect.set(target, prop, value);
        } else {
          target.materializeRecords();
          return Reflect.set(target.models, prop, value);
        }
      },
      has(target, prop) {
        if (Reflect.has(target, prop)) {
          return true;
        } else {
          target.materializeRecords();
          return Reflect.has(target.models, prop);
        }
      },
    });
  }

  materializeRecords() {
    this.models =
      this.models || this.nodes.map(node => modelInstance(node, this.options));
    return this.models;
  }
}
