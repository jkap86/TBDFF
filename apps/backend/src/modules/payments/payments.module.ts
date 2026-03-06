import { Pool } from 'pg';
import { PaymentRepository } from './payments.repository';
import { PaymentService } from './payments.service';
import { PaymentController } from './payments.controller';
import { LeagueRepository } from '../leagues/leagues.repository';
import { SystemMessageService } from '../chat/system-message.service';

interface PaymentsModuleDeps {
  pool: Pool;
  leagueRepository: LeagueRepository;
  systemMessageService: SystemMessageService;
}

export function registerPaymentsModule(deps: PaymentsModuleDeps) {
  const paymentRepository = new PaymentRepository(deps.pool);
  const paymentService = new PaymentService(
    paymentRepository,
    deps.leagueRepository,
    deps.systemMessageService,
  );
  const paymentController = new PaymentController(paymentService);

  return { paymentController };
}
