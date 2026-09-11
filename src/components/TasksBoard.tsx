import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  MoreHorizontal, 
  Plus, 
  GripVertical,
  AlertTriangle,
  Clock,
  CheckCircle2
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import apiClient from '../lib/api-client';
import type { Task } from '../lib/types';

interface TasksBoardProps {
  tasks: Task[];
  onTaskClick?: (task: Task) => void;
  onStatusUpdate?: () => void;
}

// @ts-ignore
const TypedDroppable = Droppable as any;
// @ts-ignore
const TypedDraggable = Draggable as any;

export default function TasksBoard({ tasks, onTaskClick, onStatusUpdate }: TasksBoardProps) {
  const columnOrder = ['To Do', 'In Progress', 'Review', 'Done'];
  // Local optimistic state to prevent drag-and-drop reversion
  const [optimisticTasks, setOptimisticTasks] = React.useState<Task[]>(tasks);

  // Sync optimistic state when parent tasks change
  React.useEffect(() => {
    setOptimisticTasks(tasks);
  }, [tasks]);

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
      'To Do': 'TODO',
      'In Progress': 'IN_PROGRESS',
      'Review': 'REVIEW',
      'Done': 'DONE',
    };
    const newStatus = statusMap[destination.droppableId] || destination.droppableId;
    
    // Optimistic update: immediately update local state
    setOptimisticTasks(prev =>
      prev.map(t => t.id === draggableId ? { ...t, status: newStatus } : t)
    );
    
    try {
      await apiClient.tasks.update(draggableId, {
        status: newStatus,
      });
      // Refresh the list after successful update
      onStatusUpdate?.();
    } catch (error) {
      console.error('Failed to update task status:', error);
      // Revert optimistic update on failure
      setOptimisticTasks(tasks);
    }
  };

  const getTasksByStatus = (status: string) => {
    // Map frontend display names to backend enum values
    const statusMap: Record<string, string[]> = {
      'To Do': ['TODO', 'To Do'],
      'In Progress': ['IN_PROGRESS', 'In Progress', 'In_Progress'],
      'Review': ['REVIEW', 'Review'],
      'Done': ['DONE', 'Done'],
    };
    const validStatuses = statusMap[status] || [status];
    return optimisticTasks.filter(t => validStatuses.includes(t.status));
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="h-full flex gap-4 overflow-x-auto overflow-y-hidden p-4"
      >
        {columnOrder.map((status) => {
          const columnTasks = getTasksByStatus(status);

          return (
            <div key={status} className="flex-1 min-w-0 max-w-[350px] flex flex-col h-full">
              <div className="flex items-center justify-between mb-3 px-1 text-slate-500 shrink-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest leading-none">{status}</h3>
                  <span className="bg-slate-200 text-slate-600 text-[9px] font-bold px-1.5 py-0.5 rounded-full">{columnTasks.length}</span>
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
                    {columnTasks.map((task, index) => (
                      <TypedDraggable key={task.id} draggableId={task.id} index={index}>
                        {(provided: any, snapshot: any) => (
                          <div 
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            onClick={(e) => {
                              // Only trigger click if not dragging
                              if (!snapshot.isDragging && onTaskClick) {
                                e.stopPropagation();
                                onTaskClick(task);
                              }
                            }}
                            className={cn(
                              "bg-white p-3 rounded-lg shadow-sm border border-slate-200 hover:border-blue-400 transition-all cursor-grab group shrink-0",
                              snapshot.isDragging ? "shadow-2xl ring-2 ring-blue-500/20 border-blue-500 z-50 scale-[1.02]" : "hover:shadow-md",
                              status === 'In Progress' && !snapshot.isDragging && "border-l-4 border-l-blue-600"
                            )}
                          >
                            <div className="flex justify-between items-start mb-2 pointer-events-none">
                              <span className={cn(
                                "font-mono text-[8px] font-bold",
                                status === 'In Progress' ? "text-blue-600" : "text-slate-400"
                              )}>{task.id.substring(0, 8)}...</span>
                              <GripVertical className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                            <h4 className="text-sm font-bold text-slate-900 mb-2 leading-snug pointer-events-none line-clamp-2">{task.title}</h4>
                            {task.epic && (
                              <div className="mb-2 inline-flex items-center px-1.5 py-0.5 rounded bg-slate-50 border border-slate-100 text-[8px] font-bold text-slate-400 uppercase tracking-tighter">
                                {task.epic}
                              </div>
                            )}
                            <div className="flex items-center justify-between mt-auto pointer-events-none">
                              <div className={cn(
                                "flex items-center gap-1 text-[8px] font-bold uppercase",
                                task.priority === 'Urgent' || task.priority === 'High' ? "text-red-500" : "text-slate-500"
                              )}>
                                <AlertTriangle className="w-3 h-3" />
                                {task.priority}
                              </div>
                              <div className="flex -space-x-1">
                                {task.agents && task.agents.map((agent: string, i: number) => (
                                  <img key={i} src={agent} className="w-4 h-4 rounded-full border-2 border-white bg-slate-100" />
                                ))}
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