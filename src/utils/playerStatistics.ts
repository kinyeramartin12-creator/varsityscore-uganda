export type PlayerGoal = {
  id?: string
  scorer: string
  team: string | null
  minute: number | null
  type?: string
  assist?: string
  assistManuallyRemoved?: boolean
}

type MatchRecord = {
  goals?: PlayerGoal[]
}

export type PlayerStatistics = {
  player: string
  university: string
  goals: number
  assists: number
}

export function calculatePlayerStatistics(
  matches: MatchRecord[]
): PlayerStatistics[] {
  const players = new Map<string, PlayerStatistics>()

  function canonicalTeamName(
    team: string | null | undefined
  ): string | null {
    if (!team?.trim()) return null

    const key = team.trim().toLowerCase().replace(/[\s_-]+/g, "")

    const aliases: Record<string, string> = {
      guluvarsity: "Gulu University",
      afruniversity: "Africa Renewal University",
    }

    return aliases[key] || team.trim()
  }

  function getPlayer(name: string, team: string | null) {
  const cleanName = name.trim()

  if (!cleanName) return null

  const university = canonicalTeamName(team) || "Not confirmed"

  const key = `${cleanName.toLowerCase()}::${university.toLowerCase()}`

  if (!players.has(key)) {
    players.set(key, {
      player: cleanName,
      university,
      goals: 0,
      assists: 0,
    })
  }

  return players.get(key)!
}

  for (const match of matches) {
    const countedGoals = new Set<string>()

    for (const goal of match.goals || []) {
      const scorerName = goal.scorer.trim().toLowerCase()
      const teamName = (goal.team || "").trim().toLowerCase()

      const eventKey = goal.id
        ? `id:${goal.id}`
        : goal.minute !== null
        ? `goal:${scorerName}:${teamName}:${goal.minute}:${goal.type || ""}`
        : null

      if (eventKey && countedGoals.has(eventKey)) {
        continue
      }

      if (eventKey) countedGoals.add(eventKey)

      const scorer = getPlayer(goal.scorer, goal.team)

      if (scorer) {
        scorer.goals += 1
      }

      if (goal.assist && !goal.assistManuallyRemoved) {
        const assistant = getPlayer(goal.assist, goal.team)

        if (assistant) {
          assistant.assists += 1
        }
      }
    }
  }

  return Array.from(players.values())
}