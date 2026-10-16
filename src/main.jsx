import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// StrictMode is left off on purpose: in dev it runs effects twice, which would double every live AI call.
createRoot(document.getElementById('root')).render(<App />);
