import React from 'react';

interface DesktopEnvProps {
  onIconClick: (appName: string) => void;
}

export const DesktopEnv: React.FC<DesktopEnvProps> = ({ onIconClick }) => {
  return (
    <div className="absolute inset-0 w-full h-full overflow-hidden bg-gray-900 select-none">
      {/* Wallpaper - Abstract Tech Gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a]">
        <div className="absolute inset-0 opacity-20" 
             style={{ 
               backgroundImage: 'radial-gradient(circle at 50% 50%, #4f46e5 1px, transparent 1px)', 
               backgroundSize: '40px 40px' 
             }}>
        </div>
      </div>

      {/* Desktop Icons Grid */}
      <div className="absolute top-8 left-8 flex flex-col space-y-8">
        {/* Chrome Icon */}
        <div 
          onClick={() => onIconClick('Chrome')}
          className="group flex flex-col items-center w-24 cursor-pointer p-2 rounded hover:bg-white/10 transition-colors"
        >
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-lg relative overflow-hidden group-hover:scale-105 transition-transform">
             {/* Simple CSS Chrome Icon Mock */}
             <div className="absolute inset-0 bg-red-500 clip-path-top"></div>
             <div className="absolute inset-0 bg-green-500 clip-path-right"></div>
             <div className="absolute inset-0 bg-yellow-500 clip-path-left"></div>
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-blue-500 rounded-full border-4 border-white z-10"></div>
          </div>
          <span className="mt-2 text-white text-sm font-medium drop-shadow-md">Google Chrome</span>
        </div>

        {/* Terminal Icon */}
        <div className="group flex flex-col items-center w-24 cursor-pointer p-2 rounded hover:bg-white/10 transition-colors opacity-70">
           <div className="w-16 h-16 bg-gray-800 rounded-lg flex items-center justify-center shadow-lg border border-gray-600 group-hover:scale-105 transition-transform">
               <span className="text-green-500 font-mono font-bold text-xl">{'>_'}</span>
           </div>
           <span className="mt-2 text-white text-sm font-medium drop-shadow-md">Terminal</span>
        </div>
        
        {/* Folder Icon */}
        <div className="group flex flex-col items-center w-24 cursor-pointer p-2 rounded hover:bg-white/10 transition-colors opacity-70">
           <i className="fa-solid fa-folder text-5xl text-blue-300 drop-shadow-lg group-hover:scale-105 transition-transform"></i>
           <span className="mt-2 text-white text-sm font-medium drop-shadow-md">My Projects</span>
        </div>
      </div>

      {/* Taskbar */}
      <div className="absolute bottom-0 left-0 right-0 h-12 bg-gray-900/90 backdrop-blur-md border-t border-white/10 flex items-center px-4 justify-between z-10">
          <div className="flex items-center space-x-4">
              <div className="w-8 h-8 bg-blue-500 rounded flex items-center justify-center text-white cursor-pointer hover:bg-blue-400">
                  <i className="fa-brands fa-windows"></i>
              </div>
              <div className="h-full w-[1px] bg-white/10 mx-2"></div>
              <i className="fa-solid fa-magnifying-glass text-gray-400 hover:text-white cursor-pointer"></i>
              <i className="fa-regular fa-window-restore text-gray-400 hover:text-white cursor-pointer"></i>
          </div>
          <div className="flex items-center space-x-4 text-xs text-white/80">
               <i className="fa-solid fa-wifi"></i>
               <i className="fa-solid fa-volume-high"></i>
               <span>{new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
          </div>
      </div>
    </div>
  );
};