import { Card } from 'tdesign-react'
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
          <p className="page-description">{workspace}工作区已建立，等待后续业务能力接入。</p>
        </div>
      </section>
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
