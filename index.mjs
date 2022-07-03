/* -*- indent-tabs-mode: nil; tab-width: 2; -*- */
/* vim: set ts=2 sw=2 et ai : */

const deepFreeze = (obj) => {
  function freeze(obj, aVisited) {
    if (null === obj || 'object' != typeof obj && 'function' != typeof obj) {
      return obj;
    }
    const visited = Array.isArray(aVisited) ? aVisited : [];
    if (visited.includes(obj)) {
      return obj;
    }
    Object.freeze(obj);
    visited.push(obj);
    for (const prop of Reflect.ownKeys(obj)) {
      freeze(obj[prop], visited);
    }
    visited.pop();
    return obj;
  }
  return freeze(obj);
};

const equals = (a, b) => {
  function equals(a, b, aVisitedA, aVisitedB) {
    if (null !== a && 'object' == typeof a && !('toJSON' in a)) {
      try {
        const json = JSON.stringify(a);
        const value = JSON.parse(json);
        if ('object' != typeof value) {
          return equals(value, b, aVisitedA, aVisitedB);
        }
      } catch (e) {}
    }
    if (null !== b && 'object' == typeof b && !('toJSON' in b)) {
      try {
        const json = JSON.stringify(b);
        const value = JSON.parse(json);
        if ('object' != typeof value) {
          return equals(a, value, aVisitedA, aVisitedB);
        }
      } catch (e) {}
    }
    if (typeof a != typeof b) {
      return false;
    } else if ('number' == typeof a) {
      return Object.is(a, b);
    } else if (a === b) {
      return true;
    } else if (null === a || null === b || 'object' != typeof a) {
      return false;
    }
    const visitedA = Array.isArray(aVisitedA) ? aVisitedA : [];
    const visitedB = Array.isArray(aVisitedB) ? aVisitedB : [];
    if (visitedA.includes(a) || visitedB.includes(b)) {
      if (visitedA.indexOf(a) == visitedB.indexOf(b)) {
        return true;
      }
      return false;
    }
    visitedA.push(a);
    visitedB.push(b);
    let result = false;
    objectComparison: {
      if (Array.isArray(a)) {
        if (!Array.isArray(b)) {
          result = false;
          break objectComparison;
        }
        if (a.length != b.length) {
          result = false;
          break objectComparison;
        }
        for (let i = 0; i < a.length; i++) {
          if (!equals(a[i], b[i], visitedA, visitedB)) {
            result = false;
            break objectComparison;
          }
        }
        result = true;
        break objectComparison;
      } else {
        const a_props = Object.getOwnPropertyNames(a).sort();
        const b_props = Object.getOwnPropertyNames(b).sort();
        if (a_props.length != b_props.length) {
          result = false;
          break objectComparison;
        }
        for (let i = 0; i < a_props.length; i++) {
          const a_prop = a_props[i];
          const b_prop = b_props[i];
          if (a_prop != b_prop) {
            result = false;
            break objectComparison;
          }
          if (!equals(a[a_prop], b[b_prop], visitedA, visitedB)) {
            result = false;
            break objectComparison;
          }
        }
        result = true;
        break objectComparison;
      }
    }
    visitedA.pop();
    visitedB.pop();
    return result;
  }
  return equals(a, b);
};

class State {
  #savedValue = {};
  #propertyObservers = new Map;
  #deletionObservers = new Map;
  #additionObservers = new Map;

  constructor() {
    //
  }

