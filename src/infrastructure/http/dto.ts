import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ESTADOS_GUIA } from '../../domain/estado-guia';
import { ESTADOS_NOTIFICACION } from '../../domain/notificacion';
import { IsIso8601DateTime } from './iso-8601';

const minusculas = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.toLowerCase() : value;

export class RegistrarEventoDto {
  @Transform(minusculas)
  @IsUUID('all', { message: 'eventId debe ser un UUID' })
  eventId!: string;

  @IsIn(ESTADOS_GUIA, { message: `estado debe ser uno de: ${ESTADOS_GUIA.join(', ')}` })
  estado!: string;

  @IsIso8601DateTime()
  fechaEvento!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacion?: string;
}

export class ConfigurarWebhookDto {
  @IsString()
  @MaxLength(2048)
  url!: string;
}

export class ListarNotificacionesQuery {
  @IsOptional()
  @IsIn(ESTADOS_NOTIFICACION, {
    message: `estado debe ser uno de: ${ESTADOS_NOTIFICACION.join(', ')}`,
  })
  estado?: string;

  @IsOptional()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/, { message: 'numeroGuia tiene un formato invalido' })
  numeroGuia?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limite: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  desplazamiento: number = 0;
}
