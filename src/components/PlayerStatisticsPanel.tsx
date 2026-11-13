import { useEffect, useState } from "react"
import {
  calculatePlayerStatistics,
  type PlayerStatistics,
} from "../utils/playerStatistics"
import sharedTeamAliases from '../../shared/teamAliases.json'
import { uflGroups } from '../data/uflGroups'

type MatchRecord = {
  goals?: {
    scorer: string
    team: string | null
    minute: number | null
    assist?: string
  }[]
  cards?: {
    player: string
    team: string | null
    type: "YELLOW" | "RED"
    minute: number | null
  }[]
}

const normalizeTeamName = (name: string) =>
  String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

const getOfficialTeamName = (teamName: string) => {
  const normalizedTeam = normalizeTeamName(teamName)

  for (const group of uflGroups) {
    for (const officialName of group.teams) {
      const canonicalKey = normalizeTeamName(officialName)

      const aliases =
        (sharedTeamAliases as Record<string, string[]>)[canonicalKey] || []

      if (
        normalizedTeam === canonicalKey ||
        aliases.some(
          alias => normalizeTeamName(alias) === normalizedTeam
        )
      ) {
        return officialName
      }
    }
  }

  return teamName
}

export default function PlayerStatisticsPanel() {
    const [activeTab, setActiveTab] = useState<'scorers' | 'assists'>('scorers')
  const [players, setPlayers] = useState<PlayerStatistics[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
  async function loadStatistics() {
    try {
      const response = await fetch(
        "/api/matches"
      )

      if (!response.ok) {
        throw new Error("Unable to load match records.")
      }

      const matches: MatchRecord[] = await response.json()

      setPlayers(calculatePlayerStatistics(matches))
      setError("")
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to load player statistics."
      )
    } finally {
      setLoading(false)
    }
  }

  loadStatistics()

  const interval = setInterval(loadStatistics, 5000)

  return () => clearInterval(interval)
}, [])

  if (loading) return <p>Loading player statistics...</p>

  if (error) return <p>{error}</p>

  const scorers = [...players]
    .filter(player => player.goals > 0)
    .sort((a, b) => b.goals - a.goals)

  const assists = [...players]
    .filter(player => player.assists > 0)
    .sort((a, b) => b.assists - a.assists)

 

  return (
    <section className="player-statistics">
      <h2>Player Statistics</h2>
      <div className="statistics-tabs">
  <button
    className={activeTab === 'scorers' ? 'active' : ''}
    onClick={() => setActiveTab('scorers')}
  >
    Top Scorers
  </button>

  <button
    className={activeTab === 'assists' ? 'active' : ''}
    onClick={() => setActiveTab('assists')}
  >
    Top Assist Makers
  </button>
</div>

      <div className="statistics-grid">
        {activeTab === 'scorers' && (
  <div className="statistics-card">
          <h3>Top Scorers</h3>

          <div className="player-stats-table-container">
  <table className="player-stats-table">
            <thead>
             <tr>
  <th>#</th>
  <th>Player</th>
  <th>University</th>
  <th>Goals</th>
</tr>
            </thead>

            <tbody>
             {scorers.map((player, index) => (
  <tr key={`${player.player}-${player.university}`}>
    <td>{index + 1}</td>
    <td>{player.player}</td>
                  <td>{getOfficialTeamName(player.university)}</td>
                  <td>{player.goals}</td>
                </tr>
              ))}

              {scorers.length === 0 && (
                <tr>
                  <td colSpan={4}>No goals recorded yet.</td>
                </tr>
              )}
            </tbody>
            </table>
</div>
        </div>
        )}

        {activeTab === 'assists' && (
  <div className="statistics-card">
          <h3>Top Assist Makers</h3>

          <div className="player-stats-table-container">
  <table className="player-stats-table">
            <thead>
             <tr>
  <th>#</th>
  <th>Player</th>
  <th>University</th>
  <th>Assists</th>
</tr>
            </thead>

            <tbody>
             {assists.map((player, index) => (
  <tr key={`${player.player}-${player.university}`}>
    <td>{index + 1}</td>
    <td>{player.player}</td>
                  <td>{getOfficialTeamName(player.university)}</td>
                  <td>{player.assists}</td>
                </tr>
              ))}

              {assists.length === 0 && (
                <tr>
                  <td colSpan={4}>No assists recorded yet.</td>
                </tr>
              )}
            </tbody>
            </table>
</div>
        </div>
        )}
      </div>
    </section>
  )
}