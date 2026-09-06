export const APP_VERSION = '0.1.0-beta.5'
export const RELEASES_URL = 'https://github.com/noastudiogames20-blip/karaoke-studio/releases'

export type ReleaseAsset = { name: string; browser_download_url: string }
export type UpdateRelease = { tag_name: string; name: string; body: string | null; published_at: string; html_url: string; assets: ReleaseAsset[]; prerelease: boolean }

function versionParts(version: string) {
  return version.replace(/^v/, '').split(/[.-]/).map((part) => Number.isFinite(Number(part)) ? Number(part) : -1)
}

export function isNewerVersion(candidate: string, current = APP_VERSION) {
  const next = versionParts(candidate)
  const installed = versionParts(current)
  for (let index = 0; index < Math.max(next.length, installed.length); index += 1) {
    if ((next[index] || 0) !== (installed[index] || 0)) return (next[index] || 0) > (installed[index] || 0)
  }
  return false
}

export function preferredAsset(assets: ReleaseAsset[]) {
  const platform = navigator.platform.toLowerCase()
  const candidates = platform.includes('win') ? ['setup.exe', '.msi'] : platform.includes('mac') ? ['.dmg'] : platform.includes('linux') ? ['.appimage', '.deb', '.rpm'] : ['.apk']
  return assets.find((asset) => candidates.some((suffix) => asset.name.toLowerCase().endsWith(suffix)))
}

export async function fetchLatestRelease() {
  const response = await fetch(`${RELEASES_URL.replace('/releases', '/releases/latest')}`, { headers: { Accept: 'application/vnd.github+json' } })
  if (!response.ok) throw new Error(`GitHub release lookup failed (${response.status})`)
  return await response.json() as UpdateRelease
}
