// Boş adaptör yuvası B — ortam değişkenleri: AI_OLCUM_B_* (bkz. external-adapter.mjs).
import { ExternalAdapter } from './external-adapter.mjs'

export const createProvider = () => new ExternalAdapter('b')
