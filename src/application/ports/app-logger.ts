/** Logs estructurados: los campos deben ser metadatos operativos, nunca datos personales. */
export interface AppLogger {
  info(mensaje: string, campos?: Record<string, unknown>): void;
  warn(mensaje: string, campos?: Record<string, unknown>): void;
  error(mensaje: string, campos?: Record<string, unknown>): void;
}
