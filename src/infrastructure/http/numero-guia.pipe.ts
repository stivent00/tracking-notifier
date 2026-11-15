import { Injectable, type PipeTransform } from '@nestjs/common';
import { ErrorDeValidacion } from './problem';
import { IDENTIFICADOR_SEGURO } from './tenant.decorator';

@Injectable()
export class NumeroGuiaPipe implements PipeTransform<string, string> {
  transform(valor: string): string {
    if (!IDENTIFICADOR_SEGURO.test(valor)) {
      throw new ErrorDeValidacion([
        { field: 'numeroGuia', message: 'Debe tener 1 a 64 caracteres [A-Za-z0-9_-]' },
      ]);
    }
    return valor;
  }
}
