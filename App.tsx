import React, { useState, useEffect } from 'react';
import { LockScreen } from './components/LockScreen';
import { ChatInterface } from './components/ChatInterface';
import { CryptoTools } from './components/CryptoTools';
import { Contacts } from './components/Contacts';
import { Settings } from './components/Settings';
import { MessageSquare, Shield, Settings as SettingsIcon, Users, WifiOff } from 'lucide-react';
import { AppView, Contact } from './types';
import { initPrivacyShield } from './services/privacyShield';

function App() {
  const [currentView, setCurrentView] = useState<AppView>(AppView.LOCK_SCREEN);
  const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null);
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Initialize systems on mount
  useEffect(() => {
    // 1. Initialize Privacy Shield (WebRTC Blocker)
    initPrivacyShield();

    // 2. Initialize Telegram Web App if detected
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
    }

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleUnlock = (key: CryptoKey) => {
    setCryptoKey(key);
    setCurrentView(AppView.CHAT);
  };

  const handleLock = () => {
    setCryptoKey(null);
    setCurrentView(AppView.LOCK_SCREEN);
    setActiveContact(null);
  };

  const handleChatStart = (contact: Contact) => {
    setActiveContact(contact);
    setCurrentView(AppView.CHAT);
  };

  const handleGlobalChat = () => {
    setActiveContact(null);
    setCurrentView(AppView.CHAT);
  };

  // Connection Guard
  if (!isOnline && currentView !== AppView.LOCK_SCREEN && currentView !== AppView.SETTINGS) {
     return (
       <div className="flex flex-col items-center justify-center h-screen bg-black text-white p-6 text-center space-y-6">
         <div className="w-20 h-20 bg-red-900/20 rounded-full flex items-center justify-center animate-pulse">
           <WifiOff size={40} className="text-red-500" />
         </div>
         <div>
           <h1 className="text-2xl font-mono font-bold text-red-500">CONNECTION LOST</h1>
           <p className="text-zinc-500 mt-2 font-mono text-sm">Secure uplink required for operation.</p>
         </div>
         <div className="p-4 border border-red-900/30 rounded-lg bg-red-900/5 max-w-xs">
            <p className="text-xs text-red-300 font-mono">
              The application requires an active internet connection to maintain secure handshake protocols.
            </p>
         </div>
       </div>
     );
  }

  // If locked, show lock screen
  if (currentView === AppView.LOCK_SCREEN || !cryptoKey) {
    return <LockScreen onUnlock={handleUnlock} />;
  }

  return (
    <div className="flex flex-col h-screen bg-black text-gray-200 overflow-hidden font-sans">
      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative">
        {currentView === AppView.CHAT && <ChatInterface cryptoKey={cryptoKey} activeContact={activeContact} />}
        {currentView === AppView.CONTACTS && <Contacts cryptoKey={cryptoKey} onChatStart={handleChatStart} />}
        {currentView === AppView.TOOLS && <CryptoTools />}
        {currentView === AppView.SETTINGS && <Settings cryptoKey={cryptoKey} onLock={handleLock} />}
      </main>

      {/* Bottom Navigation Bar (Mobile First) */}
      <nav className="h-16 bg-surface border-t border-zinc-800 flex justify-around items-center px-2 pb-safe z-50">
        <NavButton 
          active={currentView === AppView.CHAT} 
          onClick={handleGlobalChat}
          icon={<MessageSquare size={20} />}
          label="Chat"
        />
        <NavButton 
          active={currentView === AppView.CONTACTS} 
          onClick={() => setCurrentView(AppView.CONTACTS)}
          icon={<Users size={20} />}
          label="Contacts"
        />
        <NavButton 
          active={currentView === AppView.TOOLS} 
          onClick={() => setCurrentView(AppView.TOOLS)}
          icon={<Shield size={20} />}
          label="Tools"
        />
        <NavButton 
          active={currentView === AppView.SETTINGS} 
          onClick={() => setCurrentView(AppView.SETTINGS)}
          icon={<SettingsIcon size={20} />}
          label="Settings"
        />
      </nav>
    </div>
  );
}

const NavButton: React.FC<{
  active: boolean; 
  onClick: () => void; 
  icon: React.ReactNode;
  label: string;
}> = ({ active, onClick, icon, label }) => (
  <button 
    onClick={onClick}
    className={`
      flex flex-col items-center justify-center w-full h-full gap-1 transition-all duration-300
      ${active ? 'text-primary' : 'text-zinc-600 hover:text-zinc-400'}
    `}
  >
    <div className={`
      p-1.5 rounded-xl transition-all
      ${active ? 'bg-primary/10 translate-y-[-2px]' : ''}
    `}>
      {icon}
    </div>
    <span className="text-[10px] font-mono font-medium tracking-wide">{label}</span>
  </button>
);

export default App;