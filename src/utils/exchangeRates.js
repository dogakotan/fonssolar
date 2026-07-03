export async function fetchDoviz() {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const response = await fetch('/tcmb-kurlar/today.xml', { signal: controller.signal })
    clearTimeout(timeout)
    if (!response.ok) return null

    const xmlText = await response.text()
    const xml = new DOMParser().parseFromString(xmlText, 'application/xml')
    const parseError = xml.querySelector('parsererror')
    if (parseError) return null

    const sellingRate = (code) => {
      const node = xml.querySelector(`Currency[CurrencyCode="${code}"]`)
      const value = node?.querySelector('ForexSelling')?.textContent
      const numeric = Number.parseFloat(value)
      return Number.isFinite(numeric) ? numeric : null
    }

    const usd = sellingRate('USD')
    const eur = sellingRate('EUR')
    if (!Number.isFinite(usd) || !Number.isFinite(eur)) return null

    const root = xml.querySelector('Tarih_Date')

    return {
      usd,
      eur,
      source: 'TCMB',
      rateType: 'ForexSelling',
      date: root?.getAttribute('Tarih') || root?.getAttribute('Date') || null,
      bulletinNo: root?.getAttribute('Bulten_No') || null,
    }
  } catch {
    return null
  }
}
