/**
 * Domain / src/domain/RealEstateCalculator.js
 * Estimates from the advertised prices per square meter of the FipeZAP index.
 */

export const COMMERCIAL_MAX_AREA = 200;

/**
 * @param {{salePerM2: number|null, rentPerM2: number|null, area: number}} input
 * @returns {{purchase: number|null, monthlyRent: number|null, yearsOfRent: number|null}}
 */
export function estimateProperty({ salePerM2, rentPerM2, area }) {
  if (!Number.isFinite(area) || area <= 0) throw new RangeError('A área deve ser maior que zero');
  const purchase = salePerM2 == null ? null : salePerM2 * area;
  const monthlyRent = rentPerM2 == null ? null : rentPerM2 * area;
  const yearsOfRent = purchase == null || !monthlyRent ? null : purchase / (monthlyRent * 12);
  return { purchase, monthlyRent, yearsOfRent };
}
