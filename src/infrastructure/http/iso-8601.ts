import { registerDecorator, type ValidationOptions } from 'class-validator';

const ISO_8601 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

/** Fecha-hora ISO 8601 con zona horaria explicita y fecha de calendario real. */
export function esFechaIso8601(valor: unknown): valor is string {
  if (typeof valor !== 'string') return false;
  const match = ISO_8601.exec(valor);
  if (!match) return false;
  const [anio, mes, dia] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const calendario = new Date(Date.UTC(anio, mes - 1, dia));
  const fechaReal =
    calendario.getUTCFullYear() === anio &&
    calendario.getUTCMonth() === mes - 1 &&
    calendario.getUTCDate() === dia;
  return fechaReal && !Number.isNaN(Date.parse(valor));
}

export function IsIso8601DateTime(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: 'isIso8601DateTime',
      target: target.constructor,
      propertyName: propertyName as string,
      options: {
        message: `${String(propertyName)} debe ser una fecha ISO 8601 con zona horaria (ej. 2026-01-31T10:15:00Z)`,
        ...options,
      },
      validator: { validate: esFechaIso8601 },
    });
  };
}
