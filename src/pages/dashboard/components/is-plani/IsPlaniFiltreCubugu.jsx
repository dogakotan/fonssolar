import { DURUM_OPTIONS, SORUMLUSUZ } from '../../../../lib/isPlan'
import { categoryLabel } from '../../../../utils/aylikPlan'
import { groupConfigFor } from '../TabIsPlan'

// İş Planı'nın üç bölümü (Genel, Detaylı, Aylık) için tek filtre çubuğu. Durum useIsPlaniFiltreleri'nde
// (adres çubuğu + proje bazlı localStorage); bölüm değişince filtre korunur. Seçenek listeleri projenin
// bütün görevlerinden gelir (süzülmüş listeden değil), böylece bir filtre diğerinin seçeneklerini daraltmaz.
export default function IsPlaniFiltreCubugu({ filters, setFilters, resetFilters, filtered, groupNames, categories, responsibles }) {
  return (
    <div className="is-plani-filtre" role="search" aria-label="İş Planı filtreleri">
      <input
        type="search"
        className="is-plani-filtre-ara"
        value={filters.q}
        onChange={event => setFilters({ q: event.target.value })}
        placeholder="Kod veya iş kalemi ara…"
        aria-label="Kod veya iş kalemi ara"
      />
      <select value={filters.durum} onChange={event => setFilters({ durum: event.target.value })} aria-label="Durum">
        <option value="all">Tüm Durumlar</option>
        {DURUM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <select value={filters.grup} onChange={event => setFilters({ grup: event.target.value })} aria-label="Grup">
        <option value="all">Tüm Gruplar</option>
        {withSelected(groupNames, filters.grup).map(g => <option key={g} value={g}>{groupConfigFor(g).label}</option>)}
      </select>
      <select value={filters.kategori} onChange={event => setFilters({ kategori: event.target.value })} aria-label="Kategori">
        <option value="all">Tüm Kategoriler</option>
        {withSelected(categories, filters.kategori).map(c => <option key={c} value={c}>{categoryLabel(c)}</option>)}
      </select>
      <select value={filters.sorumlu} onChange={event => setFilters({ sorumlu: event.target.value })} aria-label="Sorumlu">
        <option value="all">Tüm Sorumlular</option>
        <option value={SORUMLUSUZ}>Sorumlusuz</option>
        {withSelected(responsibles, filters.sorumlu === SORUMLUSUZ ? 'all' : filters.sorumlu).map(r => <option key={r} value={r}>{r}</option>)}
      </select>
      <label className="is-plani-filtre-buay">
        <input type="checkbox" checked={filters.buAy} onChange={event => setFilters({ buAy: event.target.checked })} />
        Sadece bu ay
      </label>
      {filtered && (
        <button type="button" className="is-plani-filtre-temizle" onClick={resetFilters}>Filtreleri temizle</button>
      )}
    </div>
  )
}

// Adresteki değer artık listede yoksa (ör. başka projeden kalan grup) yine de seçili görünsün,
// kullanıcı ne süzüldüğünü görsün ve temizleyebilsin.
function withSelected(list, selected) {
  return selected !== 'all' && !list.includes(selected) ? [...list, selected] : list
}
