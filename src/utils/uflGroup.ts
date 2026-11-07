
import { uflGroups } from '../data/uflGroups'
import teamAliasesJson from '../../shared/teamAliases.json?raw'

const teamAliases = JSON.parse(teamAliasesJson) as Record<string, string[]>

function normalizeTeamName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function getUFLGroup(teamName: string) {
  const normalizedName = normalizeTeamName(teamName)

  // Find the university's official name using its known aliases.
  const canonicalName = Object.entries(teamAliases).find(
    ([officialName, aliases]) =>
      normalizeTeamName(officialName) === normalizedName ||
      aliases.some(
        (alias) => normalizeTeamName(alias) === normalizedName
      )
  )?.[0]

  // Match the official university name against the group list.
  const group = uflGroups.find((item) =>
    item.teams.some(
      (team) =>
        normalizeTeamName(team) ===
        normalizeTeamName(canonicalName || teamName)
    )
  )

  return group?.name ?? null
}