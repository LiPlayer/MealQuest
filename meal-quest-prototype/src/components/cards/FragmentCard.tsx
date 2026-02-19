import React from 'react';
import { Layers, Puzzle, ArrowRight, Lock } from 'lucide-react';

interface FragmentCardProps {
    expanded: boolean;
    onExpand: () => void;
    onReference: React.RefObject<HTMLDivElement | null>;
    style?: React.CSSProperties;
}

export default function FragmentCard({ expanded, onExpand, onReference, style }: FragmentCardProps) {
    return (
        <div
            ref={onReference}
            style={style}
            className="relative w-full rounded-3xl overflow-hidden shadow-2xl aspect-[1.586/1] bg-white border border-gray-200 text-gray-900"
        >
            {/* Header Area */}
            <div
                className="card-header h-[30px] px-5 flex items-center justify-between shrink-0 cursor-pointer active:scale-[0.99] transition-transform"
                onClick={onExpand}
            >
                <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                        <Layers size={14} />
                    </div>
                    <span className="font-bold text-gray-800 text-[15px]">食福碎片</span>
                </div>

                {/* Simple count preview */}
                <div className="flex items-center gap-1">
                    <Puzzle size={12} className="text-gray-400" />
                    <span className="text-gray-600 font-bold text-sm">12</span>
                </div>
            </div>

            {/* Expanded Content Area */}
            <div className={`p-6 pt-2 transition-opacity duration-500 ${expanded ? 'opacity-100' : 'opacity-100'}`}>

                {/* Milestone Header */}
                <div className="mb-6 relative">
                    <div className="flex justify-between text-xs text-gray-400 mb-2 font-mono">
                        <span>0</span>
                        <span>10k</span>
                        <span>20k</span>
                    </div>
                    <div className="h-2 w-full bg-gray-100 rounded-full relative">
                        <div className="absolute top-0 left-0 h-full bg-blue-500 w-[42%] rounded-full"></div>
                        {/* Nodes */}
                        <div className="absolute -top-1 left-[50%] w-4 h-4 bg-white border-2 border-blue-200 rounded-full shadow-sm flex items-center justify-center">
                            <div className="w-1.5 h-1.5 bg-blue-200 rounded-full"></div>
                        </div>
                        <div className="absolute -top-1 right-0 w-4 h-4 bg-white border-2 border-gray-200 rounded-full shadow-sm flex items-center justify-center">
                            <Lock size={8} className="text-gray-300" />
                        </div>
                    </div>
                    <div className="absolute top-4 left-[50%] -translate-x-1/2 text-[10px] text-blue-500 font-bold mt-1">📦 食福碎片奖励</div>
                </div>

                {/* Synthesis Workbench */}
                <h3 className="font-bold text-gray-900 mb-4">合成工作台</h3>

                {/* Recipe: Scallion Noodles */}
                <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100 mb-4">
                    <div className="flex justify-between mb-4">
                        <span className="font-bold text-gray-800">招牌葱油拌面</span>
                        <span className="text-xs bg-black text-white px-2 py-0.5 rounded">推荐入门</span>
                    </div>

                    {/* Materials Row */}
                    <div className="flex justify-center gap-4 mb-6">
                        {/* Material 1: Owned */}
                        <div className="flex flex-col items-center gap-2">
                            <div className="w-14 h-14 bg-white rounded-xl shadow-sm border border-gray-200 flex items-center justify-center text-xl">
                                🍜
                            </div>
                            <span className="text-[10px] text-gray-500">细面 x2</span>
                        </div>
                        {/* Plus */}
                        <div className="self-center text-gray-300">+</div>
                        {/* Material 2: Missing */}
                        <div className="flex flex-col items-center gap-2">
                            <div className="w-14 h-14 bg-gray-100 rounded-xl border border-dashed border-gray-300 flex items-center justify-center text-xl opacity-50">
                                🧅
                            </div>
                            <span className="text-[10px] text-red-400 font-bold">缺葱花</span>
                        </div>
                        {/* Plus */}
                        <div className="self-center text-gray-300">+</div>
                        {/* Material 3: Owned */}
                        <div className="flex flex-col items-center gap-2">
                            <div className="w-14 h-14 bg-white rounded-xl shadow-sm border border-gray-200 flex items-center justify-center text-xl">
                                🧂
                            </div>
                            <span className="text-[10px] text-gray-500">酱油 x1</span>
                        </div>
                    </div>

                    {/* Action Button */}
                    <button className="w-full py-3 rounded-xl bg-gray-200 text-gray-400 font-bold text-sm flex items-center justify-center gap-2 cursor-not-allowed">
                        去集市找找 <ArrowRight size={14} />
                    </button>
                </div>

                {/* Grid of owned fragments minimal */}
                <div className="grid grid-cols-4 gap-2">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="aspect-square bg-white border border-gray-100 rounded-xl flex items-center justify-center text-xl relative">
                            ❔
                            <span className="absolute bottom-0 right-1 text-[8px] text-gray-400">x1</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
