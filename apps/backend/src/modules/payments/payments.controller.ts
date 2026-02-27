import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import { PaymentService } from './payments.service';
import { InvalidCredentialsException } from '../../shared/exceptions';
import { RecordBuyInInput, SetBuyInInput, SetPayoutsInput } from './payments.schemas';

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  getPayments = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const payments = await this.paymentService.getPayments(
      param(req.params.leagueId), userId,
    );
    res.status(200).json({ payments: payments.map((p) => p.toSafeObject()) });
  };

  setBuyIn = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const body = req.body as SetBuyInInput;
    await this.paymentService.setBuyIn(
      param(req.params.leagueId), userId, body.buy_in,
    );
    res.status(200).json({ message: 'Buy-in amount updated' });
  };

  recordBuyIn = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const body = req.body as RecordBuyInInput;
    const payment = await this.paymentService.recordBuyIn(
      param(req.params.leagueId), userId, body.user_id, body.amount,
    );
    res.status(201).json({ payment: payment.toSafeObject() });
  };

  setPayouts = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const body = req.body as SetPayoutsInput;
    await this.paymentService.setPayouts(
      param(req.params.leagueId), userId, body.payouts,
    );
    res.status(200).json({ message: 'Payout structure updated' });
  };

  removePayment = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    await this.paymentService.removePayment(
      param(req.params.leagueId), userId, param(req.params.paymentId),
    );
    res.status(200).json({ message: 'Payment record removed' });
  };
}
