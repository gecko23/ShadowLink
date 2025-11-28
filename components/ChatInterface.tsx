import React, { useState, useEffect, useRef } from 'react';
import { Send, Trash2, Shield, Wifi, WifiOff, Mic, Clock, Timer, Check, User } from 'lucide-react';
import { Message, StoredMessage, Contact } from '../types';
import { encryptMessage, decryptMessage } from '../services/cryptoUtils';
import { sendMessageToGemini } from '../services/geminiService';
import { Button } from './Button';

interface ChatInterfaceProps {
  cryptoKey: CryptoKey;
  activeContact: Contact | null;
}

const TTL_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '1m', value: 60 * 1000 },
  { label: '5m', value: 5 * 60 * 1000 },
  { label: '1h', value: 60 * 60 * 1000 },
  { label: '24h', value: 24 * 60 * 60 * 1000 },
];

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ cryptoKey, activeContact }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const conversationId = activeContact ? activeContact.id : 'global';

  // Auto-delete / Disappearing Messages State
  const [ttl, setTtl] = useState<number>(0);
  const [showTtlMenu, setShowTtlMenu] = useState(false);

  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);

  // Load and decrypt messages on mount or when activeContact changes
  useEffect(() => {
    loadMessages();
  }, [cryptoKey, activeContact]);

  const loadMessages = async () => {
    const stored = localStorage.getItem('shadowlink_history');
    if (stored) {
      try {
        const encryptedHistory: StoredMessage[] = JSON.parse(stored);
        const now = Date.now();
        
        // Filter out expired messages globally first
        const validMessages = encryptedHistory.filter(m => !m.expiresAt || m.expiresAt > now);
        
        if (validMessages.length !== encryptedHistory.length) {
             localStorage.setItem('shadowlink_history', JSON.stringify(validMessages));
        }

        const allDecryptedMessages = await Promise.all(
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
              expiresAt: m.expiresAt,
              conversationId: m.conversationId || 'global'
            } as Message;
          })
        );

        // Filter for current conversation
        const filteredMessages = allDecryptedMessages.filter(m => m.conversationId === conversationId);
        
        // If it's a new contact chat and empty, add greeting
        if (filteredMessages.length === 0 && activeContact) {
            setMessages([{
                id: 'init-contact',
                role: 'system',
                content: `Secure channel established with ${activeContact.name}. Messages are locally encrypted.`,
                timestamp: Date.now(),
                type: 'text',
                conversationId: conversationId
            }]);
        } else if (filteredMessages.length === 0 && !activeContact) {
            setMessages([{
                id: 'init-global',
                role: 'model',
                content: 'Secure channel established. I am Shadow. Local storage is encrypted. How can I assist you?',
                timestamp: Date.now(),
                type: 'text',
                conversationId: 'global'
            }]);
        } else {
            setMessages(filteredMessages);
        }

      } catch (e) {
        console.error("Failed to load history", e);
      }
    } else {
        // First run ever
        if (!activeContact) {
            setMessages([{
            id: 'init',
            role: 'model',
            content: 'Secure channel established. I am Shadow. Local storage is encrypted. How can I assist you?',
            timestamp: Date.now(),
            type: 'text',
            conversationId: 'global'
            }]);
        }
    }
  };

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Merge current messages with all other messages in storage and save
  const saveToStorage = async (newCurrentMessages: Message[]) => {
    try {
        // Load ALL existing messages first (raw)
        const stored = localStorage.getItem('shadowlink_history');
        let allEncrypted: StoredMessage[] = stored ? JSON.parse(stored) : [];

        // Remove old versions of messages for THIS conversation
        allEncrypted = allEncrypted.filter(m => (m.conversationId || 'global') !== conversationId);

        // Encrypt new messages for THIS conversation
        const newEncrypted: StoredMessage[] = await Promise.all(
            newCurrentMessages.map(async (m) => {
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
                salt: '',
                expiresAt: m.expiresAt,
                conversationId: conversationId
            };
            })
        );

        // Combine and save
        const finalStorage = [...allEncrypted, ...newEncrypted];
        localStorage.setItem('shadowlink_history', JSON.stringify(finalStorage));

    } catch (e) {
      console.error("Save failed", e);
    }
  };

  const calculateExpiresAt = () => {
    return ttl > 0 ? Date.now() + ttl : undefined;
  };

  const handleSendResponse = async (userMsg: Message, currentHistory: Message[]) => {
      setIsLoading(true);
      try {
        let responseText = '';
        const inputPayload = userMsg.type === 'audio' && userMsg.mediaData 
            ? { audio: userMsg.mediaData } 
            : { text: userMsg.content };

        if (activeContact) {
            // "Digital Twin" Simulation Mode
            // We pass the contact's name and note as the persona
            responseText = await sendMessageToGemini(
                currentHistory, 
                inputPayload,
                { name: activeContact.name, context: activeContact.note }
            );
        } else {
            // Standard Shadow AI
            responseText = await sendMessageToGemini(currentHistory, inputPayload);
        }

        const botMsg: Message = {
            id: (Date.now() + 1).toString(),
            role: 'model',
            content: responseText,
            type: 'text',
            timestamp: Date.now(),
            expiresAt: calculateExpiresAt(),
            conversationId: conversationId
        };
        
        const finalHistory = [...currentHistory, botMsg];
        setMessages(finalHistory);
        saveToStorage(finalHistory);
      } catch (e) {
          console.error(e);
      } finally {
          setIsLoading(false);
      }
  };

  const handleSendAudio = async (base64Audio: string) => {
     const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: '[Audio Message]',
      type: 'audio',
      mediaData: base64Audio,
      timestamp: Date.now(),
      expiresAt: calculateExpiresAt(),
      conversationId: conversationId
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    saveToStorage(newHistory);
    
    handleSendResponse(userMsg, newHistory);
  };

  const handleSendText = async () => {
    if (!inputText.trim()) return;
    
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputText,
      type: 'text',
      timestamp: Date.now(),
      expiresAt: calculateExpiresAt(),
      conversationId: conversationId
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInputText('');
    saveToStorage(newHistory);

    handleSendResponse(userMsg, newHistory);
  };

  const handleClear = () => {
    if (window.confirm("Clear this conversation history?")) {
      setMessages([]);
      // Load storage, filter out this conversation, save back
      const stored = localStorage.getItem('shadowlink_history');
      if (stored) {
          const all: StoredMessage[] = JSON.parse(stored);
          const kept = all.filter(m => (m.conversationId || 'global') !== conversationId);
          localStorage.setItem('shadowlink_history', JSON.stringify(kept));
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Recording Logic (same as before)
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64String = (reader.result as string).split(',')[1];
          handleSendAudio(base64String);
        };
        stream.getTracks().forEach(track => track.stop());
      };
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerIntervalRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      alert("Microphone access denied.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null; }
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      audioChunksRef.current = [];
      mediaRecorderRef.current.onstop = null;
      setIsRecording(false);
      if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null; }
    }
  };

  return (
    <div className="flex flex-col h-full bg-background relative">
      {/* Header */}
      <div className="h-14 border-b border-zinc-800 flex items-center justify-between px-4 bg-surface/50 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-2">
          {activeContact ? (
              <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-primary">
                    <User size={14}/>
                  </div>
                  <div>
                    <span className="font-bold text-sm block leading-tight">{activeContact.name}</span>
                    <span className="text-[10px] text-zinc-500 font-mono flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary/50"></span>
                        ENCRYPTED • DIGITAL TWIN
                    </span>
                  </div>
              </div>
          ) : (
            <>
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
                <span className="font-mono font-bold text-sm tracking-wider">SHADOWLINK AI</span>
            </>
          )}
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
          const isSystem = msg.role === 'system';
          const isEphemeral = !!msg.expiresAt;
          
          if (isSystem) {
              return (
                  <div key={msg.id} className="flex justify-center my-4">
                      <span className="text-[10px] text-zinc-600 font-mono bg-zinc-900/50 px-3 py-1 rounded-full border border-zinc-800">
                          {msg.content}
                      </span>
                  </div>
              )
          }

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
                 <button onClick={cancelRecording} className="p-1 text-zinc-400 hover:text-white">Cancel</button>
                 <button onClick={stopRecording} className="p-1.5 bg-red-600 rounded-lg text-white hover:bg-red-500"><Send size={16} /></button>
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
                placeholder={activeContact ? `Message ${activeContact.name}...` : "Type encrypted message..."}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
                disabled={isLoading}
              />
              <Button onClick={handleSendText} disabled={!inputText.trim() || isLoading} className="!px-4 !py-0 !rounded-xl">
                <Send size={18} />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};