/**
 * Multi-point calibration with automatic model choice.
 *
 * Used for turbidity -> optical density (OD): the probe's output voltage falls as
 * the culture gets denser, and whether that is close to linear, curved, or
 * logarithmic (Beer-Lambert: absorbance ~ -ln(transmitted light)) depends on the
 * probe, the cell size and the OD range. Rather than guess, every candidate model
 * is fitted by least squares and the one with the lowest AICc wins - the small-
 * sample corrected Akaike criterion, which only lets a model with more terms win
 * if it reduces the error by more than its extra freedom would on its own.
 *
 * Candidates and the points they need (k parameters, n >= k + 2 so AICc and the
 * residual error are defined; with fewer points a model would fit exactly):
 *   linear     OD = c0 + c1 V                 k=2, n>=4 (always offered from n>=2)
 *   log        OD = c0 + c1 ln V              k=2, n>=4, V > 0
 *   quadratic  OD = c0 + c1 V + c2 V^2        k=3, n>=5
 *   cubic      OD = c0 + c1 V + c2 V^2 + c3 V^3  k=4, n>=6
 * Curved models must also be monotonic across the calibrated voltage range - a
 * fit whose OD turns back on itself would map one reading to two densities.
 * With 2-3 points only the linear model is possible and is used as is.
 *
 * The edge worker evaluates the stored result (device_buffer.apply_calibration),
 * so the config shape here is a contract with
 * edge-gateway-docker/python-worker/src/core/device_buffer.py.
 */

export type ModelKind = "linear" | "log" | "quadratic" | "cubic";

export interface CalPoint {
    raw: number;
    reference: number;
}

/** Stored in Device.calibrationConfig[metric]; evaluated on the edge. */
export interface ModelCalibration {
    model: "poly" | "log";
    /** poly: c0 + c1 x + c2 x^2 ...; log: c0 + c1 ln(x). */
    coefficients: number[];
    /** For display and auditing only. */
    kind: ModelKind;
    r2: number;
    rmse: number;
    n: number;
    rawRange: [number, number];
}

export interface FitResult {
    kind: ModelKind;
    coefficients: number[];
    r2: number;
    rmse: number;
    aicc: number | null;
    /** Why a candidate was not eligible, if it was not. */
    rejected?: string;
}

const PARAMS: Record<ModelKind, number> = { linear: 2, log: 2, quadratic: 3, cubic: 4 };

/** Solves A x = b by Gaussian elimination with partial pivoting. Null if singular. */
function solve(A: number[][], b: number[]): number[] | null {
    const n = b.length;
    const M = A.map((row, i) => [...row, b[i]]);
    for (let col = 0; col < n; col++) {
        let pivot = col;
        for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
        if (Math.abs(M[pivot][col]) < 1e-12) return null;
        [M[col], M[pivot]] = [M[pivot], M[col]];
        for (let r = 0; r < n; r++) {
            if (r === col) continue;
            const f = M[r][col] / M[col][col];
            for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
        }
    }
    return M.map((row, i) => row[n] / row[i]);
}

/** Least-squares polynomial of the given degree in x. */
function polyFit(x: number[], y: number[], degree: number): number[] | null {
    const k = degree + 1;
    const A: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
    const b: number[] = new Array(k).fill(0);
    for (let i = 0; i < x.length; i++) {
        const powers = Array.from({ length: k }, (_, p) => x[i] ** p);
        for (let r = 0; r < k; r++) {
            b[r] += powers[r] * y[i];
            for (let c = 0; c < k; c++) A[r][c] += powers[r] * powers[c];
        }
    }
    return solve(A, b);
}

export function evaluate(cal: Pick<ModelCalibration, "model" | "coefficients">, raw: number): number | null {
    if (cal.model === "log") {
        if (raw <= 0) return null;
        return cal.coefficients[0] + cal.coefficients[1] * Math.log(raw);
    }
    return cal.coefficients.reduce((sum, c, p) => sum + c * raw ** p, 0);
}

function stats(points: CalPoint[], predict: (x: number) => number | null, k: number) {
    const n = points.length;
    const mean = points.reduce((s, p) => s + p.reference, 0) / n;
    let rss = 0;
    let tss = 0;
    for (const p of points) {
        const yhat = predict(p.raw);
        if (yhat === null || !Number.isFinite(yhat)) return null;
        rss += (p.reference - yhat) ** 2;
        tss += (p.reference - mean) ** 2;
    }
    const r2 = tss > 0 ? 1 - rss / tss : 1;
    const rmse = Math.sqrt(rss / n);
    const dof = n - k - 1;
    // Floor the error so a near-perfect fit cannot drive ln(RSS) to -infinity.
    const aicc = dof > 0 ? n * Math.log(Math.max(rss, 1e-12) / n) + 2 * k + (2 * k * (k + 1)) / dof : null;
    return { r2, rmse, aicc };
}

