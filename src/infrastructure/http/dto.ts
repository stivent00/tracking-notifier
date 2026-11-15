import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiProperty({
    format: 'uuid',
    description: 'Clave de idempotencia: repetirlo no duplica el evento ni la notificacion',
  })
  @Transform(minusculas)
  @IsUUID('all', { message: 'eventId debe ser un UUID' })
  eventId!: string;

  @ApiProperty({ enum: ESTADOS_GUIA })
  @IsIn(ESTADOS_GUIA, { message: `estado debe ser uno de: ${ESTADOS_GUIA.join(', ')}` })
  estado!: string;

  @ApiProperty({ example: '2026-01-15T14:00:00Z', description: 'ISO 8601 con zona horaria' })
  @IsIso8601DateTime()
  fechaEvento!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacion?: string;
}

export class ConfigurarWebhookDto {
  @ApiProperty({ example: 'https://cliente.example.com/hooks/tracking', maxLength: 2048 })
  @IsString()
  @MaxLength(2048)
  url!: string;
}

export class ListarNotificacionesQuery {
  @ApiPropertyOptional({ enum: ESTADOS_NOTIFICACION })
  @IsOptional()
  @IsIn(ESTADOS_NOTIFICACION, {
    message: `estado debe ser uno de: ${ESTADOS_NOTIFICACION.join(', ')}`,
  })
  estado?: string;

  @ApiPropertyOptional({ example: 'GUIA-1001' })
  @IsOptional()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/, { message: 'numeroGuia tiene un formato invalido' })
  numeroGuia?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limite: number = 20;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  desplazamiento: number = 0;
}