  toJSON() {
    const getSortedObject = (source, aVisited) => {
      const visited = aVisited instanceof WeakSet ? aVisited : new WeakSet;
      if ('symbol' == typeof source || 'function' == typeof source) {
        return null;
      } else if (null === source) {
        return null;
      } if ('object' != typeof source) {
        return source;
      }
      if (visited.has(source)) {
        throw new TypeError('Cyclic object!');
      }
      visited.add(source);
      if (Array.isArray(source)) {
        const arr = [];
        for (let i = 0 ; i < source.length; i++) {
          const value = source[i];
          arr[i] = getSortedObject(value, visited);
        }
        return arr;
      } else {
        const obj = {};
        for (const prop of Object.getOwnPropertyNames(source).sort()) {
          const descriptor = Object.getOwnPropertyDescriptor(source, prop);
          if (!descriptor.enumerable) {
            continue;
          }
          const value = source[prop];
          obj[prop] = getSortedObject(value, visited);
        }
        return obj;
      }
    };
    return getSortedObject(this);
  }

  serialize() {
    return JSON.stringify(this);
  }

  unserialize(json) {
    const data = JSON.parse(json);
    if (null === data || 'object' != typeof data) {
      throw new TypeError('Invalid data');
    }
    for (const prop of Object.getOwnPropertyNames(this)) {
      delete this[prop];
    }
    for (const prop of Object.getOwnPropertyNames(data).sort()) {
      this[prop] = data[prop];
    }
  }

  restore() {
    this.notifyUpdates();
  }

  save() {
    const json = JSON.stringify(this);
    this.#savedValue = JSON.parse(json);
  }

  observe(observer) {
    if ('function' != typeof observer) {
      throw new TypeError('Not a function');
    }
    this.observeProperty(null, observer);
  }

  unobserve(observer) {
    if ('function' != typeof observer) {
      throw new TypeError('Not a function');
    }
    this.unobserveProperty(null, observer);
  }

  get(aProp) {
    if (!aProp && aProp !== '') {
      return this.#savedValue;
    }
    const path = (aProp ? String(aProp) : '').split('.');
    if ('' == path[0]) {
      path.shift();
    }
    let obj = this.#savedValue;
    for (let i = 0; i < path.length; i++) {
      const prop = path[i];
      if (null === obj || 'object' != typeof obj) {
        return undefined;
      }
      const descriptor = Object.getOwnPropertyDescriptor(obj, prop);
      if (!descriptor) {
        return undefined;
      }
      if (!descriptor.enumerable) {
        return undefined;
      }
      obj = obj[prop];
    }
    return obj;
  }

  observeProperty(aProp, observer) {
    let prop = aProp || aProp === '' ? String(aProp) : null;
    if ('function' == typeof aProp) {
      observer = aProp;
      prop = null;
    }
    if ('function' != typeof observer) {
      throw new TypeError('Not a function');
    }
    if (!this.#propertyObservers.has(prop)) {
      this.#propertyObservers.set(prop, new Set);
    }
    const observers = this.#propertyObservers.get(prop);
    observers.add(observer);
    observer(this.get(prop));
  }

  unobserveProperty(aProp, observer) {
    let prop = aProp || aProp === '' ? String(aProp) : null;
    if ('function' == typeof aProp) {
      observer = aProp;
      prop = null;
    }
    if ('function' != typeof observer) {
      throw new TypeError('Not a function');
    }
    if (!this.#propertyObservers.has(prop)) {
      return;
    }
    const observers = this.#propertyObservers.get(prop);
    observers.delete(observer);
    if (0 == observers.size) {
      this.#propertyObservers.delete(prop);
    }
  }

  observePropertyDeletion(aProp, observer) {
    let prop = aProp || aProp === '' ? String(aProp) : null;
    if ('function' == typeof aProp) {
      observer = aProp;
      prop = null;
    }
    if ('function' != typeof observer) {
      throw new TypeError('Not a function');
    }
    if (!this.#deletionObservers.has(prop)) {
      this.#deletionObservers.set(prop, new Set);
    }
    const observers = this.#deletionObservers.get(prop);
    observers.add(observer);
  }

  unobservePropertyDeletion(aProp, observer) {
    let prop = aProp || aProp === '' ? String(aProp) : null;
    if ('function' == typeof aProp) {
      observer = aProp;
      prop = null;
    }
    if ('function' != typeof observer) {
      throw new TypeError('Not a function');
    }
    if (!this.#deletionObservers.has(prop)) {
      return;
    }
    const observers = this.#deletionObservers.get(prop);
    observers.delete(observer);
    if (0 == observers.size) {
      this.#deletionObservers.delete(prop);
    }
  }

