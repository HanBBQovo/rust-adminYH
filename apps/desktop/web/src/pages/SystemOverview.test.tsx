import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import SystemOverview from '@/pages/SystemOverview'

describe('SystemOverview', () => {
  it('renders the migrated old overview information with template sections', () => {
    render(<SystemOverview />)

    expect(screen.getByRole('heading', { name: '系统概览' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '关于' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '技术栈' })).toBeInTheDocument()
    expect(screen.getByText('Tauri 2 + Rust sidecar')).toBeVisible()
    expect(screen.getByText('Rust Axum + SQLx MySQL')).toBeVisible()
    expect(screen.getByText('frontend-template layout/ui/theme 封装')).toBeVisible()
  })

  it('documents encapsulation and release gates without calling APIs', () => {
    render(<SystemOverview />)

    expect(screen.getByText(/业务页面不得直接 fetch/)).toBeVisible()
    expect(screen.getByText('CARGO_OFFLINE=true scripts/check-all.sh')).toBeVisible()
    expect(screen.getByText('RELEASE_GATE=true scripts/check-all.sh')).toBeVisible()
  })
})
