import { FirebaseProvider } from './contexts/FirebaseContext'
import AppWrapper from './AppWrapper'

function App() {
  return (
    <FirebaseProvider>
      <AppWrapper />
    </FirebaseProvider>
  )
}

export default App