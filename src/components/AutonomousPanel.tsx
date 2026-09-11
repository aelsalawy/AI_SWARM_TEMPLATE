import React from 'react';
import { Bot, Construction } from 'lucide-react';

/**
 * AutonomousPanel — Stub
 *
 * The workflow engine and dispatcher have been removed (Firebase-dependent).
 * This component is temporarily disabled until a Prisma-native implementation
 * is built in a future phase.
 *
 * See: task cmtlb329 — Remove workflow engine placeholder code
 */
export default function AutonomousPanel() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-400">
      <Construction className="w-8 h-8 mx-auto mb-3 text-slate-300" />
      <h3 className="text-lg font-medium text-slate-600 mb-1">Autonomous Mode</h3>
      <p className="text-sm">
        The workflow engine and auto-dispatcher are being redesigned.
        <br />
        They will return in a future update with native PostgreSQL support.
      </p>
    </div>
  );
}