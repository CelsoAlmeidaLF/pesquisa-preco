/** Application / src/application/PreferencesService.js: what this person chose to keep between visits. */
const CAPITAL = 'capital';
// Wage key: absent = not remembering; empty = remembering, nothing typed yet; number = the remembered wage
const WAGE = 'renda';

export class PreferencesService {
  /**
   * @param {Object} deps
   * @param {{read: Function, write: Function, remove: Function}} deps.store
   * @param {(code: number) => boolean} deps.isCapital
   * @param {{min: number, max: number}} deps.wageRange
   */
  constructor({ store, isCapital, wageRange }) {
    this.store = store;
    this.isCapital = isCapital;
    this.wageRange = wageRange;
  }

  /** @returns {number|null} */
  preferredCapital() {
    const code = Number(this.store.read(CAPITAL));
    return this.isCapital(code) ? code : null;
  }

  /** @param {number|null} code null goes back to the app default */
  setPreferredCapital(code) {
    if (code === null) this.store.remove(CAPITAL);
    else if (this.isCapital(code)) this.store.write(CAPITAL, code);
  }

  isRememberingWage() {
    return this.store.read(WAGE) !== null;
  }

  /** @returns {number|null} */
  rememberedWage() {
    const saved = this.store.read(WAGE);
    return saved && this.isValidWage(Number(saved)) ? Number(saved) : null;
  }

  /**
   * The wage is sensitive: it is stored only after the person opts in, and turning it off erases it.
   * @param {boolean} remember
   * @param {number} [currentWage] What is typed on screen right now
   */
  setRememberWage(remember, currentWage) {
    if (!remember) {
      this.store.remove(WAGE);
      return;
    }
    this.store.write(WAGE, this.isValidWage(currentWage) ? currentWage : '');
  }

  /** @param {number} wage Ignored unless the person opted in and the value is in range */
  saveWage(wage) {
    if (this.isRememberingWage() && this.isValidWage(wage)) this.store.write(WAGE, wage);
  }

  isValidWage(wage) {
    return Number.isFinite(wage) && wage >= this.wageRange.min && wage <= this.wageRange.max;
  }
}
