/**
 * Domain / src/domain/IncomeTaxCalculator.js
 * Monthly income tax (IRPF) of an employee and how far the table lags behind inflation (spec novos-calculos-macro, 3.3).
 * Pure functions: tables and index numbers come as arguments, never from the parameter module (ADR-001, D5).
 * Percentages are in percentage points (120.48 = 120.48%); rates inside tables are fractions (0.275 = 27.5%).
 * Rounding to cents happens only where a money amount is shown or compared (RN-M03).
 */

/** Half-up rounding to cents (the +EPSILON keeps 1.005 style values from falling to the wrong side). */
export const roundCents = value => Math.round((value + Number.EPSILON) * 100) / 100;

function assertFinite(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new RangeError(`${name} deve ser um número finito`);
}

function assertNonNegative(value, name) {
  assertFinite(value, name);
  if (value < 0) throw new RangeError(`${name} não pode ser negativo`);
}

function assertPositive(value, name) {
  assertFinite(value, name);
  if (value <= 0) throw new RangeError(`${name} deve ser maior que zero`);
}

/**
 * Progressive monthly tax by the "alíquota × base − parcela a deduzir" method.
 * @param {number} taxableBase Base de cálculo mensal (R$), já depois das deduções
 * @param {Array<{ate: number|null, aliquota: number, deduzir: number}>} bands Ascending; `ate: null` is the last band
 * @returns {{tax: number, bracket: number}} tax is not rounded; bracket is the index of the band used
 * @throws {RangeError} base negative or not finite
 */
export function monthlyTax(taxableBase, bands) {
  assertNonNegative(taxableBase, 'A base de cálculo');
  if (!Array.isArray(bands) || bands.length === 0) throw new RangeError('A tabela precisa de ao menos uma faixa');
  const bracket = bands.findIndex(band => band.ate === null || taxableBase <= band.ate);
  if (bracket === -1) throw new RangeError('A última faixa da tabela deve ser aberta (ate: null)');
  const { aliquota, deduzir } = bands[bracket];
  return { tax: Math.max(0, taxableBase * aliquota - deduzir), bracket };
}

/**
 * Employee social security (INSS): progressive, each rate applies only to its slice. Rounded once, on the total.
 * @param {number} grossIncome Salário bruto mensal (R$)
 * @param {Array<{ate: number, aliquota: number}>} bands Ascending; the last `ate` is the contribution ceiling
 */
export function socialSecurity(grossIncome, bands) {
  assertNonNegative(grossIncome, 'O salário bruto');
  let total = 0;
  let floor = 0;
  for (const { ate, aliquota } of bands) {
    if (grossIncome > floor) total += (Math.min(grossIncome, ate) - floor) * aliquota;
    floor = ate;
  }
  return roundCents(total);
}

/**
 * Reduction created by Lei 15.270/2025 (art. 3º-A da Lei 9.250). It uses the GROSS income, not the tax base.
 * Up to the exempt limit the tax is zeroed; above it the reduction fades linearly and ends at the upper limit.
 * @param {number} grossIncome Rendimento bruto mensal (R$)
 * @param {number} tableTax Imposto pela tabela (R$)
 * @param {{limiteIsentoBruto: number, limiteSuperiorBruto: number, parcelaFixa: number, coeficiente: number}} rule
 * @returns {number} Valor da redução, nunca maior que o imposto
 */
export function reduction2026(grossIncome, tableTax, rule) {
  assertNonNegative(grossIncome, 'O rendimento bruto');
  assertNonNegative(tableTax, 'O imposto pela tabela');
  if (grossIncome <= rule.limiteIsentoBruto) return tableTax;
  if (grossIncome > rule.limiteSuperiorBruto) return 0;
  return Math.min(tableTax, Math.max(0, rule.parcelaFixa - rule.coeficiente * grossIncome));
}

