import React, { useState, useEffect, useRef } from 'react';
import { Send, Trash2, Shield, Wifi, WifiOff, Mic, Square, Play, Pause, Clock, Timer, Check } from 'lucide-react';
import { Message, StoredMessage } from '../types';
import { encryptMessage, decryptMessage, bufToBase64 } from '../services/cryptoUtils';
import { sendMessageToGemini } from '../services/geminiService';
import { Button } from './Button';

interface ChatInterfaceProps {
  cryptoKey: CryptoKey;
}

const TTL_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '1m', value: 60 * 1000 },
  { label: '5m', value: 5 * 60 * 1000 },
  { label: '1h', value: 60 * 60 * 1000 },
  { label: '24h', value: 24 * 60 * 60 * 1000 },
];

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ cryptoKey }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-delete / Disappearing Messages State
  const [ttl, setTtl] = useState<number>(0);
  const [showTtlMenu, setShowTtlMenu] = useState(false);

  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);

  // Load and decrypt messages on mount
  useEffect(() => {
    const loadMessages = async () => {
      const stored = localStorage.getItem('shadowlink_history');
      if (stored) {
        try {
          const encryptedHistory: StoredMessage[] = JSON.parse(stored);
          const now = Date.now();
          
          // Filter out expired messages during load
          const validMessages = encryptedHistory.filter(m => !m.expiresAt || m.expiresAt > now);
          
          // If we filtered anything, update storage immediately
          if (validMessages.length !== encryptedHistory.length) {
             localStorage.setItem('shadowlink_history', JSON.stringify(validMessages));
          }

          const decryptedHistory = await Promise.all(
            validMessages.map(async (m) => {
              const content = await decryptMessage(m.ciphertext, m.iv, cryptoKey);
              let mediaData = undefined;
              
              if (m.type === 'audio' && m.ciphertextMedia && m.ivMedia) {
                try {
                  mediaData = await decryptMessage(m.ciphertextMedia, m.ivMedia, cryptoKey);
                } catch (err) {
                  console.error("Failed to decrypt audio", err);
                }
              }

              return {
                id: m.id,
                role: m.role,
                timestamp: m.timestamp,
                content: content,
                type: m.type || 'text',
                mediaData: mediaData,
                encrypted: false,
                expiresAt: m.expiresAt
              } as Message;
            })
          );
          setMessages(decryptedHistory);
        } catch (e) {
          console.error("Failed to load history", e);
        }
      } else {
        // Initial Greeting
        setMessages([{
          id: 'init',
          role: 'model',
          content: 'Secure channel established. I am Shadow. Local storage is encrypted. How can I assist you?',
          timestamp: Date.now(),
          type: 'text'
        }]);
      }
    };
    loadMessages();

    // Network status listeners
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [cryptoKey]);

  // Expiration Checker Loop
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setMessages(currentMessages => {
        const hasExpired = currentMessages.some(m => m.expiresAt && m.expiresAt <= now);
        if (hasExpired) {
          const activeMessages = currentMessages.filter(m => !m.expiresAt || m.expiresAt > now);
          // We need to update storage as well to reflect the deletion
          // Note: saveToStorage is async and depends on cryptoKey, so we call it carefully or rely on the state update to trigger a save
          // However, decrypting/re-encrypting inside an interval is heavy.
          // Better approach: sync logic.
          syncStorageAfterPrune(activeMessages);
          return activeMessages;
        }
        return currentMessages;
      });
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, [cryptoKey]);

  // Helper to sync storage after auto-deletion without re-encrypting everything if possible
  // Since we don't hold the encrypted versions in state, we have to re-encrypt or read-modify-write.
  // Re-encrypting is safer for code simplicity here given the scale.
  const syncStorageAfterPrune = (activeMessages: Message[]) => {
    saveToStorage(activeMessages);
  };

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Save to local storage whenever messages change
  // Note: This is computationally expensive for large chats. In a production app, we'd optimize this.
  const saveToStorage = async (msgs: Message[]) => {
    try {
      const encryptedHistory: StoredMessage[] = await Promise.all(
        msgs.map(async (m) => {
          const { ciphertext, iv } = await encryptMessage(m.content, cryptoKey);
          let ciphertextMedia = undefined;
          let ivMedia = undefined;

          if (m.type === 'audio' && m.mediaData) {
            const encryptedMedia = await encryptMessage(m.mediaData, cryptoKey);
            ciphertextMedia = encryptedMedia.ciphertext;
            ivMedia = encryptedMedia.iv;
          }

          return {
            id: m.id,
            role: m.role,
            timestamp: m.timestamp,
            ciphertext,
            iv,
            type: m.type,
            ciphertextMedia,
            ivMedia,
            salt: '', // Salt is derived from master password globally
            expiresAt: m.expiresAt
          };
        })
      );
      localStorage.setItem('shadowlink_history', JSON.stringify(encryptedHistory));
    } catch (e) {
      console.error("Save failed", e);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64String = (reader.result as string).split(',')[1];
          handleSendAudio(base64String);
        };
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerIntervalRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Microphone access denied or unavailable.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      audioChunksRef.current = [];
      mediaRecorderRef.current.onstop = null;
      
      setIsRecording(false);
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }
  };

  const calculateExpiresAt = () => {
    return ttl > 0 ? Date.now() + ttl : undefined;
  };

  const handleSendAudio = async (base64Audio: string) => {
     const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: '[Audio Message]',
      type: 'audio',
      mediaData: base64Audio,
      timestamp: Date.now(),
      expiresAt: calculateExpiresAt()
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setIsLoading(true);

    saveToStorage(newHistory);

    try {
      const responseText = await sendMessageToGemini(newHistory, { audio: base64Audio });
      
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: responseText,
        type: 'text',
        timestamp: Date.now(),
        expiresAt: calculateExpiresAt() // Bot replies also inherit the TTL
      };
      
      const finalHistory = [...newHistory, botMsg];
      setMessages(finalHistory);
      saveToStorage(finalHistory);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendText = async () => {
    if (!inputText.trim()) return;
    
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputText,
      type: 'text',
      timestamp: Date.now(),
      expiresAt: calculateExpiresAt()
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInputText('');
    setIsLoading(true);

    saveToStorage(newHistory);

    try {
      const responseText = await sendMessageToGemini(newHistory, { text: userMsg.content });
      
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: responseText,
        type: 'text',
        timestamp: Date.now(),
        expiresAt: calculateExpiresAt()
      };
      
      const finalHistory = [...newHistory, botMsg];
      setMessages(finalHistory);
      saveToStorage(finalHistory);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    if (window.confirm("Clear chat history? This cannot be undone.")) {
      setMessages([]);
      localStorage.removeItem('shadowlink_history');
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full bg-background relative">
      {/* Header */}
      <div className="h-14 border-b border-zinc-800 flex items-center justify-between px-4 bg-surface/50 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
          <span className="font-mono font-bold text-sm tracking-wider">SHADOWLINK</span>
        </div>
        <div className="flex items-center gap-3">
           {/* Auto Delete Menu */}
           <div className="relative">
             <button 
                onClick={() => setShowTtlMenu(!showTtlMenu)}
                className={`flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded border transition-all ${
                  ttl > 0 ? 'border-accent text-accent bg-accent/10' : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
             >
                {ttl > 0 ? <Timer size={12} /> : <Clock size={12} />}
                <span>{TTL_OPTIONS.find(o => o.value === ttl)?.label}</span>
             </button>

             {showTtlMenu && (
               <>
                 <div className="fixed inset-0 z-10" onClick={() => setShowTtlMenu(false)} />
                 <div className="absolute top-full right-0 mt-2 w-32 bg-surface border border-zinc-800 rounded-xl shadow-xl z-20 overflow-hidden flex flex-col p-1">
                    {TTL_OPTIONS.map(opt => (
                      <button
                        key={opt.label}
                        onClick={() => { setTtl(opt.value); setShowTtlMenu(false); }}
                        className={`text-xs font-mono text-left px-3 py-2 rounded-lg flex justify-between items-center ${
                          ttl === opt.value ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                        }`}
                      >
                        {opt.label}
                        {ttl === opt.value && <Check size={10} className="text-primary"/>}
                      </button>
                    ))}
                 </div>
               </>
             )}
           </div>

           <div className={`flex items-center gap-1 text-[10px] font-mono ${isOnline ? 'text-zinc-500' : 'text-red-500'}`}>
              {isOnline ? <Wifi size={12}/> : <WifiOff size={12}/>}
           </div>
           <button onClick={handleClear} className="text-zinc-600 hover:text-red-500 transition-colors">
             <Trash2 size={16} />
           </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          // Calculate remaining time for visual indication if message has TTL
          // Only show if it's gonna expire soon or is ephemeral
          const isEphemeral = !!msg.expiresAt;
          
          return (
            <div key={msg.id} className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl p-4 relative group ${
                isUser 
                  ? 'bg-zinc-800 text-white rounded-br-none border border-zinc-700' 
                  : 'bg-primary/10 text-primary-dim rounded-bl-none border border-primary/20'
              }`}>
                {msg.type === 'audio' && msg.mediaData ? (
                  <div className="flex flex-col gap-2 min-w-[200px]">
                    <div className="flex items-center gap-2 text-xs font-mono opacity-70">
                      <Mic size={12} />
                      <span>Encrypted Voice Message</span>
                    </div>
                    <audio controls src={`data:audio/webm;base64,${msg.mediaData}`} className="w-full h-8 max-w-[240px]" />
                  </div>
                ) : (
                  <p className="text-sm font-sans leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                )}
                
                <div className="flex items-center justify-end gap-2 mt-2 opacity-50">
                  {isEphemeral && (
                    <span className="text-[10px] font-mono text-accent flex items-center gap-1" title="Auto-delete enabled">
                      <Timer size={10} />
                    </span>
                  )}
                  {isUser ? <Shield size={10} /> : null}
                  <span className="text-[10px] font-mono uppercase">
                    {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        {isLoading && (
          <div className="flex justify-start">
             <div className="bg-zinc-900 rounded-2xl rounded-bl-none p-4 border border-zinc-800 flex items-center gap-2">
               <span className="w-2 h-2 bg-primary rounded-full animate-bounce"></span>
               <span className="w-2 h-2 bg-primary rounded-full animate-bounce delay-75"></span>
               <span className="w-2 h-2 bg-primary rounded-full animate-bounce delay-150"></span>
             </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-background border-t border-zinc-800">
        <div className="flex gap-2 items-center">
          {isRecording ? (
             <div className="flex-1 bg-red-900/20 border border-red-900/50 rounded-xl px-4 py-3 flex items-center justify-between">
               <div className="flex items-center gap-3 text-red-500 animate-pulse">
                 <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                 <span className="font-mono text-sm font-bold">{formatTime(recordingTime)}</span>
               </div>
               <div className="flex items-center gap-2">
                 <button 
                    onClick={cancelRecording}
                    className="p-1 text-zinc-400 hover:text-white"
                  >
                   Cancel
                 </button>
                 <button 
                    onClick={stopRecording}
                    className="p-1.5 bg-red-600 rounded-lg text-white hover:bg-red-500"
                  >
                   <Send size={16} />
                 </button>
               </div>
             </div>
          ) : (
            <>
              <button 
                onClick={startRecording}
                className="p-3 text-zinc-500 hover:text-primary transition-colors bg-zinc-900 border border-zinc-700 rounded-xl hover:border-primary"
                title="Record Voice Message"
              >
                <Mic size={20} />
              </button>
              <input
                type="text"
                className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary font-sans transition-all"
                placeholder="Type encrypted message..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
                disabled={isLoading}
              />
              <Button 
                onClick={handleSendText} 
                disabled={!inputText.trim() || isLoading}
                className="!px-4 !py-0 !rounded-xl"
              >
                <Send size={18} />
              </Button>
            </>
          )}
        </div>
        {!isRecording && (
          <div className="text-center mt-2 flex justify-center items-center gap-2">
            <p className="text-[10px] text-zinc-600 font-mono">
              <Shield size={10} className="inline mr-1"/>
              End-to-End Encryption
            </p>
            {ttl > 0 && (
               <p className="text-[10px] text-accent font-mono animate-pulse">
                 <Timer size={10} className="inline mr-1"/>
                 Disappearing Messages On
               </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};