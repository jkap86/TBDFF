import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import { PlayerService } from './players.service';
import { InvalidCredentialsException } from '../../shared/exceptions';

export class PlayerController {
  constructor(private readonly playerService: PlayerService) {}

  getAll = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const limit = parseInt(req.query.limit as string) || 1000;
    const offset = parseInt(req.query.offset as string) || 0;

    const players = await this.playerService.getAllPlayers(limit, offset);
    res.status(200).json({ players: players.map(p => p.toSafeObject()) });
  };

  getById = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const playerId = Array.isArray(req.params.playerId) ? req.params.playerId[0] : req.params.playerId;
    const player = await this.playerService.getPlayerById(playerId);
    res.status(200).json({ player: player.toSafeObject() });
  };

  search = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const query = req.query.q as string;
    const limit = parseInt(req.query.limit as string) || 50;

    const players = await this.playerService.searchPlayers(query, limit);
    res.status(200).json({ players: players.map(p => p.toSafeObject()) });
  };

  getByPosition = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const position = Array.isArray(req.params.position) ? req.params.position[0] : req.params.position;
    const players = await this.playerService.getPlayersByPosition(position);
    res.status(200).json({ players: players.map(p => p.toSafeObject()) });
  };

  getByTeam = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const team = Array.isArray(req.params.team) ? req.params.team[0] : req.params.team;
    const players = await this.playerService.getPlayersByTeam(team);
    res.status(200).json({ players: players.map(p => p.toSafeObject()) });
  };
}
