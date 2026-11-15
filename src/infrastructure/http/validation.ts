import { ValidationPipe, type ValidationError } from '@nestjs/common';
import { ErrorDeValidacion, type FieldError } from './problem';

function aplanar(errores: ValidationError[], prefijo = ''): FieldError[] {
  return errores.flatMap((error) => {
    const campo = prefijo ? `${prefijo}.${error.property}` : error.property;
    const propios = Object.values(error.constraints ?? {}).map((message) => ({
      field: campo,
      message,
    }));
    return [...propios, ...aplanar(error.children ?? [], campo)];
  });
}

export function crearValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errores) => new ErrorDeValidacion(aplanar(errores)),
  });
}
