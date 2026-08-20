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
    },
    turbidity: {
        minPoints: 1,
        maxPoints: 2,
        defaultReferences: [0, 100],
        instructions: [
            "Mergulhe o sensor em água limpa (0 NTU) e aguarde a leitura estabilizar.",
            "Opcional: mergulhe num padrão de formazina de valor conhecido para definir a inclinação.",
        ],
        unit: "NTU",
    },
};

export function isCalibratable(metricKey: string): boolean {
    return metricKey in REACTOR_CALIBRATION;
}
