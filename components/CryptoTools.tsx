import React, { useState } from 'react';
import { Lock, Unlock, Copy, Check, RefreshCw } from 'lucide-react';
import { Button } from './Button';
import { Input } from './Input';
import { generateSalt, deriveKey, encryptMessage, decryptMessage, bufToBase64, base64ToBuf } from '../services/cryptoUtils';

export const CryptoTools: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'ENCRYPT' | 'DECRYPT'>('ENCRYPT');
  const [text, setText] = useState('');
  const [password, setPassword] = useState('');
  const [result, setResult] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleProcess = async () => {
    if (!text || !password) return;
    setIsProcessing(true);
    setResult('');
    
    try {
      if (activeTab === 'ENCRYPT') {
        const salt = generateSalt();
        const key = await deriveKey(password, salt);
        const { ciphertext, iv } = await encryptMessage(text, key);
        
        // Format: version:salt:iv:ciphertext (all base64)
        const payload = `sl1:${bufToBase64(salt)}:${iv}:${ciphertext}`;
        setResult(payload);
      } else {
        // Expecting format sl1:salt:iv:ciphertext
        const parts = text.split(':');
        if (parts.length !== 4 || parts[0] !== 'sl1') {
          throw new Error("Invalid format. Expected ShadowLink format.");
        }
        
        const salt = base64ToBuf(parts[1]);
        const iv = parts[2];
        const ciphertext = parts[3];
        
        const key = await deriveKey(password, salt);
        const decrypted = await decryptMessage(ciphertext, iv, key);
        setResult(decrypted);
      }
    } catch (e) {
      setResult("Error: Operation failed. Check password or format.");
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full p-4 gap-6 overflow-y-auto">
      <div className="flex gap-2 bg-zinc-900 p-1 rounded-lg shrink-0">
        <button
          className={`flex-1 py-2 text-sm font-mono font-bold rounded ${activeTab === 'ENCRYPT' ? 'bg-primary text-black' : 'text-gray-400 hover:text-white'}`}
          onClick={() => setActiveTab('ENCRYPT')}
        >
          ENCRYPT
        </button>
        <button
          className={`flex-1 py-2 text-sm font-mono font-bold rounded ${activeTab === 'DECRYPT' ? 'bg-secondary text-white' : 'text-gray-400 hover:text-white'}`}
          onClick={() => setActiveTab('DECRYPT')}
        >
          DECRYPT
        </button>
      </div>

      <div className="flex-1 flex flex-col gap-4">
        <div className="space-y-2">
          <label className="text-xs text-gray-500 font-mono uppercase">Input Text</label>
          <textarea
            className="w-full h-32 bg-surface border border-zinc-800 rounded-lg p-3 text-gray-200 focus:outline-none focus:border-primary font-mono text-sm resize-none"
            placeholder={activeTab === 'ENCRYPT' ? "Secret message..." : "Paste encrypted payload..."}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>

        <Input
          type="password"
          label="Encryption Password"
          placeholder="Shared secret key"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          icon={<Lock size={16} />}
        />

        <Button onClick={handleProcess} isLoading={isProcessing} className="w-full">
          {activeTab === 'ENCRYPT' ? 'Generate Ciphertext' : 'Reveal Message'}
        </Button>

        {result && (
          <div className="mt-4 space-y-2 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <label className="text-xs text-gray-500 font-mono uppercase flex justify-between items-center">
              <span>Output</span>
              {copied ? <span className="text-green-500 flex items-center gap-1"><Check size={12}/> Copied</span> : null}
            </label>
            <div className="relative group">
              <textarea
                readOnly
                className="w-full h-32 bg-black border border-zinc-800 rounded-lg p-3 text-primary font-mono text-xs break-all resize-none focus:outline-none"
                value={result}
              />
              <button 
                onClick={copyToClipboard}
                className="absolute top-2 right-2 p-2 bg-zinc-800 rounded hover:bg-zinc-700 text-gray-300 transition-colors"
              >
                <Copy size={16} />
              </button>
            </div>
            {activeTab === 'ENCRYPT' && (
              <p className="text-[10px] text-zinc-500 font-mono">
                * This payload uses AES-GCM with a random salt. It can only be decrypted with the exact password.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};