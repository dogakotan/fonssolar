import { useState, useEffect } from 'react'

const WMO = {
  0:  { label: 'Açık',              emoji: '☀️' },
  1:  { label: 'Az Bulutlu',        emoji: '🌤️' },
  2:  { label: 'Parçalı Bulutlu',   emoji: '⛅' },
  3:  { label: 'Kapalı',            emoji: '☁️' },
  45: { label: 'Sisli',             emoji: '🌫️' },
  48: { label: 'Sisli',             emoji: '🌫️' },
  51: { label: 'Çiseleyen',         emoji: '🌦️' },
  53: { label: 'Çiseleyen',         emoji: '🌦️' },
  55: { label: 'Çiseleyen',         emoji: '🌦️' },
  61: { label: 'Yağmurlu',          emoji: '🌧️' },
  63: { label: 'Yağmurlu',          emoji: '🌧️' },
  65: { label: 'Şiddetli Yağmur',   emoji: '🌧️' },
  71: { label: 'Karlı',             emoji: '🌨️' },
  73: { label: 'Karlı',             emoji: '🌨️' },
  75: { label: 'Yoğun Kar',         emoji: '❄️' },
  80: { label: 'Sağanak',           emoji: '🌦️' },
  81: { label: 'Sağanak',           emoji: '🌦️' },
  82: { label: 'Şiddetli Sağanak',  emoji: '⛈️' },
  95: { label: 'Fırtına',           emoji: '⛈️' },
  96: { label: 'Dolu',              emoji: '⛈️' },
  99: { label: 'Dolu',              emoji: '⛈️' },
}

function wmo(code) {
  return WMO[code] || { label: 'Bilinmiyor', emoji: '🌡️' }
}

async function geocode(locationName) {
  const clean = locationName.split(',')[0].trim()
  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(clean)}&count=1&language=tr&format=json`
  )
  const data = await res.json()
  const r = data.results?.[0]
  if (!r) throw new Error(`"${clean}" bulunamadı`)
  return { lat: r.latitude, lon: r.longitude }
}

async function fetchWeather(lat, lon) {
  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,weathercode,windspeed_10m,relativehumidity_2m` +
    `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&timezone=auto&forecast_days=2`
  )
  return res.json()
}

// location: string (şehir adı) VEYA { lat, lon }
export function useWeather(location) {
  const [state, setState] = useState({ loading: true, error: null, current: null, tomorrow: null })

  const depKey = typeof location === 'string'
    ? location
    : (location ? `${location.lat},${location.lon}` : null)

  useEffect(() => {
    if (!location) {
      setState({ loading: false, error: null, current: null, tomorrow: null })
      return
    }
    setState({ loading: true, error: null, current: null, tomorrow: null })

    async function load() {
      try {
        let lat, lon
        if (typeof location === 'string') {
          ;({ lat, lon } = await geocode(location))
        } else {
          lat = location.lat
          lon = location.lon
        }
        const data = await fetchWeather(lat, lon)
        const c = data.current
        const d = data.daily
        setState({
          loading: false,
          error: null,
          current: {
            temp:     Math.round(c.temperature_2m),
            wind:     Math.round(c.windspeed_10m),
            humidity: c.relativehumidity_2m,
            ...wmo(c.weathercode),
          },
          tomorrow: {
            max:  Math.round(d.temperature_2m_max[1]),
            min:  Math.round(d.temperature_2m_min[1]),
            rain: d.precipitation_probability_max[1],
            ...wmo(d.weathercode[1]),
          },
        })
      } catch (e) {
        setState({ loading: false, error: e.message, current: null, tomorrow: null })
      }
    }
    load()
  }, [depKey])

  return state
}
