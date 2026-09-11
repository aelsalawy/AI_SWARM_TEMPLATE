import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  MoreHorizontal,
  Plus,
  GripVertical,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Bug
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import apiClient from '../lib/api-client';
import type { Bug as BugType } from '../lib/types';

interface BugsBoardProps {
  bugs: BugType[];
  onBugClick?: (bug: BugType) => void;
  onStatusUpdate?: () => void;
}

// @ts-ignore
const TypedDroppable = Droppable as any;
// @ts-ignore
const TypedDraggable = Draggable as any;

export default function BugsBoard({ bugs, onBugClick, onStatusUpdate }: BugsBoardProps) {
  const columnOrder = ['Open', 'In Progress', 'Resolved', 'Closed'];
  // Local optimistic state to prevent drag-and-drop reversion
  const [optimisticBugs, setOptimisticBugs] = React.useState<BugType[]>(bugs);

  // Sync optimistic state when parent bugs change
  React.useEffect(() => {
    setOptimisticBugs(bugs);
  }, [bugs]);

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;

    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    // Map frontend display names to backend enum values
    const statusMap: Record<string, string> = {
      'Open': 'Open',
      'In Progress': 'In_Progress',
      'Resolved': 'Resolved',
      'Closed': 'Closed',
    };
    const newStatus = statusMap[destination.droppableId] || destination.droppableId;

    // Optimistic update: immediately update local state
    setOptimisticBugs(prev =>
      prev.map(b => b.id === draggableId ? { ...b, status: newStatus } : b)
    );

    try {
      await apiClient.bugs.update(draggableId, {
        status: newStatus,
      });
      // Refresh the list after successful update
      onStatusUpdate?.();
    } catch (error) {
      console.error('Failed to update bug status:', error);
      // Revert optimistic update on failure
      setOptimisticBugs(bugs);
    }
  };

  const getBugsByStatus = (status: string) => {
    // Map frontend display names to backend enum values
    const statusMap: Record<string, string[]> = {
      'Open': ['Open'],
      'In Progress': ['IN_PROGRESS', 'In Progress', 'In_Progress'],
      'Resolved': ['Resolved'],
      'Closed': ['Closed'],
    };
    const validStatuses = statusMap[status] || [status];
    return optimisticBugs.filter(b => validStatuses.includes(b.status));
  };

  const PRIORITY_COLORS: Record<string, string> = {
    'Low': 'bg-slate-50 text-slate-500',
    'Medium': 'bg-blue-50 text-blue-600',
    'High': 'bg-amber-50 text-amber-600',
    'Critical': 'bg-red-50 text-red-600',
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="h-full flex gap-4 overflow-x-auto overflow-y-hidden p-4"
      >
        {columnOrder.map((status) => {
          const columnBugs = getBugsByStatus(status);

          return (
            <div key={status} className="flex-1 min-w-0 max-w-[350px] flex flex-col h-full">
              <div className="flex items-center justify-between mb-3 px-1 text-slate-500 shrink-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest leading-none">{status}</h3>
                  <span className="bg-slate-200 text-slate-600 text-[9px] font-bold px-1.5 py-0.5 rounded-full">{columnBugs.length}</span>
                </div>
                <button className="p-1 hover:bg-slate-200 rounded">
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </button>
              </div>

              <TypedDroppable droppableId={status}>
                {(provided: any, snapshot: any) => (
                  <div
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                    className={cn(
                      "flex-1 flex flex-col gap-2 min-h-[100px] transition-colors rounded-lg p-1 overflow-y-auto",
                      snapshot.isDraggingOver ? "bg-slate-100/50 shadow-inner" : ""
                    )}
                  >
                    {columnBugs.map((bug, index) => (
                      <TypedDraggable key={bug.id} draggableId={bug.id} index={index}>
                        {(provided: any, snapshot: any) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            onClick={(e) => {
                              // Only trigger click if not dragging
                              if (!snapshot.isDragging && onBugClick) {
                                e.stopPropagation();
                                onBugClick(bug);
                              }
                            }}
                            className={cn(
                              "bg-white p-3 rounded-lg shadow-sm border border-slate-200 hover:border-red-400 transition-all cursor-grab group shrink-0",
                              snapshot.isDragging ? "shadow-2xl ring-2 ring-red-500/20 border-red-500 z-50 scale-[1.02]" : "hover:shadow-md",
                              status === 'In Progress' && !snapshot.isDragging && "border-l-4 border-l-blue-600",
                              status === 'Open' && !snapshot.isDragging && "border-l-4 border-l-red-600"
                            )}
                          >
                            <div className="flex justify-between items-start mb-2 pointer-events-none">
                              <span className="font-mono text-[8px] font-bold text-red-500">{bug.id.substring(0, 8)}...</span>
                              <GripVertical className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                            <h4 className="text-sm font-bold text-slate-900 mb-2 leading-snug pointer-events-none line-clamp-2">{bug.title}</h4>
                            {bug.description && (
                              <p className="text-[10px] text-slate-500 mb-2 pointer-events-none line-clamp-2">{bug.description}</p>
                            )}
                            <div className="flex items-center justify-between mt-auto pointer-events-none">
                              <div className={cn(
                                "flex items-center gap-1 text-[8px] font-bold uppercase px-1.5 py-0.5 rounded",
                                PRIORITY_COLORS[bug.priority as string] || 'bg-slate-50 text-slate-500'
                              )}>
                                <AlertTriangle className="w-3 h-3" />
                                {bug.priority}
                              </div>
                              <div className="flex items-center gap-1 text-[8px] text-slate-400">
                                <Bug className="w-3 h-3" />
                              </div>
                            </div>
                          </div>
                        )}
                      </TypedDraggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </TypedDroppable>
            </div>
          );
        })}
      </motion.div>
    </DragDropContext>
  );
}