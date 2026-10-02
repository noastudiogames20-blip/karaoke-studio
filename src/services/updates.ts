export const APP_VERSION = '0.1.0-beta.10'
export const RELEASES_URL = 'https://github.com/noastudiogames20-blip/karaoke-studio/releases'
const RELEASES_API_URL = 'https://api.github.com/repos/noastudiogames20-blip/karaoke-studio/releases?per_page=20'

export type ReleaseAsset = { name: string; browser_download_url: string }
export type UpdateRelease = { tag_name: string; name: string; body: string | null; published_at: string; html_url: string; assets: ReleaseAsset[]; prerelease: boolean }

export function isNewerVersion(candidate: string, current = APP_VERSION) {
  const parse = (version: string) => version.match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/)
  const next = parse(candidate)
  const installed = parse(current)
  if (!next || !installed) return false
  for (let index = 1; index <= 3; index += 1) {
    const difference = Number(next[index]) - Number(installed[index])
    if (difference) return difference > 0
  }
  if (!next[4]) return Boolean(installed[4])
  if (!installed[4]) return false
  const nextParts = next[4].split('.')
  const installedParts = installed[4].split('.')
  for (let index = 0; index < Math.max(nextParts.length, installedParts.length); index += 1) {
    if (nextParts[index] === installedParts[index]) continue
    if (nextParts[index] === undefined) return false
    if (installedParts[index] === undefined) return true
    const nextNumber = Number(nextParts[index])
    const installedNumber = Number(installedParts[index])
    if (Number.isFinite(nextNumber) && Number.isFinite(installedNumber)) return nextNumber > installedNumber
    return nextParts[index] > installedParts[index]
  }
  return false
}

export function preferredAsset(assets: ReleaseAsset[]) {
  const platform = navigator.platform.toLowerCase()
  const userAgent = navigator.userAgent.toLowerCase()
  const candidates = /android/.test(userAgent) ? ['.apk'] : /iphone|ipad|ipod/.test(userAgent) ? ['.ipa'] : platform.includes('win') ? ['setup.exe', '.msi'] : platform.includes('mac') ? ['.dmg'] : ['.appimage', '.deb', '.rpm']
  return assets.find((asset) => candidates.some((suffix) => asset.name.toLowerCase().endsWith(suffix)))
}

export async function fetchLatestRelease() {
  const response = await fetch(RELEASES_API_URL, { headers: { Accept: 'application/vnd.github+json' } })
  if (!response.ok) throw new Error(`GitHub release lookup failed (${response.status})`)
  const releases = await response.json() as UpdateRelease[]
  const latest = releases[0]
  if (!latest) throw new Error('No published release is available yet.')
  return latest
}
