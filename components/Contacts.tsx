import React, { useState, useEffect, useRef } from 'react';
import { Users, UserPlus, Trash2, X, Save, User, MessageCircle, ScanLine, Camera } from 'lucide-react';
import { Button } from './Button';
import { Input } from './Input';
import { Contact, StoredContact } from '../types';
import { encryptMessage, decryptMessage } from '../services/cryptoUtils';
import { Html5QrcodeScanner } from 'html5-qrcode';

interface ContactsProps {
  cryptoKey: CryptoKey;
  onChatStart: (contact: Contact) => void;
}

export const Contacts: React.FC<ContactsProps> = ({ cryptoKey, onChatStart }) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [newName, setNewName] = useState('');
  const [newNote, setNewNote] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    loadContacts();
  }, [cryptoKey]);

  useEffect(() => {
    if (isScanning) {
      // Small timeout to allow DOM to render the reader div
      setTimeout(() => {
        if (!scannerRef.current) {
          const config = { fps: 10, qrbox: { width: 250, height: 250 } };
          const scanner = new Html5QrcodeScanner("reader", config, false);
          scannerRef.current = scanner;
          
          scanner.render((decodedText) => {
             handleScanSuccess(decodedText);
          }, (error) => {
             // Ignore scan errors, they happen every frame
          });
        }
      }, 100);
    } else {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(console.error);
        scannerRef.current = null;
      }
    }
    
    return () => {
       if (scannerRef.current) {
         scannerRef.current.clear().catch(console.error);
         scannerRef.current = null;
       }
    };
  }, [isScanning]);

  const loadContacts = async () => {
    const stored = localStorage.getItem('shadowlink_contacts');
    if (stored) {
      try {
        const encryptedContacts: StoredContact[] = JSON.parse(stored);
        const decryptedContacts = await Promise.all(
          encryptedContacts.map(async (c) => {
            const name = await decryptMessage(c.ciphertextName, c.ivName, cryptoKey);
            const note = await decryptMessage(c.ciphertextNote, c.ivNote, cryptoKey);
            return {
              id: c.id,
              name,
              note
            };
          })
        );
        setContacts(decryptedContacts);
      } catch (e) {
        console.error("Failed to load contacts", e);
      }
    }
  };

  const handleScanSuccess = (data: string) => {
     try {
       // Attempt to parse JSON payload
       const payload = JSON.parse(data);
       if (payload.name) {
         setNewName(payload.name);
         setNewNote(payload.bio || ''); // Use bio as the AI context note
         setIsScanning(false);
         setIsAdding(true);
       }
     } catch (e) {
       console.error("Invalid QR Data", e);
       alert("Invalid ShadowLink QR Code");
       setIsScanning(false);
     }
  };

  const handleSaveContact = async () => {
    if (!newName.trim()) return;
    setIsLoading(true);

    try {
      const { ciphertext: ctName, iv: ivName } = await encryptMessage(newName, cryptoKey);
      const { ciphertext: ctNote, iv: ivNote } = await encryptMessage(newNote, cryptoKey);

      const newContact: Contact = {
        id: Date.now().toString(),
        name: newName,
        note: newNote
      };

      const newStoredContact: StoredContact = {
        id: newContact.id,
        ciphertextName: ctName,
        ivName: ivName,
        ciphertextNote: ctNote,
        ivNote: ivNote
      };

      // Get existing stored contacts to append to
      const existingStored = localStorage.getItem('shadowlink_contacts');
      const storedContacts: StoredContact[] = existingStored ? JSON.parse(existingStored) : [];
      const updatedStoredContacts = [...storedContacts, newStoredContact];

      localStorage.setItem('shadowlink_contacts', JSON.stringify(updatedStoredContacts));
      
      setContacts([...contacts, newContact]);
      setNewName('');
      setNewNote('');
      setIsAdding(false);
    } catch (e) {
      console.error("Error saving contact", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("Delete this contact permanently?")) {
      const updatedContacts = contacts.filter(c => c.id !== id);
      setContacts(updatedContacts);

      // Update local storage
      const existingStored = localStorage.getItem('shadowlink_contacts');
      if (existingStored) {
        const storedContacts: StoredContact[] = JSON.parse(existingStored);
        const updatedStored = storedContacts.filter(c => c.id !== id);
        localStorage.setItem('shadowlink_contacts', JSON.stringify(updatedStored));
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-background relative overflow-hidden">
      {/* Header */}
      <div className="h-14 border-b border-zinc-800 flex items-center justify-between px-4 bg-surface/50 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Users className="text-primary" size={20} />
          <span className="font-mono font-bold text-sm tracking-wider">SECURE_CONTACTS</span>
        </div>
        <div className="flex gap-2">
            <button 
                onClick={() => { setIsScanning(!isScanning); setIsAdding(false); }}
                className={`p-2 rounded-lg transition-colors ${isScanning ? 'bg-primary text-black' : 'text-primary hover:bg-primary/10'}`}
            >
                <ScanLine size={20} />
            </button>
            <button 
                onClick={() => { setIsAdding(!isAdding); setIsScanning(false); }}
                className={`p-2 rounded-lg transition-colors ${isAdding ? 'bg-zinc-800 text-white' : 'text-primary hover:bg-primary/10'}`}
            >
                {isAdding ? <X size={20} /> : <UserPlus size={20} />}
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        
        {/* Scanner Overlay */}
        {isScanning && (
             <div className="mb-6 bg-black border border-primary/50 rounded-xl overflow-hidden relative animate-in zoom-in-95 duration-300">
                <div id="reader" className="w-full"></div>
                <div className="absolute top-0 left-0 w-full p-2 bg-black/50 text-center">
                    <p className="text-xs font-mono text-primary animate-pulse">SCANNING SECURE IDENTITY...</p>
                </div>
                <button 
                  onClick={() => setIsScanning(false)}
                  className="absolute top-2 right-2 p-1 bg-black/50 text-white rounded-full hover:bg-red-500"
                >
                    <X size={16}/>
                </button>
             </div>
        )}

        {isAdding && (
          <div className="mb-6 p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl animate-in slide-in-from-top-4 fade-in">
            <h3 className="text-xs font-mono uppercase text-primary mb-4">Add New Identity</h3>
            <div className="space-y-4">
              <Input 
                placeholder="Alias / Name" 
                value={newName} 
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
              />
              <Input 
                placeholder="Secure Note (Persona / Context)" 
                value={newNote} 
                onChange={(e) => setNewNote(e.target.value)}
              />
              <p className="text-[10px] text-zinc-500 font-mono">
                * The Secure Note defines how your Digital Twin simulation will behave.
              </p>
              <div className="flex gap-2 pt-2">
                <Button onClick={handleSaveContact} isLoading={isLoading} className="flex-1">
                  <Save size={16} /> Save Encrypted
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {contacts.length === 0 && !isAdding && !isScanning && (
            <div className="text-center mt-20 text-zinc-600">
              <Users size={48} className="mx-auto mb-4 opacity-20" />
              <p className="font-mono text-sm">No encrypted contacts found.</p>
              <p className="text-xs mt-2">Scan a friend's QR code or add manually.</p>
            </div>
          )}

          {contacts.map((contact) => (
            <div key={contact.id} className="group bg-surface border border-zinc-800 p-4 rounded-xl hover:border-zinc-700 transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center border border-zinc-800 text-zinc-500 shrink-0">
                    <User size={20} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-gray-200 truncate">{contact.name}</h4>
                    {contact.note && (
                      <p className="text-xs text-zinc-500 font-mono truncate max-w-[150px]">{contact.note}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                   <button 
                    onClick={() => onChatStart(contact)}
                    className="p-2 bg-zinc-800 hover:bg-primary hover:text-black rounded-lg text-primary transition-colors"
                  >
                    <MessageCircle size={18} />
                  </button>
                  <button 
                    onClick={(e) => handleDelete(contact.id, e)}
                    className="p-2 text-zinc-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};