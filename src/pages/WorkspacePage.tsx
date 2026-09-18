import { Card } from 'tdesign-react'
import { Link } from 'react-router-dom'
import { ObjectTabs } from '../components/ObjectTabs'
import { EmptyState } from '../components/PageState'

const tabCopy = ['概览', '对象', '记录']

export function WorkspacePage({ workspace }: { workspace: string }) {
  return (
    <main className="page-container workspace-page">
      <section className="page-heading">
        <div>
          <p className="page-kicker">WORKSPACE / {workspace.toUpperCase()}</p>
          <h1>{workspace}</h1>
          <p className="page-description">{workspace === '研究' ? '从研究入口管理已经接入的可复核对象。' : `${workspace}工作区已建立，等待后续业务能力接入。`}</p>
        </div>
      </section>
      {workspace === '研究' ? (
        <section className="workspace-entry" aria-labelledby="workspace-stock-pool-heading">
          <div>
            <p className="workspace-entry__kicker">RESEARCH OBJECT</p>
            <h2 id="workspace-stock-pool-heading">股票池</h2>
            <p>创建、搜索并重新打开服务端保存的股票池。</p>
          </div>
          <Link className="workspace-entry__link" to="/research/stock-pools">打开股票池列表</Link>
        </section>
      ) : null}
      <Card className="workspace-card" bordered>
        <ObjectTabs
          tabs={tabCopy.map((label) => ({
            value: label,
            label,
            content: <EmptyState description={`${workspace}工作区的${label}内容将在对应 Feature 中接入。`} />,
          }))}
        />
      </Card>
    </main>
  )
}