/** True if the model's output moves one way only across [lo, hi]. */
function monotonic(cal: Pick<ModelCalibration, "model" | "coefficients">, lo: number, hi: number): boolean {
    const steps = 50;
    let sign = 0;
    let previous = evaluate(cal, lo);
    for (let i = 1; i <= steps; i++) {
        const value = evaluate(cal, lo + ((hi - lo) * i) / steps);
        if (value === null || previous === null) return false;
        const d = Math.sign(value - previous);
        if (d !== 0) {
            if (sign !== 0 && d !== sign) return false;
            sign = d;
        }
        previous = value;
    }
    return true;
}

/** Fits every candidate; the caller picks with `chooseModel`. */
export function fitCandidates(points: CalPoint[]): FitResult[] {
    const n = points.length;
    const x = points.map((p) => p.raw);
    const y = points.map((p) => p.reference);
    const lo = Math.min(...x);
    const hi = Math.max(...x);
    const results: FitResult[] = [];

    const kinds: ModelKind[] = ["linear", "log", "quadratic", "cubic"];
    for (const kind of kinds) {
        const k = PARAMS[kind];
        const base: FitResult = { kind, coefficients: [], r2: NaN, rmse: NaN, aicc: null };
        if (kind !== "linear" && n < k + 2) {
            results.push({ ...base, rejected: `precisa de ${k + 2} pontos` });
            continue;
        }
        if (kind === "log" && lo <= 0) {
            results.push({ ...base, rejected: "leituras ≤ 0 V" });
            continue;
        }

        const coefficients =
            kind === "log"
                ? polyFit(x.map(Math.log), y, 1)
                : polyFit(x, y, kind === "linear" ? 1 : kind === "quadratic" ? 2 : 3);
        if (!coefficients) {
            results.push({ ...base, rejected: "pontos insuficientemente distintos" });
            continue;
        }
        const cal = { model: kind === "log" ? ("log" as const) : ("poly" as const), coefficients };
        const s = stats(points, (v) => evaluate(cal, v), k);
        if (!s) {
            results.push({ ...base, rejected: "ajuste inválido" });
            continue;
        }
        if (kind !== "linear" && !monotonic(cal, lo, hi)) {
            results.push({ ...base, coefficients, ...s, rejected: "não monotónico na gama calibrada" });
            continue;
        }
        results.push({ kind, coefficients, ...s });
    }
    return results;
}

/** Lowest AICc among eligible models; linear when no model has an AICc (n <= 3). */
export function chooseModel(results: FitResult[]): FitResult | null {
    const eligible = results.filter((r) => !r.rejected && r.coefficients.length > 0);
    if (eligible.length === 0) return null;
    const scored = eligible.filter((r) => r.aicc !== null);
    if (scored.length === 0) return eligible.find((r) => r.kind === "linear") ?? eligible[0];
    return scored.reduce((best, r) => ((r.aicc as number) < (best.aicc as number) ? r : best));
}

export function buildModelCalibration(points: CalPoint[]):
    | { ok: true; config: ModelCalibration; candidates: FitResult[] }
    | { ok: false; error: string } {
    if (points.length < 2) return { ok: false, error: "São precisos pelo menos 2 pontos." };
    const xs = points.map((p) => p.raw);
    if (new Set(xs.map((v) => v.toFixed(4))).size < 2) {
        return { ok: false, error: "Todas as leituras são iguais. Verifique se a sonda estabilizou entre capturas." };
    }
    const candidates = fitCandidates(points);
    const best = chooseModel(candidates);
    if (!best) return { ok: false, error: "Nenhum modelo se ajusta a estes pontos." };
    return {
        ok: true,
        candidates,
        config: {
            model: best.kind === "log" ? "log" : "poly",
            coefficients: best.coefficients,
            kind: best.kind,
            r2: best.r2,
            rmse: best.rmse,
            n: points.length,
            rawRange: [Math.min(...xs), Math.max(...xs)],
        },
    };
}

export const MODEL_LABELS: Record<ModelKind, string> = {
    linear: "Linear",
    log: "Logarítmico (Beer-Lambert)",
    quadratic: "Quadrático",
    cubic: "Cúbico",
};
