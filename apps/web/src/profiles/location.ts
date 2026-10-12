import type { Location } from './model'
export function locationTracker(onChange: (location?: Location, permanent?: boolean) => void) {
  let watch: number | undefined
  let latest: Location | undefined
  let generation = 0
  function stop() { generation++; if (watch !== undefined) navigator.geolocation?.clearWatch(watch); watch = undefined; latest = undefined }
  function start() {
    stop()
    if (!navigator.geolocation) { onChange(undefined, true); return }
    const current = generation
    watch = navigator.geolocation.watchPosition(position => {
      if (current !== generation) return
      const { latitude, longitude, accuracy } = position.coords
      if (![latitude, longitude, accuracy, position.timestamp].every(Number.isFinite) || accuracy < 0 || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return
      latest = { latitude, longitude, accuracy, measuredAt: position.timestamp }; onChange(latest)
    }, error => { if (current === generation) onChange(undefined, error.code === 1) }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 })
  }
  function at(time: number) { return latest && Math.abs(latest.measuredAt - time) <= 15_000 ? { ...latest } : undefined }
  return { start, stop, at }
}
