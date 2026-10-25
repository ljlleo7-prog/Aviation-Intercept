import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import FpsCounter from './components/FpsCounter.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import './index.css'
import { applyDisplayPreferences, readDisplayPreferences } from './utils/displayPreferences.js'
import { initializeScenery } from './services/initializeScenery.js'

applyDisplayPreferences(readDisplayPreferences())

initializeScenery().then(() => ReactDOM.createRoot(document.getElementById('root')).render(
  React.createElement(React.StrictMode, null,
    React.createElement(AuthProvider, null,
      React.createElement(FpsCounter),
      React.createElement(App)
    )
  )
))
