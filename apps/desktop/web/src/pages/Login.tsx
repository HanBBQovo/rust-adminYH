import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Boxes, Loader2, LogIn, RefreshCw } from 'lucide-react'

import { fetchCaptchaCode, loginSession } from '@/api/auth'
import { ThemeToggleButton } from '@/components/theme'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BRAND_NAME, PRODUCT_SUBTITLE } from '@/config'
import { motion } from '@/lib/motion'
import { clearRememberedLoginName, readRememberedLoginName, saveRememberedLoginName } from '@/session/session-store'
import type { AdminSession } from '@/session/types'

interface LoginProps {
  onAuthenticated: (session: AdminSession) => void
}

export default function Login({ onAuthenticated }: LoginProps) {
  const [password, setPassword] = useState('')
  const [name, setName] = useState(() => readRememberedLoginName())
  const [rememberName, setRememberName] = useState(() => Boolean(readRememberedLoginName()))
  const [code, setCode] = useState('')
  const [captchaSvg, setCaptchaSvg] = useState('')
  const [captchaError, setCaptchaError] = useState('')
  const [captchaLoading, setCaptchaLoading] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const captchaSrc = captchaSvg ? `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(captchaSvg)}` : ''

  const refreshCaptcha = useCallback(async () => {
    setCaptchaError('')
    setCaptchaLoading(true)
    try {
      setCaptchaSvg(await fetchCaptchaCode())
    } catch {
      setCaptchaSvg('')
      setCaptchaError('验证码加载失败，可直接登录或稍后刷新')
    } finally {
      setCaptchaLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshCaptcha()
  }, [refreshCaptcha])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const trimmedCode = code.trim()
      const session = await loginSession({ name, password, ...(trimmedCode ? { code: trimmedCode } : {}) })
      if (rememberName) {
        saveRememberedLoginName(name)
      } else {
        clearRememberedLoginName()
      }
      onAuthenticated(session)
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-bg flex min-h-screen items-center justify-center px-4 py-10">
      <div className="fixed right-4 top-4 z-10">
        <ThemeToggleButton />
      </div>
      <motion.form
        onSubmit={handleSubmit}
        className="glass-card w-full max-w-sm rounded-2xl p-6"
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', bounce: 0.18, duration: 0.45 }}
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="dashboard-brand-mark flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Boxes className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{BRAND_NAME}</h1>
            <p className="text-sm text-muted-foreground">{PRODUCT_SUBTITLE}</p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="name">账号</Label>
          <Input
            id="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
            autoComplete="username"
            placeholder="请输入账号"
          />
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <Label htmlFor="password">密码</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            placeholder="请输入密码"
          />
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <Label htmlFor="code">验证码</Label>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Input
              id="code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoComplete="off"
              inputMode="text"
              placeholder="请输入验证码"
            />
            <Button
              type="button"
              variant="outline"
              className="h-10 gap-2 px-3"
              onClick={() => void refreshCaptcha()}
              disabled={captchaLoading}
              aria-label="刷新验证码"
            >
              {captchaLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="hidden sm:inline">刷新</span>
            </Button>
          </div>
          <div className="flex h-11 items-center rounded-md border bg-muted/40 px-3">
            {captchaSrc ? (
              <img src={captchaSrc} alt="验证码" className="h-10 w-[100px] rounded object-contain" />
            ) : (
              <span className="text-sm text-muted-foreground">
                {captchaLoading ? '验证码加载中...' : '验证码未加载'}
              </span>
            )}
          </div>
          {captchaError ? <div className="text-xs text-muted-foreground">{captchaError}</div> : null}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 text-sm">
          <label className="flex items-center gap-2 text-muted-foreground" htmlFor="remember-name">
            <Checkbox
              id="remember-name"
              checked={rememberName}
              onCheckedChange={(checked) => setRememberName(checked === true)}
            />
            记住账号
          </label>
          <span className="text-xs text-muted-foreground">不会保存密码</span>
        </div>

        {error ? <div className="mt-3 text-sm text-destructive">{error}</div> : null}

        <Button type="submit" className="mt-5 w-full gap-2" disabled={submitting || !name || !password}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          登录
        </Button>
      </motion.form>
    </div>
  )
}
