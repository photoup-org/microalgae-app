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
