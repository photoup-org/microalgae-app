/**
 * Per-metric calibration recipes.
 *
 * The wizard is driven entirely by this table rather than by branching on a device
 * type: a metric is calibratable if and only if it appears here. `instructions` is
 * indexed by step, so a probe with different standards per point explains each one.
 */
export interface CalibrationConfig {
    minPoints: number;
    maxPoints: number;
    /** Pre-filled reference value for each step. */
    defaultReferences: number[];
    /** What the operator should physically do at each step. */
    instructions: string[];
    unit: string;
    /**
     * "segments": piecewise-linear through the points (pH, a handful of buffers).
     * "auto": least-squares fit of several models, best one by AICc
     * (lib/calibration-models.ts) - for curves measured against many samples.
     */
    fit: "segments" | "auto";
}

export const REACTOR_CALIBRATION: Record<string, CalibrationConfig> = {
    ph: {
        minPoints: 2,
        maxPoints: 3,
        defaultReferences: [7.0, 4.0, 10.0],
        instructions: [
            "Enxagúe a sonda com água destilada e mergulhe-a na solução tampão pH 7.00. Aguarde a leitura estabilizar.",
            "Enxagúe novamente e mergulhe na solução tampão pH 4.00. Aguarde a leitura estabilizar.",
            "Opcional: enxagúe e mergulhe na solução tampão pH 10.00 para melhorar a linearidade na gama alcalina.",
        ],
        unit: "pH",
        fit: "segments",
    },
    // Turbidity probe voltage -> optical density of the culture, measured on a
    // spectrophotometer (e.g. OD750). As many samples as the operator wants; the
    // model (linear, logarithmic, polynomial) is chosen from the data.
    turbidity: {
        minPoints: 2,
        maxPoints: 30,
        defaultReferences: [0],
        instructions: [
            "Mergulhe o sensor em meio de cultura sem células (OD = 0) e aguarde a leitura estabilizar.",
            "Mergulhe o sensor numa amostra de cultura, aguarde a leitura estabilizar e introduza a OD medida no espectrofotómetro. Repita com várias densidades, cobrindo a gama que vai usar (mais pontos permitem escolher melhor o modelo).",
        ],
        unit: "OD",
        fit: "auto",
    },
};

export function isCalibratable(metricKey: string): boolean {
    return metricKey in REACTOR_CALIBRATION;
}
