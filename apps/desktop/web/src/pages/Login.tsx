import { FormEvent, useState } from 'react'
import { Boxes, Loader2, LogIn } from 'lucide-react'

import { loginSession } from '@/api/auth'
import { ThemeToggleButton } from '@/components/theme'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BRAND_NAME, PRODUCT_SUBTITLE } from '@/config'
import { useAsyncAction } from '@/lib/use-async-action'
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
  const { pending: submitting, error, runAction: runLoginAction } = useAsyncAction()

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    await runLoginAction(
      () => loginSession({ name, password }),
      {
        errorMessage: '登录失败',
        onSuccess: (session) => {
          if (rememberName) {
            saveRememberedLoginName(name)
          } else {
            clearRememberedLoginName()
          }
          onAuthenticated(session)
        },
      },
    )
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
