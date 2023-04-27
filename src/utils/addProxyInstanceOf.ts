import { raw } from '@nx-js/observer-util';

// HACK:
// To get instanceof to work with Proxies (and not raise errors when
// constructing observed objects), we need to instanceof the raw
// objects, not the proxy objects.
//
// Remove this once https://github.com/nx-js/observer-util/issues/48
// is fixed.
export default function (constructor) {
  Object.defineProperty(constructor, Symbol.hasInstance, {
    value: function (instance) {
      if (!instance) return false;
      let rawInstance = raw(instance);
      let rawInstanceProto = raw(Object.getPrototypeOf(rawInstance));
      let rawThis = raw(this);

      if (rawInstanceProto === rawThis.prototype) {
        return true;
      } else {
        return rawInstanceProto instanceof rawThis;
      }
    },
  });
}
