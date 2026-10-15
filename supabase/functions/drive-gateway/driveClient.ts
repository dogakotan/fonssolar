// Google Drive erişim katmanı — drive-gateway'in Drive'a giden TEK yolu.
// Faz A: yalnızca arayüz ve klasör şablonu; gerçek Drive API çağrısı YOK (TODO'lar Faz B, 3-9 Kas).
// Tasarım: docs/proje-kontrol/tasarim.md Bölüm 4.5 (Drive düzeni, dosya adı, secret listesi).
//
// Kurallar:
// - Servis hesabı anahtarı yalnızca edge function secret'ı GOOGLE_SERVICE_ACCOUNT_JSON'dan okunur
//   (asla VITE_ önekli değil, asla repoda değil).
// - Tarayıcıya hiçbir zaman Drive bağlantısı (webViewLink/webContentLink) verilmez; dosya
//   yalnızca downloadFile ile akış olarak iletilir.
// - Bu modül veritabanına DOKUNMAZ; yetki kontrolü çağıran handler'ın işidir.

export interface DriveConfig {
  serviceAccountJson: string
  sharedDriveId: string
}

export interface UploadInput {
  folderId: string
  name: string
  mimeType: string
  bytes: Uint8Array
  /** Drive appProperties'e yazılır; drive-sync ve Reconciliation dosyayı kayda bağlamak için kullanır. */
  appProperties?: Record<string, string>
}

export interface DownloadResult {
  body: ReadableStream<Uint8Array>
  mimeType: string
  sizeBytes: number | null
}

export interface DriveClient {
  uploadFile(input: UploadInput): Promise<{ fileId: string }>
  downloadFile(fileId: string): Promise<DownloadResult>
  /** Telafi adımı: kayıt açılamazsa yüklenen dosyayı siler (tasarım 4.5, test T19). */
  deleteFile(fileId: string): Promise<void>
  /** parentId altında name adlı klasör yoksa oluşturur; klasör kimliğini döner (idempotent). */
  ensureFolder(parentId: string, name: string): Promise<string>
}

export class DriveNotImplementedError extends Error {
  code = 'drive_not_implemented'
}

export class DriveRequestError extends Error {
  code = 'drive_error'
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/** İki secret da tanımlı değilse null döner; çağıran 501 drive_not_configured verir. */
export function parseDriveConfig(getEnv: (key: string) => string | undefined): DriveConfig | null {
  const serviceAccountJson = getEnv('GOOGLE_SERVICE_ACCOUNT_JSON')?.trim()
  const sharedDriveId = getEnv('DRIVE_SHARED_DRIVE_ID')?.trim()
  if (!serviceAccountJson || !sharedDriveId) return null
  return { serviceAccountJson, sharedDriveId }
}

// ── Klasör şablonu (tasarım 4.5) ────────────────────────────────────────────
// Klasör adları ASCII (Drive araması ve komut satırı için).
export const DISCIPLINE_FOLDERS: Record<string, string> = {
  general: 'Genel',
  mechanical: 'Mekanik',
  dc: 'DC',
  ac: 'AC',
  mv: 'OG',
  enh: 'ENH',
  civil: 'Insaat',
}

export const DOC_TYPE_FOLDERS: Record<string, string> = {
  drawing: 'Drawing',
  rfi: 'RFI',
  submittal: 'Submittal',
  // Tasarım 4.5 klasör ağacında "Material" var ama 4.2 documents.doc_type listesinde 'material' yok —
  // Faz B'de netleşecek açık nokta (bkz. CLAUDE.md "Proje Kontrol (Faz A)").
  material: 'Material',
  correspondence: 'Correspondence',
  report: 'Report',
  contract: 'Contract',
  minutes: 'Minutes',
  photo: 'Photo',
  other: 'Other',
}

export const ROOT_FOLDERS = ['00_Gelen_Kutusu', '01_Dokumanlar', '99_Arsiv'] as const

export interface FolderPlanEntry {
  /** project_drive_folders anahtarı; kök klasörler için discipline/doc_type null. */
  discipline: string | null
  docType: string | null
  path: string[]
}

/** Proje klasörü altında oluşturulacak tüm klasörlerin sıralı listesi (üst klasör önce). */
export function buildFolderPlan(projectFolderName: string): FolderPlanEntry[] {
  const plan: FolderPlanEntry[] = [{ discipline: null, docType: null, path: [projectFolderName] }]
  for (const root of ROOT_FOLDERS) {
    plan.push({ discipline: null, docType: null, path: [projectFolderName, root] })
  }
  for (const [discipline, disciplineFolder] of Object.entries(DISCIPLINE_FOLDERS)) {
    plan.push({ discipline, docType: null, path: [projectFolderName, '01_Dokumanlar', disciplineFolder] })
    for (const [docType, docFolder] of Object.entries(DOC_TYPE_FOLDERS)) {
      plan.push({ discipline, docType, path: [projectFolderName, '01_Dokumanlar', disciplineFolder, docFolder] })
    }
  }
  return plan
}

// ── İstemci ────────────────────────────────────────────────────────────────

export function createDriveClient(config: DriveConfig): DriveClient {
  // TODO(Faz B): servis hesabı JWT'si → OAuth2 access token
  //   - JSON.parse(config.serviceAccountJson) → client_email, private_key
  //   - RS256 imzalı JWT (scope: https://www.googleapis.com/auth/drive), aud: https://oauth2.googleapis.com/token
  //   - token'ı süresi dolana kadar modül seviyesinde önbellekle (isolate ömrü)
  //   - private_key asla loglanmaz
  void config
  const notImplemented = (op: string) =>
    Promise.reject(new DriveNotImplementedError(`Drive ${op} henüz uygulanmadı (Faz A iskeleti)`))

  return {
    uploadFile(_input) {
      // TODO(Faz B): POST https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true
      //   - metadata: { name, parents: [folderId], mimeType, appProperties }
      //   - büyük dosyalar için resumable oturum; Faz A ölçümüne göre parça boyutu
      //   - 429/5xx için üstel geri çekilmeli yeniden deneme; kalıcı hata → DriveRequestError(…, 502)
      return notImplemented('upload')
    },
    downloadFile(_fileId) {
      // TODO(Faz B): GET https://www.googleapis.com/drive/v3/files/{id}?alt=media&supportsAllDrives=true
      //   - response.body doğrudan akış olarak döndürülür (belleğe tamamen alınmaz)
      //   - dosya çöpteyse/yoksa 404 → DriveRequestError(…, 404)
      return notImplemented('download')
    },
    deleteFile(_fileId) {
      // TODO(Faz B): DELETE …/files/{id}?supportsAllDrives=true (Content manager rolü siler)
      return notImplemented('delete')
    },
    ensureFolder(_parentId, _name) {
      // TODO(Faz B): files.list q="'{parentId}' in parents and name='{name}' and
      //   mimeType='application/vnd.google-apps.folder' and trashed=false",
      //   corpora=drive, driveId=config.sharedDriveId, includeItemsFromAllDrives=true;
      //   yoksa files.create (mimeType folder, parents [parentId]).
      return notImplemented('ensureFolder')
    },
  }
}
