import { Pool } from 'pg';
import { ChatRepository } from './chat.repository';
import { ChatService } from './chat.service';
import { SystemMessageService } from './system-message.service';
import { ChatController } from './chat.controller';

interface ChatModuleDeps {
  pool: Pool;
}

export function registerChatModule(deps: ChatModuleDeps) {
  const chatRepository = new ChatRepository(deps.pool);
  const chatService = new ChatService(chatRepository);
  const systemMessageService = new SystemMessageService(chatRepository);
  const chatController = new ChatController(chatService);

  return { chatService, systemMessageService, chatController };
}
