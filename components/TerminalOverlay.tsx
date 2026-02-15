import React, { useEffect, useState, useRef } from 'react';

interface TerminalOverlayProps {
  isVisible: boolean;
  logs: string[];
}

export const TerminalOverlay: React.FC<TerminalOverlayProps> = ({ isVisible, logs }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, isVisible]);

  if (!isVisible) return null;

  return (
    <div className="absolute bottom-10 left-10 right-10 h-64 bg-black/90 border border-green-500/50 rounded-lg shadow-[0_0_20px_rgba(0,255,0,0.2)] p-4 font-mono text-sm overflow-hidden z-40 backdrop-blur-md">
      <div className="flex justify-between items-center mb-2 border-b border-green-900/50 pb-2">
        <span className="text-green-500 font-bold tracking-wider">
          <i className="fa-solid fa-terminal mr-2"></i> OPSGHOST_TERMINAL // REMOTE_ACCESS
        </span>
        <div className="flex space-x-2">
            <div className="w-3 h-3 rounded-full bg-red-500/50"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500/50"></div>
            <div className="w-3 h-3 rounded-full bg-green-500/50"></div>
        </div>
      </div>
      <div className="h-full overflow-y-auto pb-8 custom-scrollbar">
        {logs.map((log, i) => (
          <div key={i} className="mb-1 text-green-400/90 whitespace-pre-wrap">
            <span className="text-green-700 mr-2">[{new Date().toLocaleTimeString()}]</span>
            <span className="text-blue-400 mr-2">$</span>
            {log}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};
