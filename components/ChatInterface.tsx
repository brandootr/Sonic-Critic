
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Chat } from '@google/genai';
import { ChatMessage } from '../types';

interface ChatInterfaceProps {
  session: Chat;
  messages: ChatMessage[];
  onMessagesChange: (messages: ChatMessage[]) => void;
  isOpen: boolean;
  onClose: () => void;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ session, messages, onMessagesChange, isOpen, onClose }) => {
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  
  // Resizing state for the chat window itself
  const [dimensions, setDimensions] = useState({ width: 384, height: 600 });
  const [isResizing, setIsResizing] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Resize handler for the window
  const startResizing = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback((e: PointerEvent) => {
    if (!isResizing || !containerRef.current) return;
    const newWidth = window.innerWidth - e.clientX - 24;
    const newHeight = window.innerHeight - e.clientY - 24;
    setDimensions({
      width: Math.max(320, Math.min(newWidth, window.innerWidth - 48)),
      height: Math.max(400, Math.min(newHeight, window.innerHeight - 48))
    });
  }, [isResizing]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('pointermove', resize);
      window.addEventListener('pointerup', stopResizing);
    } else {
      window.removeEventListener('pointermove', resize);
      window.removeEventListener('pointerup', stopResizing);
    }
    return () => {
      window.removeEventListener('pointermove', resize);
      window.removeEventListener('pointerup', stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  /**
   * Resizes and compresses an image to prevent UI freezing
   * Targets max 800px dimension and JPEG 0.7 quality
   */
  const processAndResizeImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxDim = 800;

        if (width > height && width > maxDim) {
          height *= maxDim / width;
          width = maxDim;
        } else if (height > maxDim) {
          width *= maxDim / height;
          height = maxDim;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject('Could not get canvas context');
        
        ctx.drawImage(img, 0, 0, width, height);
        // Use image/jpeg with 0.7 quality for significant file size reduction
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
        resolve(compressedBase64);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject('Image load failed');
      };
      img.src = url;
    });
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setIsProcessingImage(true);
      try {
        const processed: string[] = [];
        for (const file of Array.from(files) as File[]) {
          const result = await processAndResizeImage(file);
          processed.push(result);
          // Yield to main thread to keep UI responsive
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        setSelectedImages(prev => [...prev, ...processed]);
      } catch (err) {
        console.error("Image processing failed:", err);
      } finally {
        setIsProcessingImage(false);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    
    if (imageFiles.length > 0) {
      setIsProcessingImage(true);
      try {
        const processed: string[] = [];
        for (const file of imageFiles) {
          const result = await processAndResizeImage(file);
          processed.push(result);
          // Yield to main thread
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        setSelectedImages(prev => [...prev, ...processed]);
      } catch (err) {
        console.error("Paste processing failed:", err);
      } finally {
        setIsProcessingImage(false);
      }
    }
  };

  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && selectedImages.length === 0) || isTyping || isProcessingImage) return;

    const userText = input.trim();
    const currentImages = [...selectedImages];
    
    setInput('');
    setSelectedImages([]);

    const newUserMessage: ChatMessage = { role: 'user', text: userText, images: currentImages.length > 0 ? currentImages : undefined };
    const updatedMessages = [...messages, newUserMessage];
    onMessagesChange(updatedMessages);
    setIsTyping(true);

    try {
      const parts: any[] = [];
      if (userText) parts.push({ text: userText });
      else if (currentImages.length > 0) parts.push({ text: "Analyze these screenshots in the context of my mix." });

      currentImages.forEach(img => {
        const base64Data = img.split(',')[1];
        const mimeType = img.split(';')[0].split(':')[1];
        parts.push({ inlineData: { data: base64Data, mimeType } });
      });

      const response = await session.sendMessageStream({ message: parts });
      let fullText = '';
      
      const newAiMessage: ChatMessage = { role: 'model', text: '' };
      onMessagesChange([...updatedMessages, newAiMessage]);

      for await (const chunk of response) {
        const textChunk = chunk.text || '';
        fullText += textChunk;
        onMessagesChange([...updatedMessages, { role: 'model', text: fullText }]);
      }
    } catch (error) {
      console.error('Chat error:', error);
      onMessagesChange([...updatedMessages, { role: 'model', text: 'Sorry, I encountered an error processing that request.' }]);
    } finally {
      setIsTyping(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      ref={containerRef}
      style={{ 
        width: `${dimensions.width}px`, 
        height: `${dimensions.height}px`,
        touchAction: 'none'
      }}
      className={`fixed bottom-6 right-6 bg-slate-900 border ${isResizing ? 'border-indigo-500 shadow-indigo-500/20' : 'border-slate-800'} rounded-3xl shadow-2xl flex flex-col z-[100] animate-in slide-in-from-bottom-10 duration-300 transition-colors`}
    >
      {/* Resize Handle - Top Left */}
      <div 
        onPointerDown={startResizing}
        className="absolute top-0 left-0 w-8 h-8 cursor-nwse-resize z-50 flex items-center justify-center group"
      >
        <div className="w-4 h-4 border-t-2 border-l-2 border-slate-700 group-hover:border-indigo-500 rounded-tl transition-colors m-2" />
      </div>

      <div className="p-4 pl-10 border-b border-slate-800 flex items-center justify-between bg-indigo-950/20 rounded-t-3xl select-none">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold">Mixing Engineer Chat</h3>
            <p className="text-[10px] text-slate-400">Vision & Library Aware</p>
          </div>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors p-1">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-10 px-4">
            <p className="text-slate-500 text-sm">Ask about your revision or paste/upload screenshots (EQ curves, plugins, analyzer) for visual feedback!</p>
          </div>
        )}
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-slate-800 text-slate-100 rounded-tl-none'}`}>
              {msg.images && msg.images.length > 0 && (
                <div className={`grid gap-2 mb-2 ${msg.images.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {msg.images.map((img, i) => (
                    <img key={i} src={img} alt="Attachment" className="rounded-lg w-full h-auto border border-white/10" />
                  ))}
                </div>
              )}
              <div className="whitespace-pre-wrap">{msg.text}</div>
            </div>
          </div>
        ))}
        {isTyping && messages.length > 0 && messages[messages.length-1].role === 'model' && messages[messages.length-1].text === '' && (
          <div className="flex justify-start">
            <div className="bg-slate-800 p-3 rounded-2xl rounded-tl-none flex space-x-1">
              <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSend} className="p-4 border-t border-slate-800 bg-slate-900/50 rounded-b-3xl">
        {(selectedImages.length > 0 || isProcessingImage) && (
          <div className="mb-3 flex flex-wrap gap-2 max-h-32 overflow-y-auto p-1">
            {selectedImages.map((img, idx) => (
              <div key={idx} className="relative group">
                <img src={img} alt="Preview" className="w-16 h-16 object-cover rounded-lg border-2 border-indigo-500 shadow-sm" />
                <button 
                  type="button"
                  onClick={() => removeImage(idx)}
                  className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 shadow-md hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ))}
            {isProcessingImage && (
              <div className="w-16 h-16 bg-slate-800 rounded-lg flex items-center justify-center animate-pulse border-2 border-dashed border-slate-700">
                <svg className="w-6 h-6 text-slate-600 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
            )}
          </div>
        )}
        
        <div className="flex items-center space-x-2">
          <button 
            type="button"
            disabled={isProcessingImage}
            onClick={() => fileInputRef.current?.click()}
            className={`p-2 rounded-xl border transition-all ${selectedImages.length > 0 ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:border-slate-600'} disabled:opacity-50`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>
          
          <div className="relative flex-1">
            <input
              type="text"
              value={input}
              onPaste={handlePaste}
              disabled={isProcessingImage}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isProcessingImage ? "Processing image..." : (selectedImages.length > 0 ? "Describe these..." : "Ask follow-up or paste...")}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2.5 px-4 pr-12 text-sm focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50"
            />
            <button 
              type="submit"
              disabled={isTyping || isProcessingImage}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-indigo-500 hover:text-indigo-400 p-1 disabled:opacity-50"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
              </svg>
            </button>
          </div>
        </div>
        
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleImageSelect} 
          className="hidden" 
          accept="image/*" 
          multiple
        />
      </form>
    </div>
  );
};

export default ChatInterface;
