import { Camera, KeyRound, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { currentUserAvatarUrl, updateUserPassword, uploadCurrentUserAvatar } from '@/api/users'
import { FormField, FormSection } from '@/components/layout/FormScaffold'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useGlobalToast } from '@/components/ui/use-global-toast'
import { useMutationAction } from '@/lib/use-mutation-action'
import type { SessionUser } from '@/session/types'

interface AccountPreferencesProps {
  user: SessionUser
  onAvatarUploaded?: (cacheBust: number) => void
}

const MAX_AVATAR_SIZE = 500 * 1024
const ALLOWED_AVATAR_TYPES = new Set(['image/jpeg', 'image/png'])

export function AccountPreferences({ user, onAvatarUploaded }: AccountPreferencesProps) {
  const { showToast } = useGlobalToast()
  const { pending: submittingPassword, runMutation: runPasswordMutation } = useMutationAction()
  const { pending: uploadingAvatar, runMutation: runAvatarMutation } = useMutationAction()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [avatarCacheBust, setAvatarCacheBust] = useState(() => Date.now())

  useEffect(() => {
    if (!passwordOpen) return
    setPassword('')
    setPasswordError('')
  }, [passwordOpen])

  const avatarUrl = useMemo(() => currentUserAvatarUrl(user.id, avatarCacheBust), [avatarCacheBust, user.id])

  const submitPassword = async () => {
    if (!password) {
      setPasswordError('密码不能为空！')
      return
    }
    await runPasswordMutation(() => updateUserPassword(user.id, { password }), {
      successMessage: '修改密码成功！',
      errorMessage: '修改密码失败！',
      onSuccess: () => setPasswordOpen(false),
    })
  }

  const uploadAvatar = async (file: File) => {
    if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
      showToast('error', '只能上传 jpg/png 文件！', { translate: false })
      return
    }
    if (file.size > MAX_AVATAR_SIZE) {
      showToast('error', '头像不能超过 500kb！', { translate: false })
      return
    }
    await runAvatarMutation(() => uploadCurrentUserAvatar(file), {
      successMessage: '上传头像成功！',
      errorMessage: '上传头像失败！',
      onSuccess: (result) => {
        setAvatarCacheBust(result.uploadedAt)
        onAvatarUploaded?.(result.uploadedAt)
      },
      onSettled: () => {
        if (fileInputRef.current) fileInputRef.current.value = ''
      },
    })
  }

  return (
    <>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar className="h-16 w-16 rounded-xl border" title={`${user.name} 头像`}>
            <AvatarImage src={avatarUrl} alt={`${user.name} 头像`} data-testid="account-avatar-image" />
            <AvatarFallback className="rounded-xl text-lg">{user.name.slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="truncate text-base font-semibold">{user.name}</div>
            <div className="text-sm text-muted-foreground">账号 ID：{user.id}</div>
            <div className="text-xs text-muted-foreground">头像上传兼容旧字段 avatar，限制 jpg/png 且不超过 500kb。</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png"
            className="hidden"
            aria-label="选择头像文件"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void uploadAvatar(file)
            }}
          />
          <Button type="button" variant="outline" className="gap-2" disabled={uploadingAvatar} onClick={() => fileInputRef.current?.click()}>
            <Camera className="h-4 w-4" />
            {uploadingAvatar ? '上传中...' : '修改头像'}
          </Button>
          <Button type="button" className="gap-2" onClick={() => setPasswordOpen(true)}>
            <KeyRound className="h-4 w-4" />
            修改密码
          </Button>
        </div>
      </div>

      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>修改密码</DialogTitle>
            <DialogDescription>沿用旧 adminYh 顶栏改密入口，只提交当前登录用户的新密码。</DialogDescription>
          </DialogHeader>
          <FormSection>
            <FormField htmlFor="current-user-password" label="新密码" required error={passwordError}>
              <Input
                id="current-user-password"
                aria-label="新密码"
                type="password"
                value={password}
                placeholder="请输入要修改的密码"
                onChange={(event) => {
                  setPassword(event.target.value)
                  setPasswordError('')
                }}
              />
            </FormField>
          </FormSection>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPasswordOpen(false)}>
              取消
            </Button>
            <Button type="button" className="gap-2" onClick={submitPassword} disabled={submittingPassword}>
              <Upload className="h-4 w-4" />
              {submittingPassword ? '提交中...' : '确定'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
