import { useState } from 'react';
import CustomerPrototype from './components/CustomerPrototype';
import MerchantPrototype from './components/MerchantPrototype';

function App() {
  const [mode, setMode] = useState<'customer' | 'merchant'>('customer');

  return (
    <div className="w-full h-screen bg-white overflow-hidden">
      {/* Dev Toggle Switch */}
      <div className="fixed top-4 right-4 z-50 flex bg-white/90 backdrop-blur-md rounded-full p-1 shadow-lg border border-gray-200/50">
        <button
          onClick={() => setMode('customer')}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${mode === 'customer'
              ? 'bg-black text-white shadow-md'
              : 'text-gray-500 hover:text-gray-900'
            }`}
        >
          顾客端
        </button>
        <div className="w-px bg-gray-200 mx-1 h-5 self-center" />
        <button
          onClick={() => setMode('merchant')}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${mode === 'merchant'
              ? 'bg-black text-white shadow-md'
              : 'text-gray-500 hover:text-gray-900'
            }`}
        >
          商户端
        </button>
      </div>

      {mode === 'customer' ? <CustomerPrototype /> : <MerchantPrototype />}
    </div>
  );
}

export default App;
