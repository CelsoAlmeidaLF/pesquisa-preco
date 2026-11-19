/**
 * Domain / src/domain/MunicipalityCoverage.js
 * Tells a municipality's own survey apart from a regional reference. No number is created here:
 * a reference is only a value copied from an official source and carried with its origin.
 * The kind is "real" (survey of the municipality) or "reference" (official value of the region).
 */
export const KIND = Object.freeze({ REAL: 'real', REFERENCE: 'reference' });

export const LEVEL_LABEL = Object.freeze({
  municipality: 'do próprio município',
  immediate: 'região imediata',
  intermediate: 'região intermediária',
  capital: 'capital',
});

/** @returns {{kind: string, value: number, period: string, source: string, url: ?string, comparable: boolean, originCity: string, scope: string, label: ?string}} */
export function describeBasket(municipality) {
  const { basket, basketReference, basketKind } = municipality;
  if (basketKind === KIND.REAL && basket && !basketReference) {
    return { kind: KIND.REAL, value: basket.value, period: basket.period, source: basket.source, url: basket.url ?? null,
      comparable: basket.comparable, originCity: municipality.municipality, scope: 'municipality', label: null };
  }
  if (basketKind === KIND.REFERENCE && basketReference && !basket) {
    return { kind: KIND.REFERENCE, value: basketReference.value, period: basketReference.period, source: basketReference.source,
      url: basketReference.url, comparable: false, originCity: basketReference.originCity, scope: basketReference.scope, label: basketReference.label };
  }
  throw new RangeError(`Cesta de ${municipality.municipality}: tipo "${basketKind}" não bate com os dados`);
}

/**
 * @param {object} municipality entry of SaoPauloData
 * @param {'residential'|'commercial'} segment
 * @param {Map<number, object>} citiesByCode FipeZAP cities by IBGE code
 */
export function describeEstate(municipality, segment, citiesByCode) {
  const coverage = municipality.realEstate?.[segment];
  if (!coverage) throw new RangeError(`Imóveis (${segment}) de ${municipality.municipality}: sem cobertura declarada`);
  const origin = citiesByCode.get(coverage.originIbgeCode);
  if (!origin) throw new RangeError(`Imóveis (${segment}) de ${municipality.municipality}: origem ${coverage.originIbgeCode} fora do FipeZAP`);
  const isOwn = coverage.originIbgeCode === municipality.ibgeCode;
  if ((coverage.kind === KIND.REAL) !== isOwn) {
    throw new RangeError(`Imóveis (${segment}) de ${municipality.municipality}: tipo "${coverage.kind}" não bate com a origem`);
  }
  return {
    kind: coverage.kind, level: coverage.level, levelLabel: LEVEL_LABEL[coverage.level], originCity: coverage.originCity,
    source: coverage.source, sale: origin[`${segment}Sale`], rent: origin[`${segment}Rent`],
  };
}
