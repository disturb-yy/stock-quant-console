import { Tabs } from 'tdesign-react'
import type { ReactNode } from 'react'

export interface ObjectTab {
  value: string
  label: string
  content: ReactNode
}

export function ObjectTabs({ tabs }: { tabs: ObjectTab[] }) {
  return (
    <Tabs className="object-tabs" defaultValue={tabs[0]?.value}>
      {tabs.map((tab) => (
        <Tabs.TabPanel key={tab.value} value={tab.value} label={tab.label}>
          {tab.content}
        </Tabs.TabPanel>
      ))}
    </Tabs>
  )
}
