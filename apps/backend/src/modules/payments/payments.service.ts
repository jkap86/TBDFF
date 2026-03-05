import { PaymentRepository } from './payments.repository';
import { LeagueRepository } from '../leagues/leagues.repository';
import { LeaguePayment } from './payments.model';
import { SetPayoutsInput } from './payments.schemas';
import { SystemMessageService } from '../chat/system-message.service';
import {
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '../../shared/exceptions';

export class PaymentService {
  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly leagueRepository: LeagueRepository,
    private readonly systemMessages: SystemMessageService,
  ) {}

  async getPayments(leagueId: string, userId: string): Promise<LeaguePayment[]> {
    const member = await this.leagueRepository.findMember(leagueId, userId);
    if (!member) throw new ForbiddenException('You must be a member of this league');
    return this.paymentRepository.findByLeague(leagueId);
  }

  async setBuyIn(leagueId: string, userId: string, buyIn: number): Promise<void> {
    const member = await this.leagueRepository.findMember(leagueId, userId);
    if (!member || member.role !== 'commissioner') {
      throw new ForbiddenException('Only the league commissioner can set the buy-in');
    }

    const league = await this.leagueRepository.findById(leagueId);
    if (!league) throw new NotFoundException('League not found');

    const updatedSettings = { ...league.settings, buy_in: buyIn };
    await this.leagueRepository.update(leagueId, { settings: updatedSettings });
  }

  async recordBuyIn(
    leagueId: string,
    requestingUserId: string,
    targetUserId: string,
    amount: number,
  ): Promise<LeaguePayment> {
    const member = await this.leagueRepository.findMember(leagueId, requestingUserId);
    if (!member || member.role !== 'commissioner') {
      throw new ForbiddenException('Only the league commissioner can record payments');
    }

    const target = await this.leagueRepository.findMember(leagueId, targetUserId);
    if (!target) throw new NotFoundException('User is not a member of this league');

    try {
      const payment = await this.paymentRepository.create({
        leagueId,
        userId: targetUserId,
        type: 'buy_in',
        amount,
        recordedBy: requestingUserId,
      });

      try {
        await this.systemMessages.send(leagueId, `${target.username} was marked as paid`);
      } catch { /* non-fatal */ }

      // Auto-transition: not_filled → offseason when all dues paid
      try {
        const league = await this.leagueRepository.findById(leagueId);
        if (league && league.status === 'not_filled') {
          const rosters = await this.leagueRepository.findRostersByLeagueId(leagueId);
          const allPayments = await this.paymentRepository.findByLeague(leagueId);
          const buyInPayments = allPayments.filter((p) => p.type === 'buy_in');
          if (buyInPayments.length >= rosters.length) {
            await this.leagueRepository.update(leagueId, { status: 'offseason' });
            try {
              await this.systemMessages.send(leagueId, 'All dues paid — league moved to offseason');
            } catch { /* non-fatal */ }
          }
        }
      } catch { /* non-fatal */ }

      return payment;
    } catch (err: any) {
      if (err.code === '23505') {
        throw new ConflictException('This member has already been marked as paid');
      }
      throw err;
    }
  }

  async setPayouts(
    leagueId: string,
    userId: string,
    payouts: SetPayoutsInput['payouts'],
  ): Promise<void> {
    const member = await this.leagueRepository.findMember(leagueId, userId);
    if (!member || member.role !== 'commissioner') {
      throw new ForbiddenException('Only the league commissioner can set payouts');
    }

    const league = await this.leagueRepository.findById(leagueId);
    if (!league) throw new NotFoundException('League not found');

    const updatedSettings = { ...league.settings, payouts };
    await this.leagueRepository.update(leagueId, { settings: updatedSettings });
  }

  async removePayment(
    leagueId: string,
    requestingUserId: string,
    paymentId: string,
  ): Promise<void> {
    const member = await this.leagueRepository.findMember(leagueId, requestingUserId);
    if (!member || member.role !== 'commissioner') {
      throw new ForbiddenException('Only the league commissioner can manage payments');
    }

    const payment = await this.paymentRepository.findById(paymentId);
    if (!payment || payment.leagueId !== leagueId) {
      throw new NotFoundException('Payment record not found');
    }

    await this.paymentRepository.delete(paymentId);
  }
}
