import { config } from '../config'
import type { Api } from './types'
import { createMockApi } from './mock'
import { createRealApi } from './real'

// The one place that decides which backend the app talks to.
export const api: Api = config.mock ? createMockApi() : createRealApi()

export type { Api } from './types'
export { chatEvents } from './sse'
export { ApiError, isRetryable } from './errors'
