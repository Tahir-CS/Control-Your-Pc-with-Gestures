import React, { useState, useEffect } from 'react';

interface BrowserWindowProps {
  url: string;
  onUrlChange: (url: string) => void;
  children: React.ReactNode;
  onClose: () => void;
}

export const BrowserWindow: React.FC<BrowserWindowProps> = ({ url, onUrlChange, children, onClose }) => {
  const [inputValue, setInputValue] = useState(url);

  useEffect(() => {
    setInputValue(url);
  }, [url]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUrlChange(inputValue);
  };

  return (
    <div className="absolute top-10 left-20 right-20 bottom-24 bg-white rounded-lg shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-300 border border-gray-600">
      {/* Title Bar */}
      <div className="h-10 bg-gray-200 flex items-center px-4 justify-between border-b border-gray-300 select-none">
        <div className="flex items-center space-x-2">
           <div onClick={onClose} className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 cursor-pointer shadow-inner"></div>
           <div className="w-3 h-3 rounded-full bg-yellow-500 shadow-inner"></div>
           <div className="w-3 h-3 rounded-full bg-green-500 shadow-inner"></div>
        </div>
        <div className="flex-1 text-center text-xs text-gray-500 font-medium">
            New Tab - Google Chrome
        </div>
        <div className="w-16"></div> 
      </div>

      {/* Address Bar */}
      <div className="h-12 bg-white border-b border-gray-200 flex items-center px-4 space-x-4">
         <div className="flex space-x-4 text-gray-400">
             <i className="fa-solid fa-arrow-left hover:text-gray-600 cursor-pointer"></i>
             <i className="fa-solid fa-arrow-right hover:text-gray-600 cursor-pointer"></i>
             <i className="fa-solid fa-rotate-right hover:text-gray-600 cursor-pointer"></i>
         </div>
         <form onSubmit={handleSubmit} className="flex-1">
             <div className="bg-gray-100 rounded-full h-8 flex items-center px-4 border border-transparent focus-within:border-blue-500 focus-within:bg-white focus-within:shadow-sm transition-all">
                 <i className="fa-solid fa-lock text-xs text-gray-400 mr-2"></i>
                 <input 
                    type="text" 
                    className="flex-1 bg-transparent border-none outline-none text-sm text-gray-700 font-sans"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Search Google or type a URL"
                 />
                 <i className="fa-solid fa-star text-xs text-gray-400 ml-2 cursor-pointer hover:text-yellow-400"></i>
             </div>
         </form>
         <div className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs font-bold">
             OG
         </div>
      </div>

      {/* Content */}
      <div className="flex-1 relative bg-white overflow-hidden">
        {children}
      </div>
    </div>
  );
};

export const GoogleSearchMock: React.FC = () => {
    return (
        <div className="flex flex-col items-center justify-center h-full w-full bg-white select-none">
             <div className="mb-8">
                 <span className="text-6xl font-bold text-blue-500 tracking-tighter">G</span>
                 <span className="text-6xl font-bold text-red-500 tracking-tighter">o</span>
                 <span className="text-6xl font-bold text-yellow-500 tracking-tighter">o</span>
                 <span className="text-6xl font-bold text-blue-500 tracking-tighter">g</span>
                 <span className="text-6xl font-bold text-green-500 tracking-tighter">l</span>
                 <span className="text-6xl font-bold text-red-500 tracking-tighter">e</span>
             </div>
             <div className="w-[500px] h-12 rounded-full border border-gray-200 hover:shadow-md transition-shadow flex items-center px-4">
                 <i className="fa-solid fa-magnifying-glass text-gray-400 mr-4"></i>
                 <span className="text-gray-400">Search Google or type a URL</span>
                 <div className="flex-1"></div>
                 <i className="fa-solid fa-microphone text-blue-500 cursor-pointer"></i>
             </div>
             <div className="mt-8 flex space-x-4">
                 <button className="bg-gray-50 text-sm text-gray-600 px-4 py-2 rounded hover:shadow hover:bg-gray-100 border border-transparent">Google Search</button>
                 <button className="bg-gray-50 text-sm text-gray-600 px-4 py-2 rounded hover:shadow hover:bg-gray-100 border border-transparent">I'm Feeling Lucky</button>
             </div>
        </div>
    );
};