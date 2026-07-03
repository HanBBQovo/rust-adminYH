import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import SystemOverview from '@/pages/SystemOverview'

describe('SystemOverview', () => {
  it('renders the migrated old overview information with template sections', () => {
    render(<SystemOverview />)

    expect(screen.getByRole('heading', { name: '系统概览' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '关于' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '运行架构' })).toBeInTheDocument()
    expect(screen.getByText('本机客户端 + 本地服务托管')).toBeVisible()
    expect(screen.getByText('统一兼容接口与权限校验')).toBeVisible()
    expect(screen.getByText('统一后台布局、主题和组件规范')).toBeVisible()
  })

  it('renders production-safe encapsulation and release gate copy without source paths', () => {
    render(<SystemOverview />)

    expect(screen.getByText(/接口访问、会话、偏好和本地文件能力都通过封装层处理/)).toBeVisible()
    expect(screen.getByText(/基础编译、单元测试、前端构建和静态契约检查/)).toBeVisible()
    expect(screen.getByText(/容器、浏览器、桌面包和打包后本地服务全链路验收/)).toBeVisible()
    expect(screen.queryByText(/src\//)).not.toBeInTheDocument()
    expect(screen.queryByText(/scripts\//)).not.toBeInTheDocument()
    expect(screen.queryByText(/fetch|axios|apiRequest/)).not.toBeInTheDocument()
  })
})
