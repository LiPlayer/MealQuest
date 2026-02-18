import { Scan, QrCode } from 'lucide-react';

export default function CustomerBottomDock() {
    return (
        <div className="fixed bottom-6 left-6 right-6 z-50 max-w-md mx-auto">
            {/* Crystal Dock Container */}
            <div className="bg-white/70 backdrop-blur-xl border border-white/40 shadow-xl rounded-2xl p-2 flex items-center gap-3 ring-1 ring-black/5">

                {/* Payment Main Button */}
                <button className="flex-1 bg-gradient-to-r from-gray-900 to-black text-white h-12 rounded-xl flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-transform">
                    <Scan className="w-5 h-5 text-orange-400" />
                    <span className="font-bold tracking-wide">双模收银</span>
                </button>

                {/* Secondary Action (if needed, or just decoration) */}
                <div className="w-12 h-12 bg-white/50 rounded-xl flex items-center justify-center cursor-pointer active:scale-95 transition-transform hover:bg-white/80">
                    <QrCode className="w-6 h-6 text-gray-700" />
                </div>
            </div>
        </div>
    );
}
