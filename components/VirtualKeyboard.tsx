import React, { useRef, useEffect } from 'react';

interface VirtualKeyboardProps {
  isVisible: boolean;
  onKeyPress: (key: string) => void;
  cursorPosition: { x: number; y: number };
  isHovering: boolean;
}

const keyboardLayout = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'BACK'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.'],
  ['SPACE', 'ENTER']
];

export const VirtualKeyboard: React.FC<VirtualKeyboardProps> = ({ 
  isVisible, 
  onKeyPress, 
  cursorPosition,
  isHovering 
}) => {
  const keyRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [hoveredKey, setHoveredKey] = React.useState<string | null>(null);

  useEffect(() => {
    if (!isVisible) return;

    // Detect which key is being hovered
    keyRefs.current.forEach((element, key) => {
      const rect = element.getBoundingClientRect();
      const isOver = cursorPosition.x >= rect.left && 
                     cursorPosition.x <= rect.right && 
                     cursorPosition.y >= rect.top && 
                     cursorPosition.y <= rect.bottom;
      
      if (isOver) {
        setHoveredKey(key);
      }
    });
  }, [cursorPosition, isVisible]);

  if (!isVisible) return null;

  const getKeyWidth = (key: string) => {
    if (key === 'SPACE') return 'w-96';
    if (key === 'ENTER' || key === 'BACK') return 'w-24';
    return 'w-14';
  };

  const getKeyLabel = (key: string) => {
    if (key === 'BACK') return '⌫';
    if (key === 'SPACE') return '␣ SPACE';
    if (key === 'ENTER') return '↵';
    return key;
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9998] flex justify-center pb-8 pointer-events-none">
      <div className="bg-black/95 backdrop-blur-xl border-2 border-cyan-500/50 rounded-2xl p-6 shadow-[0_0_50px_rgba(6,182,212,0.3)] animate-in slide-in-from-bottom duration-300">
        {/* Title Bar */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-cyan-500/30">
          <div className="flex items-center space-x-3">
            <i className="fa-solid fa-keyboard text-cyan-400 text-xl"></i>
            <span className="font-bold text-cyan-400 tracking-wider">VIRTUAL KEYBOARD</span>
          </div>
          <div className="text-xs text-gray-500 font-mono">
            PINCH TO TYPE
          </div>
        </div>

        {/* Keyboard Layout */}
        <div className="space-y-2">
          {keyboardLayout.map((row, rowIndex) => (
            <div key={rowIndex} className="flex justify-center space-x-2">
              {row.map((key) => (
                <button
                  key={key}
                  ref={(el) => {
                    if (el) keyRefs.current.set(key, el);
                  }}
                  onClick={() => onKeyPress(key)}
                  className={`
                    ${getKeyWidth(key)} h-12 
                    rounded-lg font-bold text-sm
                    transition-all duration-150 pointer-events-auto
                    ${hoveredKey === key 
                      ? 'bg-cyan-500 text-black scale-110 shadow-[0_0_20px_rgba(6,182,212,0.8)]' 
                      : 'bg-gray-800 text-white hover:bg-gray-700'
                    }
                    border-2 ${hoveredKey === key ? 'border-cyan-300' : 'border-gray-600'}
                    flex items-center justify-center
                  `}
                >
                  {getKeyLabel(key)}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Instruction */}
        <div className="mt-4 pt-3 border-t border-cyan-500/30 text-center">
          <p className="text-xs text-gray-400 font-mono">
            Hover over a key and <span className="text-cyan-400 font-bold">pinch</span> to type
          </p>
        </div>
      </div>
    </div>
  );
};
