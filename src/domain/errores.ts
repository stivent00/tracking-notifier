export abstract class ErrorDeDominio extends Error {
  abstract readonly codigo: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class TransicionInvalidaError extends ErrorDeDominio {
  readonly codigo = 'TRANSICION_INVALIDA';

  constructor(
    readonly desde: string | null,
    readonly hacia: string,
  ) {
    super(
      desde === null
        ? `La primera transicion de una guia debe ser a CREADA, no a ${hacia}`
        : `Transicion invalida de ${desde} a ${hacia}`,
    );
  }
}

export class EventoFueraDeOrdenError extends ErrorDeDominio {
  readonly codigo = 'EVENTO_FUERA_DE_ORDEN';

  constructor(
    readonly fechaEvento: Date,
    readonly ultimaFechaEvento: Date,
  ) {
    super('fechaEvento es anterior al ultimo evento aceptado de la guia');
  }
}

export class GuiaNoEncontradaError extends ErrorDeDominio {
  readonly codigo = 'GUIA_NO_ENCONTRADA';

  constructor(readonly numeroGuia: string) {
    super(`Guia ${numeroGuia} no encontrada`);
  }
}

export class EventIdConflictoError extends ErrorDeDominio {
  readonly codigo = 'EVENT_ID_EN_CONFLICTO';

  constructor(readonly eventId: string) {
    super('El eventId ya fue usado con un contenido distinto');
  }
}

export class UrlWebhookInvalidaError extends ErrorDeDominio {
  readonly codigo = 'URL_WEBHOOK_INVALIDA';

  constructor(motivo: string) {
    super(motivo);
  }
}

export class WebhookNoConfiguradoError extends ErrorDeDominio {
  readonly codigo = 'WEBHOOK_NO_CONFIGURADO';

  constructor() {
    super('El tenant no tiene un webhook configurado');
  }
}
