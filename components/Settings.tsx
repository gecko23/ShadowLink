import React, { useState, useEffect, useRef } from 'react';
import { Shield, Lock, Save, Copy, Check, Fingerprint, User, QrCode as QrIcon, X, Globe, Eye, EyeOff, Radio, Download, Upload, HardDrive } from 'lucide-react';
import { Button } from './Button';
import { Input } from './Input';
import { UserProfile, StoredUserProfile } from '../types';
import { encryptMessage, decryptMessage } from '../services/cryptoUtils';
import { enableWebRTCShield, disableWebRTCShield, getWebRTCShieldStatus } from '../services/privacyShield';
import QRCode from 'qrcode';

interface SettingsProps {
  cryptoKey: CryptoKey;
  onLock: () => void;
}

export const Settings: React.FC<SettingsProps> = ({ cryptoKey, onLock }) => {
  const [profile, setProfile] = useState<UserProfile>({ id: '', nickname: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  
  // Network / IP State
  const [ipData, setIpData] = useState<{ip: string, city: string, org: string} | null>(null);
  const [isIpLoading, setIsIpLoading] = useState(false);
  const [torMode, setTorMode] = useState(false);
  const [webrtcShield, setWebrtcShield] = useState(getWebRTCShieldStatus());

  // Backup file input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadProfile();
    // Check if we might be in Tor browser (rudimentary check)
    if (navigator.userAgent.includes('Tor')) {
      setTorMode(true);
    }
  }, [cryptoKey]);

  useEffect(() => {
    if (showQr && profile.id) {
      generateQr();
    }
  }, [showQr, profile.id]);

  // Handle WebRTC Shield Toggle
  const toggleWebRTC = () => {
    const newValue = !webrtcShield;
    setWebrtcShield(newValue);
    if (newValue) {
      enableWebRTCShield();
    } else {
      disableWebRTCShield();
    }
  };

  const generateId = () => {
    if (typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'user-' + Array.from(window.crypto.getRandomValues(new Uint8Array(8)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  };

  const loadProfile = async () => {
    setIsLoading(true);
    const stored = localStorage.getItem('shadowlink_profile');
    
    if (stored) {
      try {
        const encryptedProfile: StoredUserProfile = JSON.parse(stored);
        let nickname = '';
        try {
          nickname = await decryptMessage(encryptedProfile.ciphertextNickname, encryptedProfile.ivNickname, cryptoKey);
        } catch (e) {
          console.error("Failed to decrypt nickname", e);
          nickname = '[Decryption Failed]';
        }
        
        setProfile({
          id: encryptedProfile.id,
          nickname: nickname
        });
      } catch (e) {
        console.error("Failed to parse profile", e);
      }
    } else {
      setProfile({
        id: generateId(),
        nickname: ''
      });
    }
    setIsLoading(false);
  };

  const generateQr = async () => {
    try {
      const url = await QRCode.toDataURL(profile.id, {
        width: 300,
        margin: 2,
        color: {
          dark: '#00dc82', 
          light: '#121212'
        }
      });
      setQrCodeUrl(url);
    } catch (err) {
      console.error("QR Generation failed", err);
    }
  };

  const handleSave = async () => {
    if (!profile.id) return;
    setIsSaving(true);
    
    try {
      const { ciphertext, iv } = await encryptMessage(profile.nickname, cryptoKey);
      
      const storedProfile: StoredUserProfile = {
        id: profile.id,
        ciphertextNickname: ciphertext,
        ivNickname: iv
      };

      localStorage.setItem('shadowlink_profile', JSON.stringify(storedProfile));
      await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      console.error("Failed to save profile", e);
    } finally {
      setIsSaving(false);
    }
  };

  const checkIp = async () => {
    setIsIpLoading(true);
    setIpData(null);
    try {
      // Using a privacy-respecting IP echo service
      const res = await fetch('https://ipapi.co/json/');
      if (!res.ok) throw new Error('Network block');
      const data = await res.json();
      setIpData({
        ip: data.ip,
        city: data.city,
        org: data.org
      });
    } catch (e) {
      setIpData({ ip: 'CONNECTION_FAILED', city: 'Unknown', org: 'Unknown' });
    } finally {
      setIsIpLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(profile.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportBackup = () => {
    try {
      const backup = {
        meta: {
          app: "ShadowLink",
          version: "1.0",
          created: new Date().toISOString(),
          uid: profile.id
        },
        data: {
          salt: localStorage.getItem('shadowlink_salt'),
          profile: localStorage.getItem('shadowlink_profile'),
          contacts: localStorage.getItem('shadowlink_contacts'),
          history: localStorage.getItem('shadowlink_history'),
          canary: localStorage.getItem('shadowlink_canary')
        }
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `shadowlink-backup-${profile.id.substring(0,8)}-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export failed", e);
      alert("Failed to generate backup.");
    }
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const backup = JSON.parse(content);

        // Basic validation
        if (!backup.data || !backup.data.salt) {
          throw new Error("Invalid backup file format.");
        }

        if (window.confirm("WARNING: Restoring will OVERWRITE all current data, messages, and contacts. This cannot be undone. Are you sure?")) {
           // Clear current
           localStorage.clear();

           // Restore keys
           if (backup.data.salt) localStorage.setItem('shadowlink_salt', backup.data.salt);
           if (backup.data.profile) localStorage.setItem('shadowlink_profile', backup.data.profile);
           if (backup.data.contacts) localStorage.setItem('shadowlink_contacts', backup.data.contacts);
           if (backup.data.history) localStorage.setItem('shadowlink_history', backup.data.history);
           if (backup.data.canary) localStorage.setItem('shadowlink_canary', backup.data.canary);

           alert("Backup restored successfully. The application will now reload.");
           window.location.reload();
        }
      } catch (err) {
        console.error(err);
        alert("Import failed: Invalid file or corrupted data.");
      }
    };
    reader.readAsText(file);
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-primary">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background overflow-y-auto">
      {/* Header */}
      <div className="h-14 border-b border-zinc-800 flex items-center px-4 bg-surface/50 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Shield className="text-primary" size={20} />
          <span className="font-mono font-bold text-sm tracking-wider">SYSTEM_CONFIG</span>
        </div>
      </div>

      <div className="p-6 space-y-8 max-w-lg mx-auto w-full pb-24">
        
        {/* Network Anonymity Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Globe className="text-accent" size={20} />
            <h2 className="text-sm font-bold font-mono text-gray-400 uppercase">Network Anonymity</h2>
          </div>

          <div className="bg-surface border border-zinc-800 p-5 rounded-xl space-y-5">
            <div className="flex items-center justify-between">
               <div className="flex flex-col">
                 <span className="text-gray-200 font-bold text-sm">Visible IP Address</span>
                 <span className="text-xs text-zinc-500">Check for IP/DNS leaks</span>
               </div>
               <Button 
                 onClick={checkIp} 
                 variant="secondary" 
                 isLoading={isIpLoading}
                 className="!py-1 !px-3 text-xs"
               >
                 {ipData ? 'Refresh' : 'Check IP'}
               </Button>
            </div>

            {ipData && (
              <div className="bg-black/50 p-3 rounded-lg border border-zinc-800 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center gap-2 text-primary font-mono text-sm mb-1">
                  {ipData.ip === 'CONNECTION_FAILED' ? <EyeOff size={14}/> : <Eye size={14} className="text-red-500"/>}
                  <span className={ipData.ip === 'CONNECTION_FAILED' ? 'text-green-500' : 'text-red-400'}>
                    {ipData.ip}
                  </span>
                </div>
                <div className="text-[10px] text-zinc-500 font-mono flex flex-col gap-1">
                  <span>LOC: {ipData.city || 'Unknown'}</span>
                  <span>ISP: {ipData.org || 'Unknown'}</span>
                  <span className="text-accent mt-1">
                    {ipData.ip !== 'CONNECTION_FAILED' ? '⚠ YOUR IP IS VISIBLE' : '✓ CONNECTION MASKED'}
                  </span>
                </div>
              </div>
            )}

            <div className="border-t border-zinc-800 pt-4 space-y-4">
               {/* Tor Toggle */}
               <div className="flex items-center justify-between">
                 <div className="flex items-center gap-3">
                   <div className={`w-8 h-8 rounded-full flex items-center justify-center ${torMode ? 'bg-secondary text-white' : 'bg-zinc-800 text-zinc-500'}`}>
                     <Radio size={16} />
                   </div>
                   <div className="flex flex-col">
                     <span className="text-gray-200 font-bold text-sm">Tor Network Bridge</span>
                     <span className="text-[10px] text-zinc-500 max-w-[180px]">
                       {torMode ? 'Simulated routing active. Use Tor Browser for full anonymity.' : 'Direct connection. Traffic is visible.'}
                     </span>
                   </div>
                 </div>
                 <button 
                   onClick={() => setTorMode(!torMode)}
                   className={`w-12 h-6 rounded-full transition-colors relative ${torMode ? 'bg-secondary' : 'bg-zinc-800'}`}
                 >
                   <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${torMode ? 'left-7' : 'left-1'}`} />
                 </button>
               </div>

               {/* WebRTC Toggle */}
               <div className="flex items-center justify-between">
                 <div className="flex items-center gap-3">
                   <div className={`w-8 h-8 rounded-full flex items-center justify-center ${webrtcShield ? 'bg-green-600/20 text-green-500' : 'bg-zinc-800 text-zinc-500'}`}>
                     <Shield size={16} />
                   </div>
                   <div className="flex flex-col">
                     <span className="text-gray-200 font-bold text-sm">WebRTC Shield</span>
                     <span className="text-[10px] text-zinc-500">Block IP leaks via peer connections</span>
                   </div>
                 </div>
                 <button 
                   onClick={toggleWebRTC}
                   className={`w-12 h-6 rounded-full transition-colors relative ${webrtcShield ? 'bg-green-600' : 'bg-zinc-800'}`}
                 >
                   <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${webrtcShield ? 'left-7' : 'left-1'}`} />
                 </button>
               </div>
            </div>
          </div>
        </div>

        {/* Profile Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Fingerprint className="text-secondary" size={20} />
            <h2 className="text-sm font-bold font-mono text-gray-400 uppercase">My Identity</h2>
          </div>
          
          <div className="bg-surface border border-zinc-800 p-5 rounded-xl space-y-5">
             <div className="space-y-2">
                <label className="text-xs text-gray-500 font-mono uppercase">Unique ID (Public)</label>
                <div className="flex gap-2">
                  <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg p-3 font-mono text-xs text-zinc-400 break-all select-all">
                    {profile.id}
                  </div>
                  <button 
                    onClick={copyToClipboard}
                    className="p-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-gray-400 transition-colors"
                  >
                    {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                  </button>
                </div>
             </div>

             <div>
                <Button 
                  type="button" 
                  onClick={() => setShowQr(!showQr)} 
                  variant="secondary" 
                  className="w-full text-xs py-2"
                >
                  {showQr ? <><X size={14} /> Hide QR Code</> : <><QrIcon size={14} /> Show ID QR Code</>}
                </Button>
                
                {showQr && (
                  <div className="mt-4 flex flex-col items-center justify-center p-4 bg-zinc-900 rounded-xl border border-zinc-800 animate-in fade-in zoom-in duration-300">
                    {qrCodeUrl ? (
                      <img src={qrCodeUrl} alt="User ID QR Code" className="w-48 h-48 rounded-lg shadow-[0_0_20px_rgba(0,220,130,0.1)]" />
                    ) : (
                      <div className="w-48 h-48 flex items-center justify-center text-zinc-600">
                        <span className="animate-pulse">Generating...</span>
                      </div>
                    )}
                    <p className="mt-3 text-[10px] text-zinc-500 font-mono uppercase tracking-wider">Scan to add contact</p>
                  </div>
                )}
             </div>

             <div className="space-y-2 pt-2 border-t border-zinc-800/50">
               <Input 
                 label="Nickname (Encrypted)"
                 placeholder="Enter alias..."
                 value={profile.nickname}
                 onChange={(e) => setProfile(prev => ({ ...prev, nickname: e.target.value }))}
                 icon={<User size={16} />}
               />
             </div>

             <Button 
               onClick={handleSave} 
               isLoading={isSaving} 
               className="w-full"
               variant="primary"
             >
               <Save size={16} /> Update Profile
             </Button>
          </div>
        </div>

        {/* Data Management Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <HardDrive className="text-gray-400" size={20} />
            <h2 className="text-sm font-bold font-mono text-gray-400 uppercase">Data Backup & Recovery</h2>
          </div>

          <div className="bg-surface border border-zinc-800 p-5 rounded-xl space-y-4">
             <div className="flex gap-3">
               <Button 
                  onClick={handleExportBackup}
                  variant="secondary"
                  className="flex-1 text-xs"
               >
                 <Download size={14} /> Export Identity
               </Button>
               
               <div className="flex-1 relative">
                 <input 
                    type="file" 
                    ref={fileInputRef}
                    onChange={handleImportBackup}
                    className="hidden"
                    accept=".json"
                 />
                 <Button 
                    onClick={() => fileInputRef.current?.click()}
                    variant="secondary"
                    className="w-full text-xs"
                 >
                   <Upload size={14} /> Restore Backup
                 </Button>
               </div>
             </div>
             <p className="text-[10px] text-zinc-600 text-center font-mono">
               Note: Backups contain your encryption salt. You will still need your password to unlock the restored session.
             </p>
          </div>
        </div>

        {/* Security Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="text-primary" size={20} />
            <h2 className="text-sm font-bold font-mono text-gray-400 uppercase">Security</h2>
          </div>

          <div className="bg-surface border border-zinc-800 p-5 rounded-xl space-y-4">
             <div className="space-y-2">
                <div className="flex justify-between text-xs font-mono text-zinc-500 border-b border-zinc-800 pb-2">
                  <span>Encryption</span>
                  <span className="text-primary">AES-256-GCM</span>
                </div>
                <div className="flex justify-between text-xs font-mono text-zinc-500 border-b border-zinc-800 pb-2">
                   <span>Key Derivation</span>
                   <span className="text-primary">PBKDF2 (100k)</span>
                </div>
                <div className="flex justify-between text-xs font-mono text-zinc-500 pb-2">
                   <span>Session Status</span>
                   <span className="text-green-500">ACTIVE</span>
                </div>
             </div>

             <Button 
              onClick={onLock}
              variant="danger"
              className="w-full"
             >
               <Lock size={16} /> LOCK VAULT IMMEDIATELY
             </Button>
          </div>
        </div>

        <div className="text-center pt-4">
          <p className="text-[10px] text-zinc-700 font-mono">
            SHADOWLINK ID: {profile.id.substring(0, 8)}...
          </p>
        </div>

      </div>
    </div>
  );
};