import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, Bot, User, Loader2, MessageSquare, ChevronDown, RefreshCw } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import apiClient from '../lib/api-client';
import { useAuth } from '../contexts/AuthContext';
import type { AgentChat, Agent } from '../lib/types';

interface ChatPanelProps {
  agent: Agent;
  isOpen: boolean;
  onClose: () => void;
  prefill?: string;
}

export default function ChatPanel({ agent, isOpen, onClose, prefill }: ChatPanelProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<AgentChat[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [queued, setQueued] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const userId = user?.uid || user?.id || 'anonymous';

  // Fetch chat history
  const fetchMessages = useCallback(async () => {
    try {
      setError(null);
      const msgs = await apiClient.agentChats.list(agent.id);
      setMessages(msgs);
      // Clear the 'queued' placeholder once an agent reply has arrived
      if (msgs.length > 0 && msgs[msgs.length - 1].role === 'agent') {
        setQueued(false);
      }
    } catch (err: any) {
      console.error('Failed to fetch chat messages:', err);
      if (err.message !== 'Not authenticated') {
        setError('Failed to load messages');
      }
    }
  }, [agent.id]);

  // Load messages when panel opens
  useEffect(() => {
    if (isOpen) {
      setMessages([]);
      fetchMessages();
      // Prefill input with task context if provided
      if (prefill) {
        setInputValue(prefill);
      }
      // Focus input
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, agent.id, fetchMessages, prefill]);

  // Poll for new messages every 3 seconds
  useEffect(() => {
    if (!isOpen) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    pollIntervalRef.current = setInterval(() => {
      fetchMessages();
    }, 3000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [isOpen, fetchMessages]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (autoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, autoScroll]);

  // Detect manual scroll to disable auto-scroll
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  }, []);

  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text || sending) return;

    setInputValue('');
    setSending(true);
    setError(null);
    setQueued(true);

    // Optimistically add user message
    const optimisticMsg: AgentChat = {
      id: `temp-${Date.now()}`,
      agentId: agent.id,
      userId,
      message: text,
      role: 'user',
      createdAt: new Date(),
    };
    setMessages(prev => [...prev, optimisticMsg]);

    try {
      const result = await apiClient.agentChats.send(agent.id, text);

      // Replace optimistic message with the persisted user message.
      // Agent replies arrive LATER via the closed loop (R2-3) — show a
      // subtle 'queued to agent loop' placeholder until then.
      setMessages(prev => {
        const filtered = prev.filter(m => m.id !== optimisticMsg.id);
        return [...filtered, result];
      });
    } catch (err: any) {
      console.error('Failed to send message:', err);
      setError(err.message || 'Failed to send message');
      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id));
      setInputValue(text); // Restore input
      setQueued(false);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setAutoScroll(true);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="fixed right-0 top-0 bottom-0 w-96 bg-white border-l border-slate-200 shadow-2xl z-50 flex flex-col"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-lg">
              {agent.emoji || '🤖'}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 truncate max-w-[180px]">
                {agent.name || 'Agent'}
              </h3>
              <p className="text-[10px] text-slate-500 flex items-center gap-1">
                <span className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  agent.status === 'online' ? 'bg-green-500' :
                  agent.status === 'busy' ? 'bg-amber-500' :
                  'bg-slate-300'
                )} />
                {agent.status || 'offline'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={fetchMessages}
              className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 transition-colors"
              title="Refresh messages"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 transition-colors"
              title="Close chat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-slate-50/50"
        >
          {loading && messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
                <p className="text-xs text-slate-400">Loading messages...</p>
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <MessageSquare className="w-10 h-10 text-slate-200 mb-3" />
              <p className="text-sm text-slate-500 font-medium">No messages yet</p>
              <p className="text-xs text-slate-400 mt-1 max-w-[200px]">
                Start a conversation with {agent.name || 'this agent'}
              </p>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    'flex gap-2 max-w-[85%]',
                    msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''
                  )}
                >
                  {/* Avatar */}
                  <div className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs',
                    msg.role === 'user'
                      ? 'bg-blue-100 text-blue-600'
                      : 'bg-slate-100 text-slate-600'
                  )}>
                    {msg.role === 'user' ? (
                      <User className="w-3.5 h-3.5" />
                    ) : (
                      <Bot className="w-3.5 h-3.5" />
                    )}
                  </div>

                  {/* Message bubble */}
                  <div className={cn(
                    'px-3 py-2 rounded-2xl text-sm',
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-tr-md'
                      : 'bg-white border border-slate-200 text-slate-700 rounded-tl-md shadow-sm'
                  )}>
                    <p className="whitespace-pre-wrap break-words">{msg.message}</p>
                    <p className={cn(
                      'text-[10px] mt-1',
                      msg.role === 'user' ? 'text-blue-200' : 'text-slate-400'
                    )}>
                      {msg.createdAt
                        ? new Date(msg.createdAt as any).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : ''}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </>
          )}

          {queued && (
            <div className="flex items-center gap-2 text-[10px] text-slate-400 italic px-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              queued to agent loop
            </div>
          )}

          {error && (
            <div className="text-center">
              <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-1.5 inline-block">
                {error}
              </p>
            </div>
          )}
        </div>

        {/* Scroll to bottom button */}
        {!autoScroll && messages.length > 0 && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-20 left-1/2 -translate-x-1/2 w-8 h-8 bg-white border border-slate-200 rounded-full shadow-md flex items-center justify-center hover:bg-slate-50 transition-colors"
          >
            <ChevronDown className="w-4 h-4 text-slate-600" />
          </button>
        )}

        {/* Input */}
        <div className="px-4 py-3 border-t border-slate-100 bg-white shrink-0">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${agent.name || 'agent'}...`}
              disabled={sending}
              className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || sending}
              className={cn(
                'p-2 rounded-xl transition-all shrink-0',
                inputValue.trim() && !sending
                  ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              )}
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
