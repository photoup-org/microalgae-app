/**
 * Carbonate speciation from pH — PROVISIONAL.
 *
 * Total alkalinity is what closes the carbonate system, and it is not measured
 * yet: it will be determined experimentally later. Until then this module runs the
 * real equilibrium equations against an ASSUMED alkalinity, so switching to
 * measured values changes one input rather than any of the maths.
 *
 * Read that plainly: the numbers this produces are an estimate of the shape of the
 * system, not a measurement of it. Anything rendering them has to say so.
 *
 * Two known simplifications on top of the assumed alkalinity:
 *
 *  1. Carbonate alkalinity only: TA is treated as [HCO3-] + 2[CO3(2-)], ignoring
 *     the borate, phosphate and silicate contributions. All of the alkalinity is
 *     therefore attributed to carbonate, which biases every species and DIC
 *     HIGH - checked against a seawater reference point (pH 8.1, TA 2300, 25 °C,
 *     S 35), this returns DIC 2064 µmol/kg where the accepted value is ~2000-2050,
 *     and CO2* 10.1 against ~10.
 *  2. Concentrations, not activities. The constants below are on the total pH
 *     scale, and a probe calibrated on NBS buffers reads slightly differently.
 *
 * Constants: K1 and K2 from Lueker et al. (2000) on the total scale, K0 (CO2
 * solubility) from Weiss (1974). Both are seawater formulations, matching the
 * saline medium in use - they are NOT valid for a freshwater medium, which would
 * need Millero's freshwater fits instead.
 */

/** Molar mass of CO2, for reporting dissolved CO2 in mg/L. */
const CO2_MOLAR_MASS = 44.009;
/** Molar mass of carbon, for reporting DIC as mg C/L. */
const CARBON_MOLAR_MASS = 12.011;

export interface MediumAssumptions {
    /** Practical salinity. Seawater is ~35. */
    salinity: number;
    /** Total alkalinity in µmol/kg. Surface seawater is ~2300. */
    totalAlkalinity: number;
}

/**
 * Stand-ins until alkalinity is titrated. Deliberately named as assumptions and
 * surfaced in the UI rather than buried here.
 */
export const DEFAULT_MEDIUM: MediumAssumptions = {
    salinity: 35,
    totalAlkalinity: 2300,
};

export interface CarbonateResult {
    /** Dissolved CO2, i.e. CO2*(aq) = CO2(aq) + H2CO3, in mg/L. */
    dissolvedCo2MgL: number;
    /** Dissolved inorganic carbon, as mg of carbon per litre. */
    dicMgCL: number;
    /** Species in µmol/kg, for anyone wanting the underlying numbers. */
    speciesUmolKg: { co2: number; hco3: number; co3: number; dic: number };
}

/**
 * K1 — first dissociation constant of carbonic acid, total scale.
 * Lueker, Dickson & Keeling (2000), valid 2-35 °C and salinity 19-43.
 */
function k1(tempK: number, salinity: number): number {
    const pK1 =
        3633.86 / tempK -
        61.2172 +
        9.6777 * Math.log(tempK) -
        0.011555 * salinity +
        0.0001152 * salinity * salinity;
    return Math.pow(10, -pK1);
}

/** K2 — second dissociation constant, same source and range. */
function k2(tempK: number, salinity: number): number {
    const pK2 =
        471.78 / tempK +
        25.929 -
        3.16967 * Math.log(tempK) -
        0.01781 * salinity +
        0.0001122 * salinity * salinity;
    return Math.pow(10, -pK2);
}

/**
 * K0 — CO2 solubility (Henry's law), mol/(kg·atm). Weiss (1974).
 *
 * Unused by the pH+TA path below, but kept here because it is what converts the
 * headspace CO2 sensor's ppm into an independent dissolved-CO2 estimate. That
 * cross-check is the natural next step once alkalinity is measured.
 */
export function co2Solubility(tempK: number, salinity: number): number {
    const t = tempK / 100;
    const lnK0 =
        -60.2409 +
        93.4517 / t +
        23.3585 * Math.log(t) +
        salinity * (0.023517 - 0.023656 * t + 0.0047036 * t * t);
    return Math.exp(lnK0);
}

/**
 * Solves the carbonate system from pH and an assumed total alkalinity.
 *
 * With TA ≈ [HCO3-] + 2[CO3(2-)] and [CO3(2-)] = [HCO3-]·K2/[H+]:
 *
 *   [HCO3-] = TA / (1 + 2·K2/[H+])
 *   [CO2*]  = [HCO3-]·[H+]/K1
 *
 * Returns null for inputs outside the constants' validity rather than
 * extrapolating - a confidently wrong mg/L is worse than a blank.
 */
export function carbonateFromPh(
    ph: number,
    temperatureC: number,
    medium: MediumAssumptions = DEFAULT_MEDIUM
): CarbonateResult | null {
    if (!Number.isFinite(ph) || !Number.isFinite(temperatureC)) return null;
    if (ph < 5 || ph > 10) return null;
    if (temperatureC < 0 || temperatureC > 40) return null;

    const tempK = temperatureC + 273.15;
    const h = Math.pow(10, -ph);
    const K1 = k1(tempK, medium.salinity);
    const K2 = k2(tempK, medium.salinity);

    const hco3 = medium.totalAlkalinity / (1 + (2 * K2) / h);
    const co3 = (hco3 * K2) / h;
    const co2 = (hco3 * h) / K1;
    const dic = co2 + hco3 + co3;

    // µmol/kg to mg/L: seawater density is ~1.025 kg/L, close enough to 1 that the
    // difference is far below the error already introduced by assuming alkalinity.
    return {
        dissolvedCo2MgL: (co2 * CO2_MOLAR_MASS) / 1000,
        dicMgCL: (dic * CARBON_MOLAR_MASS) / 1000,
        speciesUmolKg: { co2, hco3, co3, dic },
    };
}
