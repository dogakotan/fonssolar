// drive-gateway — Proje Kontrol dosya geçidi (Faz A iskeleti; DEPLOY EDİLMEDİ).
// Eylemler: ?action=upload (POST multipart), ?action=download (GET), ?action=provision_folders (POST JSON).
// Ayrıntı: ./README.md ve docs/proje-kontrol/tasarim.md Bölüm 4.5.
//
// Secret'lar (supabase secrets set ile; hiçbiri VITE_ önekli değil, hiçbiri repoda değil):
//   GOOGLE_SERVICE_ACCOUNT_JSON, DRIVE_SHARED_DRIVE_ID, MAX_UPLOAD_BYTES
// SUPABASE_URL ve SUPABASE_ANON_KEY Supabase tarafından otomatik sağlanır.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2.57.4'
import { createDriveClient, parseDriveConfig } from './driveClient.ts'
import { handleRequest } from './handler.ts'
import type { UserClient } from './handler.ts'

const getEnv = (key: string) => Deno.env.get(key)

Deno.serve(req => handleRequest(req, {
  getEnv,
  // Kullanıcının JWT'siyle — RLS ve SECURITY DEFINER RPC'lerin kendi yetki kontrolleri geçerli.
  // service_role burada KULLANILMAZ.
  createUserClient: authorization => createClient(getEnv('SUPABASE_URL')!, getEnv('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  }) as unknown as UserClient,
  parseDriveConfig,
  createDriveClient,
}))
