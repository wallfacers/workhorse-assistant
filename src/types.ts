import type { ReactNode } from 'react';

export interface User {
  name: string;
  avatarUrl?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  content: ReactNode;
  timestamp: string;
}
