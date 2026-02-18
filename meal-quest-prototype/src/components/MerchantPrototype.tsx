import React, { useState } from 'react';
import { Home, Notebook, Calculator, Store, ShieldCheck, User } from 'lucide-react';

// Components for different views
const DashboardView = () => (
    <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                <p className="text-xs text-gray-400 mb-1">今日实收</p>
                <div className="text-2xl font-bold text-gray-900">¥ 3,420.00</div>
                <div className="text-xs text-green-500 mt-2 flex items-center gap-1">
                    ↑ 12% <span className="text-gray-300">vs 昨日</span>
                </div>
            </div>
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                <p className="text-xs text-gray-400 mb-1">今日客单</p>
                <div className="text-2xl font-bold text-gray-900">142</div>
                <div className="text-xs text-gray-400 mt-2">单均 ¥24.0</div>
            </div>
        </div>

        {/* Asset Liability */}
        <div className="bg-gray-900 text-white p-6 rounded-3xl shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl -mr-16 -mt-16"></div>
            <h3 className="text-sm font-medium text-gray-400 mb-4 flex items-center gap-2">
                <ShieldCheck size={16} /> 资产负债看板
            </h3>
            <div className="space-y-4">
                <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-300">待兑付碎银</span>
                    <span className="font-mono text-xl font-bold">428,000 两</span>
                </div>
                <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-orange-500 w-[60%] rounded-full"></div>
                </div>
                <div className="flex justify-between items-center pt-2">
                    <span className="text-sm text-gray-300">流通中入席令</span>
                    <span className="font-mono text-xl font-bold">84 张</span>
                </div>
            </div>
        </div>

        {/* Campaign Inbox */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-gray-800">营销决策箱</h3>
                <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs font-bold rounded-full">2 待办</span>
            </div>
            <div className="space-y-3">
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-lg">☔</div>
                    <div className="flex-1">
                        <p className="text-sm font-bold text-gray-800">雨天慰问策略</p>
                        <p className="text-xs text-gray-500 mt-0.5">检测到未来 2 小时降雨，建议发送「避雨券」。</p>
                    </div>
                    <button className="self-center px-3 py-1.5 bg-black text-white text-xs rounded-lg">批准</button>
                </div>
            </div>
        </div>
    </div>
);

const ViewPlaceholder = ({ title }: { title: string }) => (
    <div className="flex flex-col items-center justify-center h-full text-gray-400">
        <Store className="w-12 h-12 mb-4 opacity-20" />
        <p>This is the {title} view.</p>
    </div>
);

export default function MerchantPrototype() {
    const [activeTab, setActiveTab] = useState('dashboard');

    return (
        <div className="flex flex-col h-full bg-[#f2f4f6]">
            {/* Header */}
            <header className="px-6 pt-12 pb-4 bg-white sticky top-0 z-30 shadow-sm">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-xl font-bold text-gray-900">有戏小馆 · 徐汇店</h1>
                        <p className="text-xs text-green-600 font-bold flex items-center gap-1 mt-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                            运营正常 (Online)
                        </p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                        <User className="w-4 h-4 text-gray-500" />
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto pb-24">
                {activeTab === 'dashboard' && <DashboardView />}
                {activeTab === 'financing' && <ViewPlaceholder title="账单 (Financing)" />}
                {activeTab === 'cashier' && <ViewPlaceholder title="收银 (Cashier)" />}
                {activeTab === 'studio' && <ViewPlaceholder title="装修 (Studio)" />}
                {activeTab === 'admin' && <ViewPlaceholder title="管理 (Admin)" />}
            </main>

            {/* Bottom Navigation */}
            <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 pb-safe pt-2 px-6 flex justify-between items-end z-50 h-[83px] max-w-md mx-auto">
                <TabItem
                    icon={<Home size={22} />}
                    label="经营"
                    isActive={activeTab === 'dashboard'}
                    onClick={() => setActiveTab('dashboard')}
                />
                <TabItem
                    icon={<Notebook size={22} />}
                    label="账单"
                    isActive={activeTab === 'financing'}
                    onClick={() => setActiveTab('financing')}
                />

                {/* Center Cashier Button */}
                <div className="relative -top-6">
                    <button
                        onClick={() => setActiveTab('cashier')}
                        className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all
                            ${activeTab === 'cashier'
                                ? 'bg-gray-900 text-white scale-110 shadow-xl'
                                : 'bg-black text-white hover:scale-105'}
                        `}
                    >
                        <Calculator size={24} />
                    </button>
                    <span className={`absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] font-bold mt-1 ${activeTab === 'cashier' ? 'text-gray-900' : 'text-gray-400'}`}>收银</span>
                </div>

                <TabItem
                    icon={<Store size={22} />}
                    label="装修"
                    isActive={activeTab === 'studio'}
                    onClick={() => setActiveTab('studio')}
                />
                <TabItem
                    icon={<ShieldCheck size={22} />}
                    label="管理"
                    isActive={activeTab === 'admin'}
                    onClick={() => setActiveTab('admin')}
                />
            </nav>
        </div>
    );
}

function TabItem({ icon, label, isActive, onClick }: { icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className={`flex flex-col items-center justify-center gap-1 w-12 pb-3 transition-colors ${isActive ? 'text-gray-900' : 'text-gray-400'}`}
        >
            <div className={`transition-transform duration-200 ${isActive ? 'scale-110' : 'scale-100'}`}>
                {icon}
            </div>
            <span className="text-[10px] font-bold">{label}</span>
        </button>
    );
}
