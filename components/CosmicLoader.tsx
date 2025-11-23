import React from 'react';

const CosmicLoader: React.FC = () => {
  return (
    <div className="relative w-14 h-14 flex items-center justify-center overflow-hidden rounded-full bg-white/20 backdrop-blur-sm border border-white/30 shadow-inner">
      {/* Center Chaos */}
      <div className="absolute w-full h-full animate-spin-slow">
         {/* Layer 1: Teal Particles */}
         <div className="absolute top-0 left-0 w-full h-full animate-[spin_3s_linear_infinite]">
            <div className="absolute top-2 left-1/2 w-1.5 h-1.5 bg-teal-400 rounded-full blur-[1px]"></div>
            <div className="absolute bottom-3 right-3 w-1 h-1 bg-teal-300 rounded-full blur-[0.5px]"></div>
            <div className="absolute top-6 left-2 w-1 h-1 bg-teal-500 rounded-full opacity-60"></div>
         </div>

         {/* Layer 2: Blue Particles (Counter Rotate) */}
         <div className="absolute top-0 left-0 w-full h-full animate-[spin_4s_linear_infinite_reverse]">
            <div className="absolute bottom-2 left-1/2 w-1.5 h-1.5 bg-blue-400 rounded-full blur-[1px]"></div>
            <div className="absolute top-3 right-4 w-1 h-1 bg-blue-300 rounded-full"></div>
            <div className="absolute bottom-5 left-3 w-1 h-1 bg-indigo-400 rounded-full opacity-70"></div>
         </div>

         {/* Layer 3: Dense Cloud Core */}
         <div className="absolute top-1/2 left-1/2 w-8 h-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal-400/20 blur-md animate-pulse"></div>
      </div>

      {/* Swarming Dots */}
      <div className="absolute inset-0 animate-[spin_10s_linear_infinite]">
         <span className="absolute top-1 left-1/2 w-1 h-1 bg-teal-500 rounded-full opacity-50"></span>
         <span className="absolute top-4 left-1 w-1 h-1 bg-teal-300 rounded-full opacity-40"></span>
         <span className="absolute bottom-2 right-4 w-1.5 h-1.5 bg-teal-400 rounded-full blur-[1px] opacity-60"></span>
      </div>
      
      <div className="absolute inset-0 animate-[spin_7s_linear_infinite_reverse] scale-75">
         <span className="absolute bottom-1 left-1/2 w-1 h-1 bg-blue-400 rounded-full opacity-50"></span>
         <span className="absolute top-3 right-2 w-1 h-1 bg-indigo-300 rounded-full opacity-60"></span>
      </div>

      {/* Central Pulse */}
      <div className="relative z-10 w-2 h-2 bg-white rounded-full shadow-[0_0_10px_rgba(20,184,166,0.8)] animate-ping"></div>
    </div>
  );
};

export default CosmicLoader;