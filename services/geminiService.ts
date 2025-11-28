import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { Message } from "../types";

// We use the new SDK format
const initializeGenAI = (): GoogleGenAI => {
  const apiKey = process.env.API_KEY || '';
  if (!apiKey) {
    console.warn("API Key not found in environment.");
  }
  return new GoogleGenAI({ apiKey });
};

export const sendMessageToGemini = async (
  history: Message[], 
  newMessage: { text?: string, audio?: string },
  persona?: { name: string; context: string }
): Promise<string> => {
  try {
    const ai = initializeGenAI();
    
    // Map internal history format to Gemini Chat history format
    const model = 'gemini-2.5-flash';

    let systemInstruction = `You are "Shadow", a secure communication assistant. 
    You prioritize privacy, security, and anonymity. 
    Your tone is professional, slightly cypherpunk, and concise.
    You help users with encryption, privacy advice, and general tasks.
    Do not mention you are an AI model developed by Google unless directly asked. 
    You are running in a local-first encrypted environment.`;

    // If a persona is provided, we switch to Digital Twin mode
    if (persona) {
      systemInstruction = `You are roleplaying as a user named "${persona.name}". 
      You are communicating over a secure, encrypted messaging app.
      Your personality/context is defined by this note: "${persona.context}".
      
      Rules:
      1. Stay in character completely. Do not break the fourth wall.
      2. Keep responses relatively short, like a real instant message.
      3. Use the tone described in the context.
      4. If the context is empty, act as a friendly, privacy-conscious friend.`;
    }

    const formattedHistory = history.map(h => {
      const parts: any[] = [];
      if (h.content) {
        parts.push({ text: h.content });
      }
      if (h.type === 'audio' && h.mediaData) {
        // We omit old audio blobs to save tokens unless strictly necessary
        if (h.content === '[Audio Message]') {
             // Placeholder for audio history logic
        }
      }
      return {
        role: h.role === 'model' ? 'model' : 'user',
        parts: parts
      };
    }).filter(msg => msg.parts.length > 0);

    const chat = ai.chats.create({
      model,
      config: {
        systemInstruction,
        temperature: persona ? 0.9 : 0.7, // Higher creativity for persona
      },
      history: formattedHistory
    });

    // Prepare current message parts
    const currentParts: any[] = [];
    if (newMessage.text) {
      currentParts.push({ text: newMessage.text });
    }
    if (newMessage.audio) {
      currentParts.push({
        inlineData: {
          mimeType: 'audio/webm', // Assuming webm from MediaRecorder
          data: newMessage.audio
        }
      });
    }

    // Send using the correct message format
    const result: GenerateContentResponse = await chat.sendMessage({
      content: { parts: currentParts }
    });

    return result.text || "No response received.";

  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Error: Secure channel negotiation failed. Please check your network or API credentials.";
  }
};