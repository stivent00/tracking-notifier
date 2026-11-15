import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { ErrorDeDominio } from '../../domain/errores';
import { ErrorDeValidacion, type Problem } from './problem';

const STATUS_POR_CODIGO_DE_DOMINIO: Record<string, number> = {
  GUIA_NO_ENCONTRADA: 404,
  WEBHOOK_NO_CONFIGURADO: 404,
  TRANSICION_INVALIDA: 409,
  EVENTO_FUERA_DE_ORDEN: 409,
  EVENT_ID_EN_CONFLICTO: 409,
  URL_WEBHOOK_INVALIDA: 400,
};

const TITULOS: Record<number, string> = {
  400: 'Solicitud invalida',
  404: 'No encontrado',
  405: 'Metodo no permitido',
  409: 'Conflicto',
  413: 'Cuerpo demasiado grande',
  415: 'Tipo de contenido no soportado',
  500: 'Error interno',
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request & { id?: string }>();
    const res = http.getResponse<Response>();

    const base = this.describir(exception);
    const problem: Problem = {
      type: `urn:tracking-notifier:error:${base.code}`,
      title: TITULOS[base.status] ?? 'Error',
      status: base.status,
      code: base.code,
      detail: base.detail,
      ...(base.errors ? { errors: base.errors } : {}),
      requestId: String(req.id ?? ''),
      instance: req.path,
    };

    if (base.status >= 500) {
      const error = exception instanceof Error ? exception : undefined;
      this.logger.error({ errorName: error?.name, stack: error?.stack }, 'Unhandled error');
    }
    res.status(base.status).type('application/problem+json').json(problem);
  }

  private describir(exception: unknown): Pick<Problem, 'status' | 'code' | 'detail' | 'errors'> {
    if (exception instanceof ErrorDeDominio) {
      return {
        status: STATUS_POR_CODIGO_DE_DOMINIO[exception.codigo] ?? 422,
        code: exception.codigo,
        detail: exception.message,
      };
    }
    if (exception instanceof ErrorDeValidacion) {
      return {
        status: 400,
        code: exception.code,
        detail: exception.message,
        errors: exception.errors,
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      // Nest convierte los errores del parser de body (JSON malformado, cuerpo enorme) en
      // HttpException sin conservar su tipo; la aplicacion no lanza otras de 400 ni 413.
      if (status === 400) {
        return { status, code: 'JSON_INVALIDO', detail: 'El cuerpo no es JSON valido' };
      }
      if (status === 413) {
        return { status, code: 'CUERPO_DEMASIADO_GRANDE', detail: 'El cuerpo excede el limite' };
      }
      return {
        status,
        code: status === 404 ? 'RUTA_NO_ENCONTRADA' : `HTTP_${status}`,
        detail: status === 404 ? 'La ruta solicitada no existe' : (TITULOS[status] ?? 'Error'),
      };
    }
    return { status: 500, code: 'ERROR_INTERNO', detail: 'Ocurrio un error inesperado' };
  }
}
