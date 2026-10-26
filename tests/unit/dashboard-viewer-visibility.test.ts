import fs from 'fs'
import { describe, expect, it } from 'vitest'

describe('DashboardViewer visibility handling', () => {
  const appSource = fs.readFileSync('src/App.tsx', 'utf-8')
  const viewerSource = fs.readFileSync('src/components/DashboardViewer.tsx', 'utf-8')

  it('passes mainView into DashboardViewer visibility and avoids legacy viewMode hidden toggles', () => {
    expect(appSource).toContain("const [mainView, setMainView] = useState<'dashboard' | 'files'>('dashboard')")
    expect(appSource).toContain('isVisible={true}')
    expect(appSource).not.toContain('viewMode !== \'dashboard\' && "hidden"')
  })

  it('gates auto-refresh on actual dashboard visibility', () => {
    expect(viewerSource).toContain('isVisible: boolean')
    expect(viewerSource).toContain('if (hasAutoRefreshedRef.current || !isVisible || !hasRenderableViewport())')
    expect(viewerSource).toContain('scheduleVisibleAutoRefresh()')
  })
})