/**
 * How much the exemption limit lags behind inflation.
 * lag = inflationFactor / correctionFactor - 1; correctedExemption = exemptionLimit × (1 + lag)
 * @param {Object} params
 * @param {number} params.inflationFactor Accumulated inflation as a factor (IPCA index end / start; 1.5 = +50%)
 * @param {number} params.correctionFactor Accumulated correction of the table as a factor (exemption now / exemption at the start)
 * @param {number} params.exemptionLimit Current monthly exemption limit (R$)
 * @returns {{valor: {lagPct: number, correctedExemption: number, factor: number}, formulaExata: boolean, avisos: string[]}}
 *   formulaExata is true: it is an identity over two official series; the application decides the seal from the insumos.
 * @throws {RangeError} factor or exemption not positive
 */
export function bracketLag({ inflationFactor, correctionFactor, exemptionLimit }) {
  assertPositive(inflationFactor, 'O fator de inflação');
  assertPositive(correctionFactor, 'O fator de correção da tabela');
  assertPositive(exemptionLimit, 'O limite de isenção');
  const factor = inflationFactor / correctionFactor;
  return { valor: { lagPct: (factor - 1) * 100, correctedExemption: exemptionLimit * factor, factor }, formulaExata: true, avisos: [] };
}

/**
 * The table with every limit and every "parcela a deduzir" multiplied by the lag factor, rounded to cents.
 * @param {Array<{ate: number|null, aliquota: number, deduzir: number}>} bands
 * @param {number} factor Fator de defasagem (1 + lagPct / 100)
 */
export function correctedBands(bands, factor) {
  assertPositive(factor, 'O fator de defasagem');
  return bands.map(band => ({
    ate: band.ate === null ? null : roundCents(band.ate * factor),
    aliquota: band.aliquota,
    deduzir: roundCents(band.deduzir * factor)
  }));
}

/**
 * Gross salary whose tax base equals the given base, by the same deduction rule (bigger of INSS and simplified discount).
 * Used for the "effective exemption" view: how much gross salary the corrected exemption would protect.
 * @returns {number} Bruto em reais, arredondado ao centavo
 */
export function grossForBase(base, { inssBands, simplifiedDiscount }) {
  assertNonNegative(base, 'A base');
  const baseOf = gross => gross - Math.max(socialSecurity(gross, inssBands), simplifiedDiscount);
  let low = base;
  let high = base * 2 + simplifiedDiscount + 10000;
  for (let i = 0; i < 80; i++) {
    const mid = (low + high) / 2;
    if (baseOf(mid) < base) low = mid; else high = mid;
  }
  return roundCents(high);
}

/**
 * One salary through the chain bruto → INSS → deduction → base → table → reduction, in 2026 rules and with the corrected table.
 * @param {Object} params
 * @param {number} params.grossIncome Salário bruto mensal (R$)
 * @param {Object} params.law Tabela em vigor: {faixas, descontoSimplificado, reducao?} (reducao existe a partir de 2026)
 * @param {Array} params.inssBands Faixas do INSS
 * @param {number} params.lagFactor Fator de defasagem da tabela (1 + lagPct / 100)
 * @returns {Object} Todos os valores em R$ com centavos (sem dependentes; sem 13º nem ajuste anual)
 */
export function compareWithCorrectedTable({ grossIncome, law, inssBands, lagFactor }) {
  assertNonNegative(grossIncome, 'O salário bruto');
  const inss = socialSecurity(grossIncome, inssBands);
  // The deduction cannot be bigger than the income: a salary under the simplified discount has base zero
  const deduction = Math.min(grossIncome, Math.max(inss, law.descontoSimplificado));
  const base = roundCents(grossIncome - deduction);
  const tableTax = roundCents(monthlyTax(base, law.faixas).tax);
  // Laws before 2026 have no reduction
  const reduction = law.reducao ? roundCents(reduction2026(grossIncome, tableTax, law.reducao)) : 0;
  const tax2026 = roundCents(Math.max(0, tableTax - reduction));
  const correctedTax = roundCents(monthlyTax(base, correctedBands(law.faixas, lagFactor)).tax);
  const monthlyDifference = roundCents(tax2026 - correctedTax);
  return {
    grossIncome, inss, deduction, usesSimplifiedDiscount: law.descontoSimplificado >= inss, base,
    tableTax, reduction, tax2026, correctedTax, monthlyDifference, annualDifference: roundCents(monthlyDifference * 12)
  };
}