  observePropertyAddition(aProp, observer) {
    let prop = aProp || aProp === '' ? String(aProp) : null;
    if ('function' == typeof aProp) {
      observer = aProp;
      prop = null;
    }
    if ('function' != typeof observer) {
      throw new TypeError('Not a function');
    }
    if (!this.#additionObservers.has(prop)) {
      this.#additionObservers.set(prop, new Set);
    }
    const observers = this.#additionObservers.get(prop);
    observers.add(observer);
  }

  unobservePropertyAddition(aProp, observer) {
    let prop = aProp || aProp === '' ? String(aProp) : null;
    if ('function' == typeof aProp) {
      observer = aProp;
      prop = null;
    }
    if ('function' != typeof observer) {
      throw new TypeError('Not a function');
    }
    if (!this.#additionObservers.has(prop)) {
      return;
    }
    const observers = this.#additionObservers.get(prop);
    observers.delete(observer);
    if (0 == observers.size) {
      this.#additionObservers.delete(prop);
    }
  }

  notifyUpdates() {
    // call observers here
    const callPropertyObservers = (prop, newValue) => {
      const observers = this.#propertyObservers.get(prop);
      if (!(observers instanceof Set)) {
        return;
      }
      for (const observer of observers) {
        observer(newValue);
      }
    };
    const callDeletionObservers = (prop, deletedProp) => {
      const observers = this.#deletionObservers.get(prop);
      if (!(observers instanceof Set)) {
        return;
      }
      for (const observer of observers) {
        observer(deletedProp);
      }
    };
    const callAdditionObservers = (prop, newProp, newValue) => {
      const observers = this.#additionObservers.get(prop);
      if (!(observers instanceof Set)) {
        return;
      }
      for (const observer of observers) {
        observer(newProp, newValue);
      }
    };
    function compare(oldValue, newValue, aVisitedOld, aVisitedNew, aPath) {
      if (null !== oldValue && 'object' == typeof oldValue && !('toJSON' in oldValue)) {
        try {
          const json = JSON.stringify(oldValue);
          const value = JSON.parse(json);
          if ('object' != typeof value) {
            return compare(value, newValue, aVisitedOld, aVisitedNew, aPath);
          }
        } catch (e) {}
      }
      if (null !== newValue && 'object' == typeof newValue && !('toJSON' in newValue)) {
        try {
          const json = JSON.stringify(newValue);
          const value = JSON.parse(json);
          if ('object' != typeof value) {
            return compare(oldValue, value, aVisitedOld, aVisitedNew, aPath);
          }
        } catch (e) {}
      }
      const path = Array.isArray(aPath) ? aPath : [];
      const joinedPath = path.length > 0 ? path.join('.') : null;
      if (typeof oldValue != typeof newValue) {
        callPropertyObservers(joinedPath, newValue);
        return false;
      } else if ('number' == typeof oldValue) {
        if (!Object.is(oldValue, newValue)) {
          callPropertyObservers(joinedPath, newValue);
          return false;
        } else {
          return true;
        }
      } else if (oldValue === newValue) {
        return true;
      } else if (null === oldValue || null === newValue || 'object' != typeof oldValue) {
        callPropertyObservers(joinedPath, newValue);
        return false;
      } else {
        const visitedOld = Array.isArray(aVisitedOld) ? aVisitedOld : [];
        const visitedNew = Array.isArray(aVisitedNew) ? aVisitedNew : [];
        if (visitedOld.includes(oldValue) || visitedNew.includes(newValue)) {
          throw new TypeError('Cyclic object reference');
        }
        visitedOld.push(oldValue);
        visitedNew.push(newValue);
        let result = true;
        if (Array.isArray(oldValue)) {
          if (!Array.isArray(newValue)) {
            result = false;
          } else {
            for (let i = 0; i < Math.max(oldValue.length, newValue.length); i++) {
              if (i >= oldValue.length) {
                callAdditionObservers(joinedPath, i, newValue[i]);
                result = false;
              } else if (i >= newValue.length) {
                callDeletionObservers(joinedPath, i);
                result = false;
              } else {
                path.push(i);
                if (!compare(oldValue[i], newValue[i], visitedOld, visitedNew, path)) {
                  result = false;
                }
                path.pop();
              }
            }
          }
        } else if (Array.isArray(newValue)) {
          result = false;
        } else {
          const oldProps = Object.getOwnPropertyNames(oldValue);
          const newProps = Object.getOwnPropertyNames(newValue);
          const props = [... new Set([
            ... oldProps,
            ... newProps,
          ])].sort();
          for (const prop of props) {
            if (!oldProps.includes(prop)) {
              callAdditionObservers(joinedPath, prop, newValue[prop]);
              result = false;
            } else if (!newProps.includes(prop)) {
              callDeletionObservers(joinedPath, prop);
              result = false;
            } else {
              path.push(prop);
              if (!compare(oldValue[prop], newValue[prop], visitedOld, visitedNew, path)) {
                result = false;
              }
              path.pop();
            }
          }
        }
        visitedOld.pop();
        visitedNew.pop();
        if (!result) {
          callPropertyObservers(joinedPath, newValue);
        }
        return result;
      }
    }
    compare(this.#savedValue, this);
    this.save();
  }
}

class ClientState extends State {
  #storageKey;
  constructor(storageKey) {
    super();
    this.#storageKey = storageKey ? String(storageKey) : 'menhera.state.client';
    this.restore();
    try {
      window.addEventListener('storage', (ev) => {
        if (ev.key == this.#storageKey) {
          this.restore();
        }
      });
    } catch (e) {}
  }

