// Satın alma talep kodu artık purchase_requests.request_no kolonunda sunucu
// tarafında (atomik, yıl-bazlı sayaç ile) üretiliyor — bkz.
// create_purchase_request_with_items RPC'si. Buradaki fallback yalnızca eski/
// beklenmedik biçimde request_no'su boş gelen bir kayıt için son çare; asla
// gerçek bir kod üretim mekanizması olarak güvenilmemeli (önceki hali UUID'nin
// son birkaç karakterinden türetiyordu, bu da farklı taleplerde aynı kodun
// tekrarlanmasına yol açıyordu).
export function requestNo(request) {
  if (request?.request_no || request?.code) return request.request_no || request.code
  const year = request?.created_at ? new Date(request.created_at).getFullYear() : new Date().getFullYear()
  const suffix = String(request?.id || '').replace(/-/g, '').slice(-4).toUpperCase() || '0000'
  return `SAT-${year}-${suffix}`
}
