import MobileFrame from './components/MobileFrame'
import CustomerHome from './components/CustomerPrototype'

function App() {
  return (
    <div className="w-full h-screen">
      <MobileFrame>
        <CustomerHome />
      </MobileFrame>
    </div>
  )
}

export default App
