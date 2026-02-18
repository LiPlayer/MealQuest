import { User, MoreHorizontal, Disc, Signal, Wifi, Battery } from 'lucide-react';
import CustomerCardStack from './CustomerCardStack';
import CustomerBottomDock from './CustomerBottomDock';

export default function CustomerPrototype() {
    return (
        <div className="flex justify-center min-h-screen bg-gray-100 font-sans">
            {/* 
               Device Frame Removed. 
               Constrained to 375x812 to match Design Specs (Taro/iPhone X).
            */}
            <div className="relative w-[375px] h-[812px] bg-[#FAFAFA] text-gray-900 shadow-xl overflow-hidden">

                {/* Main App Content */}
                <div className="flex flex-col h-full relative">

                    {/* Fixed Top Layer (Z-50) */}
                    <div className="absolute top-0 left-0 right-0 z-40 bg-[#FAFAFA]/95 backdrop-blur-md shadow-sm">
                        {/* 顶部导航 (Top Nav) */}
                        <header className="px-6 pt-12 pb-2 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden border border-gray-100 shadow-sm relative">
                                    <User className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-gray-400" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-xs text-gray-500">欢迎光临</span>
                                </div>
                            </div>
                            {/* Mini Program Capsule Simulation (Simple, no notch) */}
                            <div className="flex items-center bg-white/60 backdrop-blur-md border border-gray-200/50 rounded-full px-3 py-1.5 gap-3 shadow-sm">
                                <MoreHorizontal size={18} className="text-gray-900" />
                                <div className="w-px h-4 bg-gray-300/50"></div>
                                <Disc size={18} className="text-gray-900" />
                            </div>
                        </header>

                        {/* 店铺招牌 (Shop Sign) - Fixed below Nav */}
                        <section className="px-6 py-4">
                            <div className="flex items-center gap-4">
                                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-400 to-red-500 shadow-lg flex items-center justify-center text-white text-xl font-bold">
                                    戏
                                </div>
                                <div>
                                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">有戏小馆</h1>
                                    <p className="text-sm text-gray-500 flex items-center gap-2 mt-1">
                                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                        营业中 · 好戏在后头
                                    </p>
                                </div>
                            </div>
                        </section>
                    </div>

                    {/* Scrollable Main Content (Z-0) */}
                    <div className="absolute inset-0 overflow-y-auto pt-[180px] pb-32 no-scrollbar">
                        {/* 卡片堆叠区 (Card Stack Area) */}
                        <CustomerCardStack />

                        {/* 策略活动区 (Strategy Event Area) */}
                        <div className="px-6 space-y-4 pb-6 mt-6">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">今日动态</p>

                            {/* Sample Strategy Card */}
                            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
                                <div className="w-12 h-12 rounded-lg bg-indigo-50 flex items-center justify-center">
                                    <span className="text-xl">🥡</span>
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-bold text-gray-800">午市特惠双人餐</h3>
                                    <p className="text-xs text-gray-500">限时 11:30 - 14:00</p>
                                </div>
                                <button className="px-3 py-1.5 bg-black text-white text-xs font-bold rounded-full">
                                    看看
                                </button>
                            </div>

                            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
                                <div className="w-12 h-12 rounded-lg bg-orange-50 flex items-center justify-center">
                                    <span className="text-xl">🏃</span>
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-bold text-gray-800">步数换美味</h3>
                                    <p className="text-xs text-gray-500">今日已走 8,420 步</p>
                                </div>
                                <button className="px-3 py-1.5 border border-gray-200 text-gray-600 text-xs font-bold rounded-full">
                                    兑换
                                </button>
                            </div>

                            {/* Long content filler to test scroll */}
                            <div className="h-40 bg-gray-100 rounded-xl flex items-center justify-center text-gray-400 text-sm">
                                更多精彩活动即将上线...
                            </div>
                        </div>
                    </div>

                    {/* 底部支付坞 (Payment Dock) */}
                    <div className="absolute bottom-0 w-full z-50">
                        <CustomerBottomDock />
                    </div>
                </div>
            </div>
        </div>
    );
}
