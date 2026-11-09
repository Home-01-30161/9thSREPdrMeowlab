'use client';

import { useEffect, useState, useCallback } from 'react';
import Chatbot from '@/components/chatbot';
import {
  Bot,
  Plus,
  Trash2,
  MessageSquare,
  Loader2,
  LogIn,
  History,
  Sparkles,
  ChevronLeft,
  RefreshCw,
} from 'lucide-react';

interface AuthUser {
  name: string;
  email: string;
  picture?: string;
  provider?: string;
}

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface SidebarProps {
  isOpen?: boolean;
  onToggle?: () => void;
}

export default function Sidebar({ isOpen: propIsOpen, onToggle: propOnToggle }: SidebarProps) {
  const [internalOpen, setInternalOpen] = useState(true);
  const isOpen = propIsOpen !== undefined ? propIsOpen : internalOpen;
  const toggle = propOnToggle || (() => setInternalOpen((prev) => !prev));

  const [user, setUser] = useState<AuthUser | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'chat' | 'history'>('chat');

  // Auth check
  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => setUser(d.user || null))
      .catch(() => setUser(null))
      .finally(() => setLoadingAuth(false));
  }, []);

  // TEMPORARY: allow guest for testing
  const isGoogleUser = user?.provider === 'google' || user?.provider === 'guest';

  // Fetch conversations when user changes or on mount
  useEffect(() => {
    if (!user || (user.provider !== 'google' && user.provider !== 'guest')) {
      return;
    }

    let ignore = false;
    fetch('/api/conversations')
      .then((res) => res.json())
      .then((data) => {
        if (ignore) return;
        const list: Conversation[] = data.conversations ?? [];
        setConversations(list);
        if (list.length > 0) {
          setActiveConvId((curr) => curr || list[0].id);
        } else {
          setActiveConvId((curr) => curr || 'new-session');
        }
      })
      .catch(() => {
        if (ignore) return;
        setConversations([]);
        setActiveConvId((curr) => curr || 'new-session');
      })
      .finally(() => {
        if (!ignore) setLoadingConvs(false);
      });

    return () => {
      ignore = true;
    };
  }, [user]);

  const refreshConversations = useCallback(async () => {
    if (!user || (user.provider !== 'google' && user.provider !== 'guest')) return;
    setLoadingConvs(true);
    try {
      const res = await fetch('/api/conversations');
      const data = await res.json();
      const list: Conversation[] = data.conversations ?? [];
      setConversations(list);
    } catch {
      // silently ignore
    } finally {
      setLoadingConvs(false);
    }
  }, [user]);

  const handleNewConversation = () => {
    setActiveConvId(`new-${Date.now()}`);
    setActiveTab('chat');
  };

  const handleConversationCreated = useCallback((newConv: Conversation) => {
    setConversations((prev) => [newConv, ...prev.filter((c) => c.id !== newConv.id)]);
    setActiveConvId(newConv.id);
  }, []);

  const handleConversationUpdated = useCallback((convId: string) => {
    setConversations((prev) => {
      const target = prev.find((c) => c.id === convId);
      if (!target) return prev;
      const updated = { ...target, updated_at: new Date().toISOString() };
      return [updated, ...prev.filter((c) => c.id !== convId)];
    });
  }, []);

  const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingId(id);
    try {
      await fetch(`/api/conversations?id=${id}`, { method: 'DELETE' });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConvId === id) {
        const remaining = conversations.filter((c) => c.id !== id);
        setActiveConvId(remaining.length > 0 ? remaining[0].id : 'new-session');
      }
    } catch {
      /* silently fail */
    } finally {
      setDeletingId(null);
    }
  };

  const handleSelectConversation = (id: string) => {
    setActiveConvId(id);
    setActiveTab('chat');
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = String(d.getFullYear()).slice(-2);
    return `${day}/${month}/${year}`;
  };

  const activeConv = conversations.find((c) => c.id === activeConvId);

  return (
    <>
      {/* ─── 1. Collapsed Floating Trigger Tab (Visible when closed) ─── */}
      {!isOpen && (
        <button
          type="button"
          onClick={toggle}
          className="fixed top-24 left-3 z-40 retro-btn bg-pink-100 hover:bg-pink-200 border-2 border-slate-700 shadow-[3px_3px_0px_#1e1b4b] font-pixel text-xs font-bold py-2 px-3 flex items-center gap-2 cursor-pointer transition transform hover:scale-105 active:translate-x-0.5 active:translate-y-0.5"
          title="Open Travel Assistant Sidebar"
          aria-label="Open Travel Assistant"
        >
          <Bot className="h-4 w-4 text-zinc-600 animate-pulse" />
          <span className="text-slate-800">TravelAssist</span>
          <span className="text-zinc-600 font-bold">▶</span>
        </button>
      )}

      {/* ─── 2. Mobile / Tablet Backdrop Overlay (Closes drawer on outside click) ─── */}
      {isOpen && (
        <div
          onClick={toggle}
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-35 xl:hidden cursor-pointer"
          aria-label="Close sidebar backdrop"
        />
      )}

      {/* ─── 3. Single Responsive Retro-Window Sidebar Box ─── */}
      <aside
        aria-label="Travel Assistant Sidebar"
        className={`fixed top-0 left-0 h-full w-87.5 max-w-[calc(100vw-20px)] z-40 p-2 sm:p-2.5 flex flex-col transition-transform duration-300 ease-in-out pointer-events-none ${isOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
      >
        <div className="retro-window h-full flex flex-col shadow-2xl overflow-hidden pointer-events-auto bg-white border-2 border-slate-700">
          {/* A. Retro Title Bar */}
          <div className="retro-window-header px-3 py-2 flex items-center justify-between select-none shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <Bot className="h-4 w-4 text-zinc-900 shrink-0" />
              <span className="font-pixel font-bold text-xs sm:text-sm text-slate-900 tracking-wider truncate">
                Unsung Planner Assistant
              </span>
            </div>
            {/* Window Controls: Minimize, Collapse, Close */}
            <div className="flex items-center gap-1 shrink-0">

              <button
                type="button"
                onClick={toggle}
                className="w-5 h-5 retro-btn text-[10px] font-bold flex items-center justify-center leading-none text-red-600 hover:bg-red-100 cursor-pointer"
                title="Close Sidebar"
              >
                ✕
              </button>
            </div>
          </div>

          {/* C. Navigation & Actions Bar (Chat / History tabs + New Chat button) */}
          <div className="bg-slate-200/80 border-b border-slate-300 px-2 py-1.5 flex items-center justify-between gap-1 shrink-0 select-none">
            {/* Tabs */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setActiveTab('chat')}
                className={`px-2.5 py-1 text-xs font-pixel font-bold flex items-center gap-1.5 transition cursor-pointer ${activeTab === 'chat'
                  ? 'bg-white text-zinc-900 border-2 border-slate-600 shadow-[1px_1px_0px_#000]'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-300/60'
                  }`}
              >
                <MessageSquare className="h-3 w-3" />
                <span>Chat</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('history')}
                disabled={!isGoogleUser}
                className={`px-2 py-1 text-xs font-pixel font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${activeTab === 'history'
                  ? 'bg-white text-zinc-800 border-2 border-slate-600 shadow-[1px_1px_0px_#000]'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-300/60'
                  }`}
              >
                <History className="h-3 w-3" />
                <span>History</span>
                {conversations.length > 0 && (
                  <span className="bg-purple-200 text-zinc-900 text-[9px] px-1 rounded-sm">
                    {conversations.length}
                  </span>
                )}
              </button>
            </div>

            {/* New Chat Button */}
            <button
              type="button"
              onClick={handleNewConversation}
              disabled={!isGoogleUser}
              className="retro-btn-accent font-pixel text-[11px] font-bold px-2 py-1 flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
              title="Start New Conversation"
            >
              <span>+ New</span>
            </button>
          </div>

          {/* E. Main Content: Chat OR Saved History List */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {activeTab === 'chat' ? (
              /* ── CHAT VIEW ── */
              <div className="flex-1 overflow-hidden">
                <Chatbot
                  conversationId={activeConvId}
                  user={user}
                  onNewConversation={handleNewConversation}
                  onConversationCreated={handleConversationCreated}
                  onConversationUpdated={handleConversationUpdated}
                />
              </div>
            ) : (
              /* ── SAVED CONVERSATIONS HISTORY VIEW ── */
              <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
                <div className="p-2.5 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
                  <span className="font-pixel text-xs text-slate-700 font-bold uppercase tracking-wider flex items-center gap-1">
                    <Sparkles className="h-3.5 w-3.5 text-zinc-600" />
                    Saved Conversations
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-pixel text-[10px] text-slate-400">
                      {conversations.length} total
                    </span>
                    <button
                      type="button"
                      onClick={() => refreshConversations()}
                      className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-zinc-700 transition cursor-pointer"
                      title="Refresh conversations list"
                    >
                      <RefreshCw className={`h-3 w-3 ${loadingConvs ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-slate-200">
                  {loadingConvs ? (
                    <div className="flex flex-col items-center justify-center p-8 gap-2 font-pixel text-xs text-slate-500">
                      <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
                      <span>Loading history...</span>
                    </div>
                  ) : conversations.length === 0 ? (
                    <div className="p-6 text-center text-xs font-pixel text-slate-400 space-y-2">
                      <MessageSquare className="h-8 w-8 mx-auto text-slate-300" />
                      <p className="font-bold text-slate-600">No saved chats yet.</p>
                      <p className="text-[10px]">Start your first conversation with the assistant!</p>
                      <button
                        type="button"
                        onClick={handleNewConversation}
                        className="retro-btn-accent font-pixel text-xs px-3 py-1.5 mt-2 cursor-pointer inline-flex items-center gap-1"
                      >
                        <Plus className="h-3 w-3" /> Start Chat
                      </button>
                    </div>
                  ) : (
                    conversations.map((conv) => {
                      const isActive = activeConvId === conv.id;
                      return (
                        <div
                          key={conv.id}
                          onClick={() => handleSelectConversation(conv.id)}
                          className={`group flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition border-l-3 ${isActive
                            ? 'bg-zinc-100/70 border-l-zinc-600'
                            : 'bg-white hover:bg-slate-100/80 border-l-transparent hover:border-l-zinc-400'
                            }`}
                        >
                          <MessageSquare
                            className={`h-4 w-4 shrink-0 ${isActive ? 'text-zinc-600' : 'text-slate-400 group-hover:text-zinc-600'
                              }`}
                          />
                          <div className="flex-1 min-w-0">
                            <p
                              className={`text-xs font-pixel truncate ${isActive ? 'text-zinc-900 font-bold' : 'text-slate-800'
                                }`}
                            >
                              {conv.title}
                            </p>
                            <p className="text-[10px] font-pixel text-slate-400 mt-0.5">
                              {formatDate(conv.updated_at)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteConversation(conv.id, e)}
                            disabled={deletingId === conv.id}
                            className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xs transition cursor-pointer disabled:opacity-40"
                            title="Delete conversation"
                          >
                            {deletingId === conv.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
