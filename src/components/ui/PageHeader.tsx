import type { ReactNode } from 'react'

export type PageHeaderProps = {
  eyebrow?: string
  title: string
  description: string
  aside?: ReactNode
}

export function PageHeader({ eyebrow, title, description, aside }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {aside}
    </header>
  )
}
