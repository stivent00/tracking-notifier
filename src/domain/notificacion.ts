import type { PoliticaReintentos } from './politica-reintentos';

export const ESTADOS_NOTIFICACION = ['PENDIENTE', 'ENVIADA', 'FALLIDA'] as const;
export type EstadoNotificacion = (typeof ESTADOS_NOTIFICACION)[number];

export function esEstadoNotificacion(valor: unknown): valor is EstadoNotificacion {
  return typeof valor === 'string' && (ESTADOS_NOTIFICACION as readonly string[]).includes(valor);
}

export interface NotificacionProps {
  id: string;
  tenantId: string;
  eventId: string;
  estado: EstadoNotificacion;
  intentos: number;
  proximoIntentoEn: Date;
  ultimoError: string | null;
  ultimoStatus: number | null;
  creadaEn: Date;
  enviadaEn: Date | null;
}

export class Notificacion {
  private constructor(private props: NotificacionProps) {}

  static crear(
    datos: { id: string; tenantId: string; eventId: string },
    ahora: Date,
  ): Notificacion {
    return new Notificacion({
      ...datos,
      estado: 'PENDIENTE',
      intentos: 0,
      proximoIntentoEn: ahora,
      ultimoError: null,
      ultimoStatus: null,
      creadaEn: ahora,
      enviadaEn: null,
    });
  }

  static reconstruir(props: NotificacionProps): Notificacion {
    return new Notificacion({ ...props });
  }

  get id(): string {
    return this.props.id;
  }
  get tenantId(): string {
    return this.props.tenantId;
  }
  get eventId(): string {
    return this.props.eventId;
  }
  get estado(): EstadoNotificacion {
    return this.props.estado;
  }
  get intentos(): number {
    return this.props.intentos;
  }
  get proximoIntentoEn(): Date {
    return this.props.proximoIntentoEn;
  }
  get ultimoError(): string | null {
    return this.props.ultimoError;
  }
  get ultimoStatus(): number | null {
    return this.props.ultimoStatus;
  }
  get creadaEn(): Date {
    return this.props.creadaEn;
  }
  get enviadaEn(): Date | null {
    return this.props.enviadaEn;
  }

  snapshot(): NotificacionProps {
    return { ...this.props };
  }

  registrarExito(ahora: Date, status: number): void {
    this.exigirPendiente();
    this.props.intentos += 1;
    this.props.estado = 'ENVIADA';
    this.props.enviadaEn = ahora;
    this.props.ultimoStatus = status;
    this.props.ultimoError = null;
  }

  /** Cuenta el intento y decide entre reprogramar con espera creciente o marcar FALLIDA. */
  registrarFallo(
    ahora: Date,
    motivo: { error: string; status: number | null },
    politica: PoliticaReintentos,
  ): void {
    this.exigirPendiente();
    this.props.intentos += 1;
    this.props.ultimoError = motivo.error;
    this.props.ultimoStatus = motivo.status;
    if (politica.agotada(this.props.intentos)) {
      this.props.estado = 'FALLIDA';
      return;
    }
    this.props.proximoIntentoEn = new Date(
      ahora.getTime() + politica.esperaMs(this.props.intentos),
    );
  }

  private exigirPendiente(): void {
    if (this.props.estado !== 'PENDIENTE') {
      throw new Error(
        `La notificacion ${this.props.id} ya esta en estado final ${this.props.estado}`,
      );
    }
  }
}
