import { Pool } from 'pg';
import { UserRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { EmailService } from '../../shared/email';

interface AuthModuleDeps {
  pool: Pool;
  emailService: EmailService;
}

export function registerAuthModule(deps: AuthModuleDeps) {
  const userRepository = new UserRepository(deps.pool);
  const authService = new AuthService(userRepository, deps.emailService);
  const authController = new AuthController(authService);

  return { authController };
}
