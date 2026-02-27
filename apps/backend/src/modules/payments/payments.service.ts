import { PaymentRepository } from './payments.repository';
import { LeagueRepository } from '../leagues/leagues.repository';
import { LeaguePayment } from './payments.model';
import {
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '../../shared/exceptions';

export class PaymentService {
  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly leagueRepository: LeagueRepository,
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
      return await this.paymentRepository.create({
        leagueId,
        userId: targetUserId,
        type: 'buy_in',
        amount,
        recordedBy: requestingUserId,
      });
    } catch (err: any) {
      if (err.code === '23505') {
        throw new ConflictException('This member has already been marked as paid');
      }
      throw err;
    }
  }

  async recordPayout(
    leagueId: string,
    requestingUserId: string,
    targetUserId: string,
    amount: number,
    note?: string,
  ): Promise<LeaguePayment> {
    const member = await this.leagueRepository.findMember(leagueId, requestingUserId);
    if (!member || member.role !== 'commissioner') {
      throw new ForbiddenException('Only the league commissioner can record payouts');
    }

    const target = await this.leagueRepository.findMember(leagueId, targetUserId);
    if (!target) throw new NotFoundException('User is not a member of this league');

    return this.paymentRepository.create({
      leagueId,
      userId: targetUserId,
      type: 'payout',
      amount,
      note,
      recordedBy: requestingUserId,
    });
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
