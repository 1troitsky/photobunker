export const profilePath = (handle: string) => `/people/${encodeURIComponent(handle)}`
export function profileReturnTo(value: unknown) {
  return typeof value === 'string' && /^\/people\/(?:pb_[a-z0-9]+|%40[a-z0-9_.-]+)$/i.test(value) ? value : '/profile'
}
