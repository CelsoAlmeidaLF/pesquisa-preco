/**
 * Domain / src/domain/BasketCalculator.js
 * Rules of the DIEESE/Conab basic food basket. No dependency on data sources or the browser.
 */

/** Share of the gross minimum wage left after the 7.5% social security discount (DIEESE). */
export const NET_WAGE_FACTOR = 0.925;
/** Constitutional monthly working hours used by DIEESE. */
export const MONTHLY_WORK_HOURS = 220;
/** Working hours of a regular day, used to turn hours into estimated working days. */
export const DAILY_WORK_HOURS = 8;
/** Family of two adults and two children consumes as much as three adults (DIEESE). */
export const BASKETS_PER_FAMILY = 3;
/** Share of food in the family budget used by DIEESE (POF 1994/1995). */
export const FOOD_BUDGET_SHARE = 0.3571;

export const ITEM_CATALOG = Object.freeze([
  { key: 'meat', label: 'Carne bovina', unit: 'kg' },
  { key: 'milk', label: 'Leite', unit: 'L' },
  { key: 'beans', label: 'Feijão', unit: 'kg' },
  { key: 'rice', label: 'Arroz', unit: 'kg' },
  { key: 'flour', label: 'Farinha', unit: 'kg' },
  { key: 'potato', label: 'Batata', unit: 'kg' },
  { key: 'tomato', label: 'Tomate', unit: 'kg' },
  { key: 'bread', label: 'Pão francês', unit: 'kg' },
  { key: 'coffee', label: 'Café em pó', unit: 'kg' },
  { key: 'banana', label: 'Banana', unit: 'dúzia' },
  { key: 'sugar', label: 'Açúcar', unit: 'kg' },
  { key: 'oil', label: 'Óleo de soja', unit: '900 ml' },
  { key: 'butter', label: 'Manteiga', unit: 'kg' },
]);

const roundCents = value => Math.round((value + Number.EPSILON) * 100) / 100;

function assertPositive(value, name) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} deve ser um número positivo`);
}

/** Lines of the basket: quantity x price = cost, skipping items outside the region's basket. */
export function basketLines(prices, quantities) {
  return ITEM_CATALOG
    .filter(item => quantities[item.key] > 0)
    .map(item => {
      const price = prices[item.key];
      assertPositive(price, `Preço de ${item.label}`);
      const quantity = quantities[item.key];
      return { ...item, quantity, price, cost: roundCents(price * quantity) };
    });
}

export function basketCost(prices, quantities) {
  return roundCents(basketLines(prices, quantities).reduce((sum, line) => sum + line.cost, 0));
}

export function wagePercent(basketValue, minimumWage) {
  assertPositive(basketValue, 'Valor da cesta');
  assertPositive(minimumWage, 'Salário mínimo');
  return basketValue / (minimumWage * NET_WAGE_FACTOR) * 100;
}

/** Multiplies before dividing: the other order loses one minute on exact results (R$ 230 / R$ 100 x 220 h). */
export function workTime(basketValue, wage, monthlyHours = MONTHLY_WORK_HOURS) {
  assertPositive(basketValue, 'Valor da cesta');
  assertPositive(wage, 'Salário');
  assertPositive(monthlyHours, 'Jornada mensal');
  const totalMinutes = Math.floor(basketValue * monthlyHours * 60 / wage);
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}

/**
 * What the basket costs to someone with the given net income.
 * Unlike the DIEESE work time, which uses the gross minimum wage, every figure here uses the net income.
 */
export function customPurchasingPower(basketValue, monthlyNetWage, monthlyHours = MONTHLY_WORK_HOURS) {
  assertPositive(basketValue, 'Valor da cesta');
  assertPositive(monthlyNetWage, 'Renda mensal líquida');
  assertPositive(monthlyHours, 'Jornada mensal');
  return {
    basketValue,
    monthlyWage: monthlyNetWage,
    shareOfWage: basketValue / monthlyNetWage * 100,
    workTime: workTime(basketValue, monthlyNetWage, monthlyHours),
    workDays: basketValue * monthlyHours / monthlyNetWage / DAILY_WORK_HOURS,
  };
}

export function neededMinimumWage(highestBasket) {
  assertPositive(highestBasket, 'Valor da cesta');
  return roundCents(highestBasket * BASKETS_PER_FAMILY / FOOD_BUDGET_SHARE);
}

/**
 * Lowest, highest and simple average of one item among the capitals that collect it.
 * The average is arithmetic across capitals, it is not an official national price.
 */
export function priceRange(entries) {
  if (!entries.length) throw new RangeError('Sem preços para comparar');
  const sorted = [...entries].sort((a, b) => a.price - b.price);
  const lowest = sorted[0];
  const highest = sorted[sorted.length - 1];
  const average = entries.reduce((sum, entry) => sum + entry.price, 0) / entries.length;
  return {
    lowest, highest, average: roundCents(average), count: entries.length,
    lowestVsAverage: (lowest.price / average - 1) * 100,
  };
}
