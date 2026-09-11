import { useEffect, useState } from 'react';
import apiClient from '../lib/api-client';
import type { AgentChat } from '../lib/types';

interface AgentChatPanelProps {
  agentId: string;
  prefill?: string;
  onClose: () => void;
}

export default function AgentChatPanel({ agentId, prefill, onClose }: AgentChatPanelProps) {
  const [chats, setChats] = useState<AgentChat[]>([]);
  const [draft, setDraft] = useState<string>(prefill ?? '');
  const [loading, setLoading] = useState<boolean>(true);
  const [sending, setSending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await apiClient.agents.chats(agentId);
        if (!cancelled) setChats(list);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load chat');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  const handleSend = async () => {
    const message = draft.trim();
    if (!message || sending) return;

    // Optimistic append
    const optimistic: AgentChat = {
      id: `local-${Date.now()}`,
      agentId,
      userId: '',
      message,
      role: 'user',
      createdAt: new Date(),
    };
    setChats((prev) => [...prev, optimistic]);
    setDraft('');
    setSending(true);
    setError(null);

    try {
      const saved = await apiClient.agents.sendChat(agentId, message);
      // Replace optimistic entry with the persisted record
      setChats((prev) => prev.map((c) => (c.id === optimistic.id ? saved : c)));
    } catch (e: any) {
      setError(e?.message || 'Failed to send message');
      // Remove the optimistic entry on failure
      setChats((prev) => prev.filter((c) => c.id !== optimistic.id));
      setDraft(message);
    } finally {
      setSending(false);
    }
  };

  const renderBubble = (chat: AgentChat) => {
    if (chat.role === 'user') {
      return (
        <div key={chat.id} className="flex justify-end">
          <div className="max-w-[75%] rounded-lg bg-slate-600 text-white px-3 py-2 text-sm">
            {chat.message}
          </div>
        </div>
      );
    }
    if (chat.role === 'agent') {
      return (
        <div key={chat.id} className="flex justify-start">
          <div className="max-w-[75%] rounded-lg bg-slate-100 text-slate-800 px-3 py-2 text-sm">
            {chat.message}
          </div>
        </div>
      );
    }
    // Fallback for unknown roles
    return (
      <div key={chat.id} className="flex justify-start">
        <div className="max-w-[75%] rounded-lg bg-slate-200 text-slate-600 px-3 py-2 text-sm italic">
          {chat.message}
        </div>
      </div>
    );
  };

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-slate-700">Agent Chat</h4>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 text-xs font-medium"
        >
          Close
        </button>
      </div>

      {prefill && (
        <div className="mb-2 rounded border-l-4 border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500 italic">
          &ldquo;{prefill}&rdquo;
        </div>
      )}

      <div className="space-y-2 max-h-64 overflow-y-auto mb-3">
        {loading ? (
          <p className="text-xs text-slate-400">Loading chat…</p>
        ) : chats.length === 0 ? (
          <p className="text-xs text-slate-400">No messages yet.</p>
        ) : (
          chats.map(renderBubble)
        )}
        {sending && (
          <p className="text-xs text-slate-400 italic">queued to agent loop…</p>
        )}
      </div>

      {error && <p className="text-xs text-red-500 mb-2">{error}</p>}

      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Type a message…"
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
        <button
          onClick={handleSend}
          disabled={sending || !draft.trim()}
          className="rounded-md bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </div>
    </div>
  );
}
