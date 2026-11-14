import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  return <p style={{ padding: 16 }}>Tribal Authentica — app scaffold. Screen 1 comes next.</p>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
