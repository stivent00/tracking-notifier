export interface FieldError {
  field: string;
  message: string;
}

/** Cuerpo unico de error (RFC 7807, application/problem+json) para toda la API. */
export interface Problem {
  type: string;
  title: string;
  status: number;
  code: string;
  detail: string;
  errors?: FieldError[];
  requestId: string;
  instance: string;
}

export class ErrorDeValidacion extends Error {
  constructor(
    readonly errors: FieldError[],
    readonly code = 'VALIDACION_FALLIDA',
    message = 'La solicitud no es valida',
  ) {
    super(message);
    this.name = 'ErrorDeValidacion';
  }
}
