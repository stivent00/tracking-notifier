import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { ErrorDeValidacion } from './problem';

export const TENANT_HEADER = 'x-tenant-id';
export const IDENTIFICADOR_SEGURO = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * El tenant llega en X-Tenant-Id, ya validado por el API Gateway; aqui solo se verifica
 * su forma para no propagar valores arbitrarios a la base de datos ni a los logs.
 */
export const Tenant = createParamDecorator((_data: unknown, context: ExecutionContext): string => {
  const req = context.switchToHttp().getRequest<Request>();
  const valor = req.header(TENANT_HEADER);
  if (!valor || !IDENTIFICADOR_SEGURO.test(valor)) {
    throw new ErrorDeValidacion(
      [{ field: 'X-Tenant-Id', message: 'Cabecera obligatoria: 1 a 64 caracteres [A-Za-z0-9_-]' }],
      'TENANT_ID_INVALIDO',
      'La cabecera X-Tenant-Id es obligatoria y debe tener un formato valido',
    );
  }
  return valor;
});
