import React from 'react';

interface MobileFrameProps {
    children: React.ReactNode;
}

const MobileFrame: React.FC<MobileFrameProps> = ({ children }) => {
    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
            {/* Mobile Device Mockup */}
            <div className="relative w-[375px] h-[812px] bg-white rounded-[60px] shadow-2xl overflow-hidden border-[12px] border-slate-800">
                {/* Status Bar */}
                <div className="h-11 bg-white flex items-center justify-between px-8 pt-4">
                    <span className="text-xs font-semibold">9:41</span>
                    <div className="flex gap-1">
                        <div className="w-4 h-2 bg-black rounded-full"></div>
                        <div className="w-2 h-2 bg-black rounded-full"></div>
                    </div>
                </div>

                {/* Mini Program Header */}
                <div className="h-12 bg-white flex items-center px-4 justify-between border-b border-slate-100">
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-slate-200 rounded-full overflow-hidden">
                            <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-purple-600" />
                        </div>
                        <span className="text-sm font-bold text-slate-800">餐餐有戏</span>
                    </div>
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-full px-2 py-1">
                        <div className="w-1.5 h-1.5 bg-slate-800 rounded-full"></div>
                        <div className="w-3 h-3 border-2 border-slate-800 rounded-full"></div>
                    </div>
                </div>

                {/* Content Area */}
                <div className="h-[calc(100%-100px)] overflow-y-auto bg-slate-50 relative">
                    {children}
                </div>

                {/* Home Indicator */}
                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-32 h-1 bg-slate-800 rounded-full opacity-20"></div>
            </div>
        </div>
    );
};

export default MobileFrame;
