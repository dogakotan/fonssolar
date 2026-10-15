// Boş adaptör yuvası A — ortam değişkenleri: AI_OLCUM_A_* (bkz. external-adapter.mjs).
import { ExternalAdapter } from './external-adapter.mjs'

export const createProvider = () => new ExternalAdapter('a')
