import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'tdesign-react'
import 'tdesign-react/es/style/index.css'
import { App } from './app/App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider globalConfig={{}}>
      <App />
    </ConfigProvider>
  </StrictMode>,
)
