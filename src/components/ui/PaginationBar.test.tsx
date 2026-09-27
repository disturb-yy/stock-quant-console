import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PaginationBar } from './PaginationBar'

afterEach(() => cleanup())

describe('PaginationBar', () => {
  it('renders the shared summary and disables the first-page action', () => {
    render(<PaginationBar page={1} pageSize={10} pageSizeOptions={[10, 20]} total={25} onPageChange={vi.fn()} onPageSizeChange={vi.fn()} />)

    expect(screen.getByText('共 25 条')).toBeInTheDocument()
    expect(screen.getByText('/ 共 3 页')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '下一页' })).toBeEnabled()
  })

  it('reports page and page-size changes through the shared controls', () => {
    const onPageChange = vi.fn()
    const onPageSizeChange = vi.fn()
    render(<PaginationBar page={2} pageSize={10} pageSizeOptions={[10, 20]} total={25} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} />)

    fireEvent.change(screen.getByRole('combobox', { name: '页码' }), { target: { value: '3' } })
    fireEvent.change(screen.getByRole('combobox', { name: '每页条数' }), { target: { value: '20' } })

    expect(onPageChange).toHaveBeenCalledWith(3)
    expect(onPageSizeChange).toHaveBeenCalledWith(20)
  })
})
