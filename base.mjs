/* -*- indent-tabs-mode: nil; tab-width: 2; -*- */
/* vim: set ts=2 sw=2 et ai : */

export class Context extends EventTarget {

}

const PROXY_GET = Symbol('PROXY_GET');
const PROXY_SET = Symbol('PROXY_SET');
const PROXY_OWNKEYS = Symbol('PROXY_OWNKEYS');
const PROXY_HAS = Symbol('PROXY_HAS');


export class ProxyObject {
  static get PROXY_GET() {
    return PROXY_GET;
  }

  static get PROXY_SET() {
    return PROXY_SET;
  }

  constructor() {
    const proxy = new Proxy(this, {
      defineProperty(target, prop, descriptor) {
        if (!descriptor.configurable) {
          return false;
        }
        if (descriptor.get || descriptor.set) {
          return false;
        }
        if (false === descriptor.writable) {
          return false;
        }
        return target[PROXY_SET](target, prop, descriptor.value, target);
      },
      get(target, prop, receiver) {
        if (prop == PROXY_GET || prop == PROXY_SET) {
          return undefined;
        }
        return target[PROXY_GET](target, prop, receiver);
      },
      set(target, prop, value, receiver) {
        if (prop == PROXY_GET || prop == PROXY_SET) {
          return false;
        }
        return target[PROXY_SET](target, prop, value, receiver);
      },
      ownKeys(target) {
        return Reflect.ownKeys(target).sort();
      },
    });
    return proxy;
  }

  [PROXY_GET](target, prop, _receiver) {
    return target[prop];
  }

  [PROXY_SET](target, prop, value, _receiver) {
    target[prop] = value;
    return true;
  }
}
