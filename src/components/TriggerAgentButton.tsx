import React from 'react';
import { Bot } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import apiClient from '../lib/api-client';

interface TriggerAgentButtonProps {
  agentId: string | null;
  taskType: 'task' | 'bug' | 'requirement';
  itemId: string;
  title?: string;
  description?: string;
  priority?: string;
  disabled?: boolean;
  onTriggered?: () => void;
}

export default function TriggerAgentButton({
  agentId,
  taskType,
  itemId,
  title,
  description,
  priority,
  disabled = false,
  onTriggered
}: TriggerAgentButtonProps) {
  const [isTriggering, setIsTriggering] = React.useState(false);
  const [showTooltip, setShowTooltip] = React.useState(false);

  const handleTrigger = async () => {
    if (!agentId || isTriggering || disabled) return;

    try {
      setIsTriggering(true);

      const result = await apiClient.agentTrigger.triggerAgent({
        agentId,
        taskType,
        itemId,
        title: title || 'Untitled',
        description: description || 'No description provided',
        priority: priority || 'Medium'
      });

      if (result.success) {
        onTriggered?.();
        alert(`✅ Agent ${agentId.replace('agent:', '')} has been triggered!`);
      } else {
        alert(`❌ Failed to trigger agent: ${result.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error triggering agent:', error);
      alert('❌ Failed to trigger agent. Please try again.');
    } finally {
      setIsTriggering(false);
    }
  };

  if (!agentId) {
    return null;
  }

  return (
    <div className="relative inline-block">
      <button
        onClick={handleTrigger}
        disabled={isTriggering || disabled}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all',
          isTriggering || disabled
            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
            : 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700 hover:shadow-lg hover:scale-105'
        )}
        title={`Trigger ${agentId.replace('agent:', '')} agent`}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {isTriggering ? (
          <>
            <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Triggering...
          </>
        ) : (
          <>
            <Bot className="w-3.5 h-3.5" />
            Trigger Agent
          </>
        )}
      </button>

      {/* Tooltip */}
      {showTooltip && !isTriggering && !disabled && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-800 text-white text-[10px] rounded-lg shadow-xl whitespace-nowrap z-50">
          Trigger {agentId.replace('agent:', '')} to work on this {taskType}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-800" />
        </div>
      )}
    </div>
  );
}