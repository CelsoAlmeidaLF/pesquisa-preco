/** Infrastructure / src/infrastructure/LocalPreferencesStore.js: preferences kept in this browser only. */
export class LocalPreferencesStore {
  /**
   * @param {Object} [options]
   * @param {string} [options.prefix] Must match the app name given to StkGovConfig, so "Apagar dados" finds the keys
   * @param {Storage} [options.storage]
   */
  constructor({ prefix = 'pesquisa-preco.', storage } = {}) {
    this.prefix = prefix;
    try {
      this.storage = storage || globalThis.localStorage || null;
    } catch {
      this.storage = null; // private mode or blocked storage
    }
  }

  /** @returns {string|null} */
  read(name) {
    try {
      return this.storage ? this.storage.getItem(this.prefix + name) : null;
    } catch {
      return null;
    }
  }

  write(name, value) {
    try {
      this.storage?.setItem(this.prefix + name, String(value));
    } catch {
      /* full or blocked: the choice lasts for this visit */
    }
  }

  remove(name) {
    try {
      this.storage?.removeItem(this.prefix + name);
    } catch {
      /* blocked: nothing was stored either */
    }
  }
}
