import { Pool } from 'pg';
import { PaymentRepository } from './payments.repository';
import { PaymentService } from './payments.service';
import { PaymentController } from './payments.controller';
import { LeagueRepository } from '../leagues/leagues.repository';
import { LeagueMembersRepository } from '../leagues/league-members.repository';
import { LeagueRostersRepository } from '../leagues/league-rosters.repository';
import { SystemMessageService } from '../chat/system-message.service';

interface PaymentsModuleDeps {
  pool: Pool;
  leagueRepository: LeagueRepository;
  leagueMembersRepository: LeagueMembersRepository;
  leagueRostersRepository: LeagueRostersRepository;
  systemMessageService: SystemMessageService;
}

export function registerPaymentsModule(deps: PaymentsModuleDeps) {
  const paymentRepository = new PaymentRepository(deps.pool);
  const paymentService = new PaymentService(
    paymentRepository,
    deps.leagueRepository,
    deps.leagueMembersRepository,
    deps.leagueRostersRepository,
    deps.systemMessageService,
  );
  const paymentController = new PaymentController(paymentService);

  return { paymentController };
}