  restore() {
    try {
      const item = localStorage.getItem(this.#storageKey);
      if (item) {
        this.unserialize(item);
      }
    } catch (e) {}
    super.restore();
  }

  save() {
    super.save();
    try {
      const json = this.serialize();
      localStorage.setItem(this.#storageKey, json);
    } catch (e) {}
  }
}

class SessionState extends State {
  #storageKey;
  constructor(storageKey) {
    super();
    this.#storageKey = storageKey ? String(storageKey) : 'menhera.state.session';
    this.restore();
  }

  restore() {
    try {
      const item = sessionStorage.getItem(this.#storageKey);
      if (item) {
        this.unserialize(item);
      }
    } catch (e) {}
    super.restore();
  }

  save() {
    super.save();
    try {
      const json = this.serialize();
      sessionStorage.setItem(this.#storageKey, json);
    } catch (e) {}
  }
}

class StateDictionary {
  #value = {};
  #observers = [];

  constructor(value) {
    if ('object' == typeof value && null !== value) {
      this.#value = value;
    }
  }

  setValue(newValue) {
    if ('object' != typeof newValue || null === newValue) {
      throw new TypeError('Not an object');
    }
    const currentProperties = Reflect.ownKeys(this.#value);
    const newProperties = Reflect.ownKeys(newValue);
  }

  equals(other) {
    if (!(other instanceof StateDictionary)) {
      return false;
    }
    const myProperties = Reflect.ownKeys(this.#value);
    const otherProperties = Reflect.ownKeys(other.#value);
    if (myProperties.length != otherProperties.length) {
      return false;
    }
    for (const prop of myProperties) {
      if (!otherProperties.includes(prop)) {
        return false;
      }
      const myValue = this.#value[prop];
      const otherValue = other.#value[prop];
      if (!equals(myValue, otherValue)) {
        return false;
      }
    }
    return true;
  }

  observe(observer) {

  }

  observeProperty(prop, observer) {

  }
}
