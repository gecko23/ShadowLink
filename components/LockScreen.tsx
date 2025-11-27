import React, { useState } from 'react';
import { Lock, Unlock, Key, ShieldCheck } from 'lucide-react';
import { Button } from './Button';
import { Input } from './Input';
import { generateSalt, deriveKey, bufToBase64, base64ToBuf } from '../services/cryptoUtils';

interface LockScreenProps {
  onUnlock: (key: CryptoKey) => void;
}

export const LockScreen: React.FC<LockScreenProps> = ({ onUnlock }) => {
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'LOGIN' | 'SETUP'>('LOGIN');

  // Check if user has visited before by checking for stored salt
  React.useEffect(() => {
    const storedSalt = localStorage.getItem('shadowlink_salt');
    if (!storedSalt) {
      setMode('SETUP');
    }
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setIsLoading(true);
    setError('');

    try {
      // Simulate "computation" delay for dramatic effect
      await new Promise(r => setTimeout(r, 600));

      if (mode === 'SETUP') {
        // Generate new salt
        const salt = generateSalt();
        const saltStr = bufToBase64(salt);
        localStorage.setItem('shadowlink_salt', saltStr);
        
        // Derive key
        const key = await deriveKey(password, salt);
        
        // In a real app we might verify this key by encrypting a known value (canary)
        // For this demo, we assume success
        localStorage.setItem('shadowlink_canary', 'active');
        onUnlock(key);
      } else {
        const saltStr = localStorage.getItem('shadowlink_salt');
        if (!saltStr) {
          setError("Storage corrupted. Reset required.");
          setMode('SETUP');
          setIsLoading(false);
          return;
        }

        const salt = base64ToBuf(saltStr);
        const key = await deriveKey(password, salt);

        // Simple validation: In a real scenario, we'd try to decrypt a known token.
        // Here we just pass the key. If it's wrong, message decryption will show garbage.
        onUnlock(key);
      }
    } catch (err) {
      console.error(err);
      setError("Authentication failed.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    if (window.confirm("WARNING: This will wipe all locally stored encrypted messages. Cannot be undone.")) {
      localStorage.clear();
      setMode('SETUP');
      setPassword('');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-10">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary rounded-full blur-[100px]"></div>
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-secondary rounded-full blur-[100px]"></div>
      </div>

      <div className="w-full max-w-md bg-surface border border-zinc-800 p-8 rounded-2xl shadow-2xl relative z-10">
        <div className="flex flex-col items-center mb-8">
          <div className={`p-4 rounded-full mb-4 ${mode === 'SETUP' ? 'bg-primary/10 text-primary' : 'bg-secondary/10 text-secondary'}`}>
            {mode === 'SETUP' ? <Key size={40} /> : <Lock size={40} />}
          </div>
          <h1 className="text-2xl font-bold font-mono tracking-tighter text-white">
            {mode === 'SETUP' ? 'CREATE IDENTITY' : 'DECRYPT SESSION'}
          </h1>
          <p className="text-center text-gray-500 mt-2 text-sm">
            {mode === 'SETUP' 
              ? 'Set a master password. This will be used to encrypt all local data using AES-GCM.' 
              : 'Enter your master password to derive your decryption key.'}
          </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-6">
          <Input 
            type="password" 
            placeholder={mode === 'SETUP' ? "Set Strong Password" : "Enter Password"} 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            icon={<ShieldCheck size={18} />}
            autoFocus
          />

          {error && <p className="text-red-500 text-xs font-mono text-center">{error}</p>}

          <Button type="submit" className="w-full" isLoading={isLoading}>
            {mode === 'SETUP' ? 'Initialize Encryption' : 'Unlock Vault'}
          </Button>

          {mode === 'LOGIN' && (
            <button 
              type="button"
              onClick={handleReset}
              className="w-full text-xs text-zinc-600 hover:text-red-500 mt-4 font-mono transition-colors"
            >
              FORGOT PASSWORD / RESET VAULT
            </button>
          )}
        </form>
      </div>
      
      <div className="mt-8 text-center">
        <p className="text-zinc-600 text-xs font-mono">
          SHADOWLINK v1.0.0 <br/> CLIENT-SIDE ENCRYPTION
        </p>
      </div>
    </div>
  );
};