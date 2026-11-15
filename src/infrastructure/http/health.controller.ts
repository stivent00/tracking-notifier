import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../persistence/database.service';

@Controller('health')
export class HealthController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Get()
  async health(): Promise<{ status: 'ok' }> {
    try {
      await this.database.ping();
    } catch {
      throw new ServiceUnavailableException();
    }
    return { status: 'ok' };
  }
}
