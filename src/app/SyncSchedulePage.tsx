import { useCallback, useEffect, useMemo, useState } from 'react'
import { ScheduleApiError, scheduleApi, type SyncSchedule } from '../api/syncSchedules'
import type { SyncTarget } from '../api/syncTasks'

const targetLabels: Record<SyncTarget, string> = {
  basic_info: '股票基础资料',
  daily_bars: '历史日线行情',
  all: '全部数据',
}

const runStatusLabels: Record<string, string> = {
  pending: '等待中', running: '执行中', retrying: '自动重试中', succeeded: '已成功', failed: '失败', skipped: '已跳过',
}

type ScheduleFormState = { target: SyncTarget; runAt: string; enabled: boolean }

const initialForm: ScheduleFormState = { target: 'basic_info', runAt: '02:00', enabled: true }

function formatTimestamp(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

function apiErrorMessage(error: unknown): string {
  if (error instanceof ScheduleApiError) {
    if (error.category === 'conflict') return error.message || '同一目标已有启用的同步计划'
    if (error.category === 'contract') return '服务响应不符合当前契约，暂时无法展示同步计划'
    if (error.category === 'validation') return error.message || '同步计划参数无效'
  }
  return '同步计划服务暂时不可用，请稍后重试'
}

function validateForm(form: ScheduleFormState): string | undefined {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.runAt)) return '请输入有效的每日执行时间，格式为 HH:mm'
  return undefined
}

function ScheduleForm({
  form, editing, saving, error, onChange, onClose, onSubmit,
}: {
  form: ScheduleFormState
  editing: boolean
  saving: boolean
  error?: string
  onChange: (value: ScheduleFormState) => void
  onClose: () => void
  onSubmit: () => void
}) {
  return <section className="schedule-drawer" role="dialog" aria-modal="true" aria-labelledby="schedule-form-title">
    <div className="drawer-heading"><div><p className="eyebrow">SCHEDULE CONFIG</p><h2 id="schedule-form-title">{editing ? '编辑同步计划' : '新建同步计划'}</h2></div><button className="text-button" onClick={onClose} type="button">关闭</button></div>
    <div className="schedule-form-fields">
      <label>同步目标<select aria-label="同步目标" onChange={(event) => onChange({ ...form, target: event.target.value as SyncTarget })} value={form.target}><option value="basic_info">股票基础资料</option><option value="daily_bars">历史日线行情</option><option value="all">全部数据</option></select></label>
      <label>每日执行时间<input aria-describedby="run-at-hint" aria-label="每日执行时间" onChange={(event) => onChange({ ...form, runAt: event.target.value })} placeholder="HH:mm" type="time" value={form.runAt} /></label>
      <p className="field-hint" id="run-at-hint">每天按 Asia/Shanghai 时区执行</p>
      <div className="readonly-field"><span>时区</span><strong>Asia/Shanghai（由系统决定）</strong></div>
      <label className="switch-field"><input aria-label="启用计划" checked={form.enabled} onChange={(event) => onChange({ ...form, enabled: event.target.checked })} type="checkbox" /><span>{form.enabled ? '启用计划' : '停用计划'}</span></label>
    </div>
    {error && <p className="inline-error" role="alert">{error}</p>}
    <div className="drawer-footer"><button className="secondary-button" onClick={onClose} type="button">取消</button><button className="primary-button" disabled={saving} onClick={onSubmit} type="button">{saving ? '保存中…' : '保存计划'}</button></div>
  </section>
}

function ScheduleList({
  items, loading, actionId, onEdit, onToggle, onDelete,
}: {
  items: SyncSchedule[]
  loading: boolean
  actionId: string | null
  onEdit: (schedule: SyncSchedule) => void
  onToggle: (schedule: SyncSchedule) => void
  onDelete: (schedule: SyncSchedule) => void
}) {
  if (loading) return <p className="state-message">正在加载同步计划…</p>
  if (items.length === 0) return <p className="state-message">暂无同步计划，请先新建一个每日计划。</p>
  return <div className="schedule-table-wrap"><table className="schedule-table"><caption className="sr-only">同步计划列表</caption><thead><tr><th>目标</th><th>每日执行时间</th><th>状态</th><th>下一次执行</th><th>操作</th></tr></thead><tbody>{items.map((schedule) => <tr key={schedule.schedule_id}><td data-label="目标">{targetLabels[schedule.target]}</td><td data-label="每日执行时间"><strong>{schedule.run_at}</strong><small>{schedule.timezone}</small></td><td data-label="状态"><span className={`status schedule-status-${schedule.enabled ? 'enabled' : 'disabled'}`}>{schedule.enabled ? '启用' : '停用'}</span></td><td data-label="下一次执行">{schedule.enabled ? formatTimestamp(schedule.next_run_at) : '—'}</td><td data-label="操作" className="row-actions"><button className="text-button" onClick={() => onEdit(schedule)} type="button">编辑</button><button className="text-button" disabled={actionId === schedule.schedule_id} onClick={() => onToggle(schedule)} type="button">{actionId === schedule.schedule_id ? '处理中…' : schedule.enabled ? '停用' : '启用'}</button><button className="text-button danger-action" disabled={actionId === schedule.schedule_id} onClick={() => onDelete(schedule)} type="button">删除</button></td></tr>)}</tbody></table></div>
}

