import { useEffect, useState } from 'react'
import { RotateCcw, Save } from 'lucide-react'

import {
  DEFAULT_APP_PREFERENCES,
  loadAppPreferences,
  resetAppearancePreferences,
  saveAppPreferences,
  type AppPreferences,
} from '@/api/settings'
import { AccountPreferences } from '@/components/account/AccountPreferences'
import { FormField, FormSection } from '@/components/layout/FormScaffold'
import { PageSurface } from '@/components/layout/PageScaffold'
import { TabbedSettingsPage } from '@/components/layout/TabbedSettingsPage'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { MultiSelect } from '@/components/ui/multi-select'
import { Switch } from '@/components/ui/switch'
import { useMutationAction } from '@/lib/use-mutation-action'
import type { SessionUser } from '@/session/types'

type Tab = 'account' | 'general' | 'appearance'

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'account', label: '账号' },
  { key: 'general', label: '通用' },
  { key: 'appearance', label: '外观' },
]

const OWNER_OPTIONS = [
  { value: 'ops', label: '运营团队', description: '默认处理后台配置与日常发布', keywords: ['operation', 'owner'] },
  { value: 'growth', label: '增长团队', description: '负责活动、渠道和转化配置', keywords: ['marketing', 'growth'] },
  { value: 'support', label: '客服团队', description: '负责用户支持与工单流转', keywords: ['service', 'support'] },
]

const FEATURE_OPTIONS = [
  { value: 'audit-log', label: '审计日志', description: '记录关键配置变更' },
  { value: 'export', label: '数据导出', description: '开放后台 CSV 导出能力' },
  { value: 'webhook', label: 'Webhook', description: '业务事件推送到外部系统' },
  { value: 'beta-panel', label: '灰度面板', description: '控制实验功能开关' },
]

interface SettingsProps {
  user: SessionUser
  onAvatarUploaded?: (cacheBust: number) => void
}

export default function Settings({ user, onAvatarUploaded }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('account')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const { pending: savingPreferences, runConfirmedMutation: runSavePreferencesMutation } = useMutationAction()
  const { pending: resettingAppearance, runConfirmedMutation: runResetAppearanceMutation } = useMutationAction()
  const [preferences, setPreferences] = useState<AppPreferences>(DEFAULT_APP_PREFERENCES)

  useEffect(() => {
    let mounted = true
    loadAppPreferences()
      .then((stored) => {
        if (mounted) setPreferences(stored)
      })
      .catch((error: unknown) => {
        if (mounted) {
          setMessage({ type: 'error', text: error instanceof Error ? error.message : '系统偏好加载失败' })
        }
      })
    return () => {
      mounted = false
    }
  }, [])

  const updatePreferences = <K extends keyof AppPreferences>(key: K, value: AppPreferences[K]) => {
    setPreferences((current) => ({ ...current, [key]: value }))
  }

  const save = async () => {
    await runSavePreferencesMutation(() => saveAppPreferences(preferences), {
      confirm: {
        title: '保存系统偏好',
        description: '确认保存当前系统偏好? 仅保存站点展示、负责团队、能力开关和界面偏好等非敏感配置。',
        confirmText: '保存',
      },
      successMessage: '系统偏好已保存',
      errorMessage: '系统偏好保存失败',
      onSuccess: setPreferences,
    })
  }

  const resetAppearance = async () => {
    await runResetAppearanceMutation(() => resetAppearancePreferences(preferences), {
      confirm: {
        title: '恢复默认外观',
        description: '将关闭紧凑模式并重新启用页面动效。这个动作会覆盖当前外观偏好。',
        confirmText: '恢复默认',
        variant: 'destructive',
      },
      successMessage: '外观偏好已恢复默认',
      errorMessage: '外观偏好恢复失败',
      onSuccess: setPreferences,
    })
  }

  return (
    <TabbedSettingsPage
      title="设置"
      description="账号安全、头像与系统偏好的集中配置。"
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      indicatorId="settings-tabs"
      message={message}
      headerActions={
        <Button type="button" className="gap-2" onClick={save} disabled={savingPreferences}>
          <Save className="h-4 w-4" />
          {savingPreferences ? '保存中...' : '保存'}
        </Button>
      }
    >
      {activeTab === 'account' ? (
        <PageSurface title="账号安全" description="沿用旧顶栏的修改密码和修改头像能力，统一走用户 API 封装。">
          <AccountPreferences user={user} onAvatarUploaded={onAvatarUploaded} />
        </PageSurface>
      ) : null}

      {activeTab === 'general' ? (
        <PageSurface title="基本信息" description="展示名称与联系方式。">
          <FormSection className="sm:max-w-lg">
            <FormField label="站点名称" htmlFor="site-name" required>
              <Input id="site-name" value={preferences.siteName} onChange={(event) => updatePreferences('siteName', event.target.value)} />
            </FormField>
            <FormField label="联系邮箱" htmlFor="contact" description="用于系统通知、审计提醒和异常告警。">
              <Input id="contact" type="email" value={preferences.contact} onChange={(event) => updatePreferences('contact', event.target.value)} />
            </FormField>
            <FormField label="负责团队" description="可搜索的单选组件,替代原生 select。">
              <Combobox options={OWNER_OPTIONS} value={preferences.owner} onValueChange={(value) => updatePreferences('owner', value)} searchPlaceholder="搜索团队..." />
            </FormField>
            <FormField label="启用能力" description="可搜索的多选组件,适合标签、角色、能力开关等场景。">
              <MultiSelect options={FEATURE_OPTIONS} value={preferences.features} onValueChange={(value) => updatePreferences('features', value)} searchPlaceholder="搜索能力..." />
            </FormField>
          </FormSection>
        </PageSurface>
      ) : null}

      {activeTab === 'appearance' ? (
        <PageSurface
          title="界面偏好"
          description="影响布局密度与动效。"
          actions={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={resetAppearance}
              disabled={resettingAppearance}
            >
              <RotateCcw className="h-4 w-4" />
              {resettingAppearance ? '恢复中...' : '恢复默认'}
            </Button>
          }
        >
          <div className="space-y-4 sm:max-w-md">
            <label className="flex items-center justify-between gap-4 rounded-xl border border-border/70 px-4 py-3">
              <span>
                <span className="block text-sm font-medium">紧凑模式</span>
                <span className="block text-xs text-muted-foreground">收紧间距以容纳更多内容</span>
              </span>
              <Switch checked={preferences.compactMode} onCheckedChange={(checked) => updatePreferences('compactMode', checked)} />
            </label>
            <label className="flex items-center justify-between gap-4 rounded-xl border border-border/70 px-4 py-3">
              <span>
                <span className="block text-sm font-medium">页面动效</span>
                <span className="block text-xs text-muted-foreground">关闭后切换页面不再有过渡动画</span>
              </span>
              <Switch checked={preferences.animations} onCheckedChange={(checked) => updatePreferences('animations', checked)} />
            </label>
          </div>
        </PageSurface>
      ) : null}
    </TabbedSettingsPage>
  )
}
