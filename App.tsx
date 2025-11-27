import React, { useState, useEffect } from 'react';
import { LockScreen } from './components/LockScreen';
import { ChatInterface } from './components/ChatInterface';
import { CryptoTools } from './components/CryptoTools';
import { Contacts } from './components/Contacts';
import { Settings } from './components/Settings';
import { MessageSquare, Shield, Settings as SettingsIcon, Users } from 'lucide-react';
import { AppView } from './types';
import { initPrivacyShield } from './services/privacyShield';

function App() {
  const [currentView, setCurrentView] = useState<AppView>(AppView.LOCK_SCREEN);
  const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null);

  // Initialize systems on mount
  useEffect(() => {
    // 1. Initialize Privacy Shield (WebRTC Blocker)
    initPrivacyShield();

    // 2. Initialize Telegram Web App if detected
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
      
      // Optional: Set header color to match app
      // window.Telegram.WebApp.setHeaderColor('#0a0a0a');
    }
  }, []);

  const handleUnlock = (key: CryptoKey) => {
    setCryptoKey(key);
    setCurrentView(AppView.CHAT);
  };

  const handleLock = () => {
    setCryptoKey(null);
    setCurrentView(AppView.LOCK_SCREEN);
  };

  // If locked, show lock screen
  if (currentView === AppView.LOCK_SCREEN || !cryptoKey) {
    return <LockScreen onUnlock={handleUnlock} />;
  }

  return (
    <div className="flex flex-col h-screen bg-black text-gray-200 overflow-hidden font-sans">
      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative">
        {currentView === AppView.CHAT && <ChatInterface cryptoKey={cryptoKey} />}
        {currentView === AppView.CONTACTS && <Contacts cryptoKey={cryptoKey} />}
        {currentView === AppView.TOOLS && <CryptoTools />}
        {currentView === AppView.SETTINGS && <Settings cryptoKey={cryptoKey} onLock={handleLock} />}
      </main>

      {/* Bottom Navigation Bar (Mobile First) */}
      <nav className="h-16 bg-surface border-t border-zinc-800 flex justify-around items-center px-2 pb-safe z-50">
        <NavButton 
          active={currentView === AppView.CHAT} 
          onClick={() => setCurrentView(AppView.CHAT)}
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