function LatestScheduleRun({ schedule }: { schedule: SyncSchedule | null }) {
  return <section className="panel latest-panel" aria-labelledby="latest-schedule-run-title"><div className="section-heading"><div><p className="eyebrow">LATEST SCHEDULE RUN</p><h2 id="latest-schedule-run-title">最近一次执行</h2></div></div>{!schedule ? <p className="state-message">暂无执行记录。</p> : <div className="latest-result"><div><span className={`status status-${schedule.last_run_status ?? 'pending'}`}>{schedule.last_run_status ? runStatusLabels[schedule.last_run_status] : '暂无执行'}</span><strong>{targetLabels[schedule.target]}</strong></div><p>执行时间：{formatTimestamp(schedule.last_run_at)}　计划时间：{schedule.run_at}</p>{schedule.last_run_reason && <p className="failure-note">执行说明：{schedule.last_run_reason}</p>}{schedule.last_task_id && <a className="text-button inline-link" href="/">查看同步任务</a>}</div>}</section>
}

export function SyncSchedulePage() {
  const [items, setItems] = useState<SyncSchedule[]>([])
  const [pagination, setPagination] = useState({ page: 1, page_size: 10, total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [formError, setFormError] = useState<string>()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<SyncSchedule | null>(null)
  const [form, setForm] = useState<ScheduleFormState>(initialForm)
  const [saving, setSaving] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)

  const loadSchedules = useCallback(async (page: number) => {
    setLoading(true)
    setError(undefined)
    try {
      const response = await scheduleApi.listSchedules(page, 10)
      setItems(response.items)
      setPagination(response.pagination)
    } catch (reason) {
      setError(apiErrorMessage(reason))
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void loadSchedules(1) }, [loadSchedules])

  const latestSchedule = useMemo(() => items.reduce<SyncSchedule | null>((latest, item) => {
    if (!item.last_run_at) return latest
    if (!latest?.last_run_at || Date.parse(item.last_run_at) > Date.parse(latest.last_run_at)) return item
    return latest
  }, null), [items])
  const openCreate = () => { setEditing(null); setForm(initialForm); setFormError(undefined); setDrawerOpen(true) }
  const openEdit = (schedule: SyncSchedule) => { setEditing(schedule); setForm({ target: schedule.target, runAt: schedule.run_at, enabled: schedule.enabled }); setFormError(undefined); setDrawerOpen(true) }

  const save = async () => {
    const validationError = validateForm(form)
    if (validationError) { setFormError(validationError); return }
    setSaving(true); setFormError(undefined)
    try {
      const request = { target: form.target, frequency: 'daily' as const, run_at: form.runAt, timezone: 'Asia/Shanghai' as const, enabled: form.enabled }
      if (editing) await scheduleApi.updateSchedule(editing.schedule_id, request)
      else await scheduleApi.createSchedule(request)
      setDrawerOpen(false)
      await loadSchedules(pagination.page)
    } catch (reason) { setFormError(apiErrorMessage(reason)) } finally { setSaving(false) }
  }

  const toggle = async (schedule: SyncSchedule) => {
    setActionId(schedule.schedule_id); setError(undefined)
    try { await scheduleApi.updateSchedule(schedule.schedule_id, { enabled: !schedule.enabled }); await loadSchedules(pagination.page) } catch (reason) { setError(apiErrorMessage(reason)) } finally { setActionId(null) }
  }

  const remove = async (schedule: SyncSchedule) => {
    if (!window.confirm(`确认删除「${targetLabels[schedule.target]}」同步计划吗？历史同步任务不会被删除。`)) return
    setActionId(schedule.schedule_id); setError(undefined)
    try { await scheduleApi.deleteSchedule(schedule.schedule_id); await loadSchedules(pagination.page) } catch (reason) { setError(apiErrorMessage(reason)) } finally { setActionId(null) }
  }

  return <main className="app-shell"><header className="page-header"><div><p className="eyebrow">SCHEDULED SYNC</p><h1>同步计划管理</h1><p>定时计划会创建同步任务，具体任务状态可在 A 股数据同步中查看。</p></div><button aria-label="新建计划" className="primary-button" onClick={openCreate} type="button">＋ 新建计划</button></header>{error && <div className="error-banner" role="alert"><span>{error}</span><button className="text-button" onClick={() => void loadSchedules(pagination.page)} type="button">重新加载</button></div>}<section className="panel schedules-panel" aria-labelledby="schedules-title"><div className="section-heading"><div><p className="eyebrow">DAILY SCHEDULES</p><h2 id="schedules-title">计划列表</h2></div><span className="muted-text">共 {pagination.total} 条</span></div><ScheduleList actionId={actionId} items={items} loading={loading} onDelete={(schedule) => void remove(schedule)} onEdit={openEdit} onToggle={(schedule) => void toggle(schedule)} /></section><LatestScheduleRun schedule={latestSchedule} />{drawerOpen && <ScheduleForm editing={editing !== null} error={formError} form={form} saving={saving} onChange={setForm} onClose={() => setDrawerOpen(false)} onSubmit={() => void save()} />}</main>
}
