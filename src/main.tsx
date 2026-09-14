import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'tdesign-react'
import 'tdesign-react/es/style/index.css'
import './styles.css'
import { App } from './app/App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider globalConfig={{}}>
      <App />
    </ConfigProvider>
  </StrictMode>,
)
