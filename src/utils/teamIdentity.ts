import { uflGroups } from '../data/uflGroups'
import teamAliases from '../../shared/teamAliases.json'

const normalize = (name: string) =>
  (name || '').toLowerCase().replace(/[^a-z0-9]/g, '')

const aliases = teamAliases as Record<string, string[]>

export function getCanonicalTeamName(detectedName: string): string {
  const detected = normalize(detectedName)

  // Find the detected name in the shared aliases.
  const aliasEntry = Object.entries(aliases).find(
    ([canonicalKey, names]) =>
      normalize(canonicalKey) === detected ||
      names.some((name) => normalize(name) === detected)
  )

  if (!aliasEntry) return detectedName

  const canonicalKey = normalize(aliasEntry[0])

  // Get the official university name from the UFL groups.
  for (const group of uflGroups) {
    const officialName = group.teams.find(
      (team) => normalize(team) === canonicalKey
    )

    if (officialName) return officialName
  }

  return detectedName
}

export function getUFLGroup(detectedName: string): string | null {
  const officialName = getCanonicalTeamName(detectedName)
  const normalized = normalize(officialName)

  const group = uflGroups.find((item) =>
    item.teams.some((team) => normalize(team) === normalized)
  )

  return group?.name ?? null
}