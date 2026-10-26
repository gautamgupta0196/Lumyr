import type { StreamlitState } from '@/stores/app-store'

export function shouldFallbackStreamlitRun(streamlit: Pick<StreamlitState, 'isRunning' | 'port'>): boolean {
  return !streamlit.isRunning || !streamlit.port
}
