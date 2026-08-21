import { LogLevel } from "@prisma/client";

export const ALL_LEVELS: LogLevel[] = [LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR, LogLevel.CRITICAL];
export const LEVEL_LABEL: Record<LogLevel, string> = { INFO: "Info", WARN: "Aviso", ERROR: "Erro", CRITICAL: "Crítico" };
