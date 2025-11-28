export interface Message {
  id: string;
  role: 'user' | 'model' | 'system';
  content: string; // Text content or description
  type?: 'text' | 'audio'; // Message type
  mediaData?: string; // Base64 audio data
  timestamp: number;
  encrypted?: boolean; // Flag to indicate if we need to decrypt it locally
  expiresAt?: number; // Timestamp when message should be auto-deleted
  conversationId?: string; // 'global' or contact.id
}

export interface StoredMessage {
  id: string;
  role: 'user' | 'model' | 'system';
  ciphertext: string; // Base64
  iv: string; // Base64
  salt: string; // Base64
  timestamp: number;
  type?: 'text' | 'audio';
  ciphertextMedia?: string; // Base64 encrypted media
  ivMedia?: string; // Base64
  expiresAt?: number;
  conversationId?: string;
}

export interface Contact {
  id: string;
  name: string;
  note: string;
}

export interface StoredContact {
  id: string;
  ciphertextName: string; // Base64
  ivName: string; // Base64
  ciphertextNote: string; // Base64
  ivNote: string; // Base64
}

export interface UserProfile {
  id: string;
  nickname: string;
  bio?: string; // Public bio / Persona context for Digital Twin
}

export interface StoredUserProfile {
  id: string;
  ciphertextNickname: string; // Base64
  ivNickname: string; // Base64
  ciphertextBio?: string; // Base64
  ivBio?: string; // Base64
}

export enum AppView {
  LOCK_SCREEN = 'LOCK_SCREEN',
  CHAT = 'CHAT',
  CONTACTS = 'CONTACTS',
  TOOLS = 'TOOLS',
  SETTINGS = 'SETTINGS'
}

export interface CryptoState {
  key: CryptoKey | null;
  salt: Uint8Array | null; // The master salt used for the session
  isUnlocked: boolean;
}

// Telegram Web App Global Types
declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        ready: () => void;
        expand: () => void;
        close: () => void;
        MainButton: {
          text: string;
          color: string;
          textColor: string;
          isVisible: boolean;
          isActive: boolean;
          show: () => void;
          hide: () => void;
          onClick: (callback: () => void) => void;
        };
        initDataUnsafe: any;
        colorScheme: 'light' | 'dark';
        themeParams: any;
        isExpanded: boolean;
        viewportHeight: number;
        viewportStableHeight: number;
      };
    };
  }
}