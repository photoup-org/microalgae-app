/**
 * Defaults shared between server and client code.
 *
 * Separate from lib/experiment-commands.ts because that file is "server-only" —
 * it publishes MQTT — and ReactorChart is a Client Component. Importing the
 * constant from there pulled the server-only marker into the client bundle and
 * failed the build outright.
 */

/**
 * Storage frequency assumed when an experiment has not set one, and the fallback
 * the chart uses to size a data gap on the standalone device page, which has no
 * experiment to read it from.
 */
export const DEFAULT_DB_INTERVAL_SECONDS = 60;

/**
 * Points a chart draws, however long the run has been going - only the most
 * recent ones are plotted.
 *
 * Chosen so every point can carry a visible dot: at typical chart widths this
 * leaves a few pixels between markers, where a full multi-day series would pack
 * them into an unreadable band. Shared by ReactorChart and CarbonateChart, which
 * sit one above the other on the experiment page describing the same run - two
 * different recency windows there would invite reading one against the other.
 *
 * A view limit, not a retention one: the whole run stays in InfluxDB and in the
 * CSV export.
 */
export const MAX_CHART_POINTS = 200;
