/**
 * @fileoverview Application entry point.
 * Initializes the React application, mounts the root component to the HTML DOM,
 * and loads global configurations such as styles and internationalization.
 */

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css' 
import './i18n.ts'

// Mount the application root. The non-null assertion operator (!) is used
// as the 'root' element is guaranteed to exist in index.html.
// React.StrictMode is enabled to highlight potential problems in the application during development.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)