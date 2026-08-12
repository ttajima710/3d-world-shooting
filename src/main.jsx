import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './net/net.js' // マルチプレイ通信コア（devでは window.__NET も公開）

// NOTE: StrictModeは意図的に外している — dev時の二重実行が
// R3Fの命令的オブジェクト（primitive + G.ship配線）と相性が悪いため（arwing_react踏襲）。
ReactDOM.createRoot(document.getElementById('root')).render(<App />)
