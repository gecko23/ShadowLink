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
  newMessage: { text?: string, audio?: string }
): Promise<string> => {
  try {
    const ai = initializeGenAI();
    
    // Map internal history format to Gemini Chat history format
    const model = 'gemini-2.5-flash';

    const systemInstruction = `You are "Shadow", a secure communication assistant. 
    You prioritize privacy, security, and anonymity. 
    Your tone is professional, slightly cypherpunk, and concise.
    You help users with encryption, privacy advice, and general tasks.
    Do not mention you are an AI model developed by Google unless directly asked. 
    You are running in a local-first encrypted environment.`;

    const formattedHistory = history.map(h => {
      const parts: any[] = [];
      if (h.content) {
        parts.push({ text: h.content });
      }
      if (h.type === 'audio' && h.mediaData) {
        // Send previous audio as inline data if needed, or just text context
        // For history efficiency, we often just keep the text context if the model transcribed it,
        // but since we don't have transcription here yet, we'll omit old audio blobs to save tokens/bandwidth
        // unless strictly necessary. We'll rely on the text 'content' field being populated with a placeholder or transcript.
        if (h.content === '[Audio Message]') {
             // If we really wanted to resend audio context, we would add inlineData here.
             // parts.push({ inlineData: { mimeType: 'audio/webm', data: h.mediaData } });
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
        temperature: 0.7,
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