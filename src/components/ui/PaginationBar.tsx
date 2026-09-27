export type PaginationBarProps = {
  page: number
  pageSize: number
  total: number
  pageSizeOptions: readonly number[]
  loading?: boolean
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
  ariaLabel?: string
}

export function PaginationBar({
  page,
  pageSize,
  total,
  pageSizeOptions,
  loading = false,
  onPageChange,
  onPageSizeChange,
  ariaLabel = '分页',
}: PaginationBarProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(Math.max(page, 1), totalPages)

  return (
    <nav aria-label={ariaLabel} className="pagination-bar">
      <span className="pagination-summary">共 {total} 条</span>
      <label className="pagination-size">
        <span>每页</span>
        <select aria-label="每页条数" disabled={loading} onChange={(event) => onPageSizeChange(Number(event.target.value))} value={pageSize}>
          {pageSizeOptions.map((option) => <option key={option} value={option}>{option} 条</option>)}
        </select>
      </label>
      <button disabled={currentPage <= 1 || loading} onClick={() => onPageChange(currentPage - 1)} type="button">上一页</button>
      <label className="pagination-page">
        <select aria-label="页码" disabled={loading} onChange={(event) => onPageChange(Number(event.target.value))} value={currentPage}>
          {Array.from({ length: totalPages }, (_, index) => index + 1).map((option) => <option key={option} value={option}>第 {option} 页</option>)}
        </select>
        <span aria-live="polite">/ 共 {totalPages} 页</span>
      </label>
      <button disabled={currentPage >= totalPages || loading} onClick={() => onPageChange(currentPage + 1)} type="button">下一页</button>
    </nav>
  )
}
