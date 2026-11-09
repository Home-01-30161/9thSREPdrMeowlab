'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Send,
  Loader2,
  Lock,
  Sparkles,
  Bot,
  ShieldAlert,
  RefreshCw,
  Plus,
} from 'lucide-react';

interface AuthUser {
  name: string;
  email: string;
  picture?: string;
  provider?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

function formatChatTimestamp(dateInput?: string | Date): string {
  const d = dateInput ? new Date(dateInput) : new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear()).slice(-2);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${day}/${month}/${year} ${time}`;
}

function createMsgId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export interface ConversationItem {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface ChatbotProps {
  conversationId: string | null;
  user: AuthUser | null;
  onNewConversation: () => void;
  onConversationCreated?: (conv: ConversationItem) => void;
  onConversationUpdated?: (convId: string) => void;
}

export default function Chatbot({
  conversationId,
  user,
  onNewConversation,
  onConversationCreated,
  onConversationUpdated,
}: ChatbotProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isFirstMessage = useRef(true);
  const currentConvIdRef = useRef<string | null>(conversationId);

  // Load messages when conversationId changes
  useEffect(() => {
    // If the conversation is already the current active one in this component,
    // do NOT wipe or reload local state
    if (conversationId && conversationId === currentConvIdRef.current) {
      return;
    }
    currentConvIdRef.current = conversationId;

    if (!conversationId || !user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessages([]);
      return;
    }

    // If it's a brand-new unsaved conversation (starts with "new-")
    if (conversationId.startsWith('new-')) {
      isFirstMessage.current = true;
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: `Hello ${user.name}! I am Unsung Travel Assistant. Ask me anything about local transit tips, food, packing advice, or other recommendations for your upcoming trip!`,
          timestamp: formatChatTimestamp(),
        },
      ]);
      return;
    }

    // Load from Neon
    let ignore = false;
    setLoadingMessages(true);
    isFirstMessage.current = false;
    fetch(`/api/conversations/${conversationId}/messages`)
      .then((r) => r.json())
      .then((data) => {
        if (ignore) return;
        const fetched: ChatMessage[] = (data.messages ?? []).map(
          (m: { id: string; role: 'user' | 'assistant'; content: string; created_at: string }) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: formatChatTimestamp(m.created_at),
          })
        );
        if (fetched.length === 0) {
          isFirstMessage.current = true;
          setMessages([
            {
              id: 'welcome',
              role: 'assistant',
              content: `Hello ${user.name}! ✦ I am your Unsung Travel Assistant. Ask me anything about local transit tips, hidden food gems, packing advice, or safety recommendations for your upcoming trip!`,
              timestamp: formatChatTimestamp(),
            },
          ]);
        } else {
          setMessages(fetched);
        }
      })
      .catch(() => {
        if (!ignore) setMessages([]);
      })
      .finally(() => {
        if (!ignore) setLoadingMessages(false);
      });

    return () => {
      ignore = true;
    };
  }, [conversationId, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const saveMessage = useCallback(
    async (convId: string, role: 'user' | 'assistant', content: string, setTitle?: string) => {
      if (!convId || convId.startsWith('new-') || convId.startsWith('local-')) return;
      try {
        await fetch(`/api/conversations/${convId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role, content, title: setTitle }),
        });
      } catch {
        /* silently fail */
      }
    },
    []
  );

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || sending) return;

    const userMsg: ChatMessage = {
      id: createMsgId(),
      role: 'user',
      content: text,
      timestamp: formatChatTimestamp(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);

    let activeId = conversationId;
    const isNew = !activeId || activeId.startsWith('new-') || activeId.startsWith('local-');

    // 1. Auto-create conversation in Neon if not yet persisted (TEMPORARY: allow guest for testing)
    if (isNew && (user?.provider === 'google' || user?.provider === 'guest')) {
      try {
        const title = text.slice(0, 45);
        const res = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title }),
        });
        const data = await res.json();
        if (data.conversation?.id) {
          activeId = data.conversation.id;
          currentConvIdRef.current = activeId;
          onConversationCreated?.(data.conversation);
        }
      } catch (e) {
        console.warn('Auto-create conversation failed, continuing:', e);
      }
    }

    // Auto-title flag for existing conversations
    const isFirst = isFirstMessage.current;
    if (isFirst) isFirstMessage.current = false;

    // Save user message to Neon immediately
    if (activeId && !activeId.startsWith('new-') && !activeId.startsWith('local-')) {
      const titleForFirst = isFirst ? text.slice(0, 60) : undefined;
      saveMessage(activeId, 'user', text, titleForFirst).catch(() => { });
    }

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: messages
            .filter((m) => m.id !== 'welcome')
            .map((m) => ({ role: m.role, content: m.content })),
          conversationId: activeId,
        }),
      });

      const data = await res.json();

      const botMsg: ChatMessage = {
        id: createMsgId(),
        role: 'assistant',
        content: data.reply || 'No response received. Please try again.',
        timestamp: formatChatTimestamp(),
      };

      setMessages((prev) => [...prev, botMsg]);

      // 2. Automatically save assistant reply to Neon!
      if (activeId && !activeId.startsWith('new-') && !activeId.startsWith('local-')) {
        await saveMessage(activeId, 'assistant', botMsg.content);
        onConversationUpdated?.(activeId);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: createMsgId(),
          role: 'assistant',
          content: 'Connection issue. Please verify your internet connection and try again.',
          timestamp: formatChatTimestamp(),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const quickSuggestions = [
    'Tips to save money on local transit',
    'Best street food spots to try',
    'Cultural etiquette & dress code',
  ];

  // ─── NOT LOGGED IN WITH GOOGLE (TEMPORARY: allow guest for testing) ───
  if (!user || (user.provider !== 'google' && user.provider !== 'guest')) {
    return (
      <div className="h-full flex flex-col justify-between p-6 bg-[#f9fafb] text-slate-800 font-sans">
        <div className="space-y-6 pt-4 text-center">


          <div className="space-y-2">
            <h2 className="font-pixel font-bold text-xl text-slate-900 tracking-wide">
              GOOGLE LOGIN REQUIRED
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed max-w-xs mx-auto">
              To chat with the Unsung Travel Assistant, you must sign in with a verified Google account.
            </p>
          </div>



          <div className="pt-2 space-y-2">
            <a
              href="/api/auth/google"
              className="w-full bg-white  text-slate-900 border-2 border-black p-4 py-3 px-4 font-bold font-pixel text-sm flex items-center justify-center gap-2.5  transition cursor-pointer"
            >
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>LOG IN WITH GOOGLE</span>
            </a>

          </div>
        </div>
      </div>
    );
  }

  if (loadingMessages) {
    return (
      <div className="h-full flex items-center justify-center p-8 font-pixel text-slate-600">
        <Loader2 className="h-5 w-5 animate-spin mr-2 text-pink-500" />
        <span>LOADING CONVERSATION...</span>
      </div>
    );
  }

  if (!conversationId) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 p-8 text-center">
        <Bot className="h-10 w-10 text-pink-400" />
        <p className="font-pixel text-slate-600 text-sm">Select a chat or start a new one</p>
        <button
          type="button"
          onClick={onNewConversation}
          className="retro-btn-accent font-pixel px-4 py-2 text-sm font-bold flex items-center gap-2 cursor-pointer"
        >
          <Plus className="h-4 w-4" /> New Chat
        </button>
      </div>
    );
  }

  // ─── CHAT VIEW ───
  return (
    <div className="h-full flex flex-col bg-white text-slate-800 font-sans">

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50/50">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div className="flex items-center gap-1.5 mb-1 text-[10px] font-pixel text-slate-400">
              {m.role === 'user' ? (
                <>
                  <span>You</span>
                  <span>•</span>
                  <span>{m.timestamp}</span>
                </>
              ) : (
                <>
                  <Bot className="h-3 w-3 text-pink-600" />
                  <span className="text-pink-700 font-bold">AI Assistant</span>
                  <span>•</span>
                  <span>{m.timestamp}</span>
                </>
              )}
            </div>
            <div
              className={`max-w-[88%] text-xs p-3 leading-relaxed whitespace-pre-wrap shadow-sm border ${m.role === 'user'
                ? 'bg-zinc-900 text-white border-zinc-900 rounded-lg rounded-tr-none'
                : 'bg-white text-slate-800 border-slate-300 rounded-lg rounded-tl-none'
                }`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex items-center gap-2 p-2.5 bg-white border border-slate-200 rounded-md text-xs text-slate-500 font-pixel w-fit">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-pink-500" />
            <span>AI ASSISTANT IS TYPING...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>



      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="p-3 bg-white border-t-2 border-slate-300 flex items-center gap-2 shrink-0"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask travel question..."
          disabled={sending}
          className="flex-1 bg-[#f9fafb] border-2 border-slate-400 border-r-slate-200 border-b-slate-200 p-2 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-pink-500 font-sans shadow-inner disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!input.trim() || sending}
          className="retro-btn-accent font-pixel px-3 py-2 text-xs font-bold flex items-center gap-1 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          {sending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <>
              <span>SEND</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}
