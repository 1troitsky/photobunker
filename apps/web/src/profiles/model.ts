export type ProfileRules = {
  resolution: 'maximum' | 'fixed'; width: number; height: number
  aspect: 'native' | '1:1' | '4:3' | '3:2' | '16:9' | 'custom'; aspectWidth: number; aspectHeight: number
  fit: 'crop' | 'contain'; quality: number
  metadata: 'all' | 'selected' | 'none'; keepDate: boolean; keepCamera: boolean
  location: 'off' | 'optional' | 'required'; accuracy: number; locationWindow: number
  descriptionRequired: boolean; descriptionEditable: boolean; categoryRequired: boolean
  categories: string[]; shotList: string[]; idPrefix: string
}
export type Profile = { id: string; name: string; description: string; version: number; rules: ProfileRules; archived?: boolean }
export type Location = { latitude: number; longitude: number; accuracy: number; measuredAt: number }
export type PhotoMetadata = { capturedAt?: number; camera?: string; location?: Location; locationStatus?: 'pending' | 'unavailable'; resolutionLimited?: boolean }

export function defaultRules(): ProfileRules {
  return { resolution: 'maximum', width: 1600, height: 1200, aspect: 'native', aspectWidth: 4, aspectHeight: 3,
    fit: 'crop', quality: 0.94, metadata: 'selected', keepDate: true, keepCamera: false,
    location: 'off', accuracy: 20, locationWindow: 15, descriptionRequired: false, descriptionEditable: true,
    categoryRequired: false, categories: [], shotList: [], idPrefix: '' }
}
export function aspectRatio(rules: ProfileRules): number | undefined {
  if (rules.aspect === 'native') return rules.resolution === 'fixed' ? rules.width / rules.height : undefined
  if (rules.aspect === 'custom') return rules.aspectWidth / rules.aspectHeight
  const [width, height] = rules.aspect.split(':').map(Number)
  return width! / height!
}
export function snapshot(profile: Profile): Profile { return JSON.parse(JSON.stringify({ id: profile.id, name: profile.name, description: profile.description, version: profile.version, rules: profile.rules })) }
export function photoCode(prefix: string): string {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
  const random = crypto.getRandomValues(new Uint8Array(10))
  const code = [...random].map(value => alphabet[value % alphabet.length]).join('')
  return prefix ? `${prefix}-${code}` : code
}
export function missingRequirements(photo: { note: string; category?: string; metadata?: PhotoMetadata; profile?: Profile }): ('description' | 'category' | 'location' | 'resolution')[] {
  const rules = photo.profile?.rules
  if (!rules) return []
  const missing: ('description' | 'category' | 'location' | 'resolution')[] = []
  if (rules.descriptionRequired && !photo.note.trim()) missing.push('description')
  if (rules.categoryRequired && !photo.category) missing.push('category')
  if (rules.location === 'required' && (!photo.metadata?.location || photo.metadata.location.accuracy > rules.accuracy)) missing.push('location')
  if (photo.metadata?.resolutionLimited) missing.push('resolution')
  return missing
}
