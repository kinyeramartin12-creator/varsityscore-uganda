import { useEffect, useState } from 'react'
import { uflGroups } from '../data/uflGroups'
import { getCanonicalTeamName } from '../utils/teamIdentity'



type Match = {
  id: string | number
  homeTeam: string
  awayTeam: string
  homeScore: number
  awayScore: number
  status: string
  date?: string
}

type TeamStanding = {
  team: string
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  points: number
}

type TeamGroup = {
  name: string
  region: string
  standings: TeamStanding[]
}

const isFinished = (status?: string) => {
  const normalized = (status || '')
    .trim()
    .toUpperCase()
    .replace(/[_-]+/g, ' ')

  return ['FINISHED', 'FULL TIME', 'FULLTIME', 'FT', 'COMPLETED'].includes(
    normalized
  )
}

function normalizeTeamName(name: string): string {
  return getCanonicalTeamName(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function calculateGroupStandings(matches: Match[]): TeamGroup[] {
  return uflGroups.map((group) => {
    const teams: Record<string, TeamStanding> = {}

    group.teams.forEach((teamName) => {
      const key = normalizeTeamName(teamName)

      teams[key] = {
        team: teamName,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
      }
    })

    // Keep only completed matches between teams in this group.
    const groupMatches = matches.filter((match) => {
      if (!isFinished(match.status)) {
        return false
      }

      const homeKey = normalizeTeamName(match.homeTeam)
      const awayKey = normalizeTeamName(match.awayTeam)

      return Boolean(
        teams[homeKey] &&
        teams[awayKey] &&
        homeKey !== awayKey
      )
    })

    // Prevent duplicate records of the same dated fixture
    // from affecting the standings more than once.
    const uniqueMatches = new Map<string, Match>()

    groupMatches.forEach((match) => {
      const homeKey = normalizeTeamName(match.homeTeam)
      const awayKey = normalizeTeamName(match.awayTeam)

      const teamsInFixture = [homeKey, awayKey].sort().join('-')

      const matchKey = match.date
  ? `${match.date}-${teamsInFixture}`
  : `undated-${teamsInFixture}`

      if (!uniqueMatches.has(matchKey)) {
        uniqueMatches.set(matchKey, match)
      }
    })

    uniqueMatches.forEach((match) => {
      const home = teams[normalizeTeamName(match.homeTeam)]
      const away = teams[normalizeTeamName(match.awayTeam)]

      if (!home || !away) return

      home.played++
      away.played++

      home.goalsFor += match.homeScore
      home.goalsAgainst += match.awayScore

      away.goalsFor += match.awayScore
      away.goalsAgainst += match.homeScore

      if (match.homeScore > match.awayScore) {
        home.won++
        away.lost++
        home.points += 3
      } else if (match.homeScore < match.awayScore) {
        away.won++
        home.lost++
        away.points += 3
      } else {
        home.drawn++
        away.drawn++
        home.points++
        away.points++
      }
    })

    const standings = Object.values(teams)

    standings.forEach((team) => {
      team.goalDifference = team.goalsFor - team.goalsAgainst
    })

    standings.sort(
      (a, b) =>
        b.points - a.points ||
        b.goalDifference - a.goalDifference ||
        b.goalsFor - a.goalsFor ||
        a.team.localeCompare(b.team)
    )

    return {
      name: group.name,
      region: group.region,
      standings,
    }
  })
}

function Standings() {
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function fetchMatches() {
      try {
        const response = await fetch(
          'http://localhost:3001/api/matches'
        )

        if (!response.ok) {
          throw new Error('Could not load match data.')
        }

        const data: Match[] = await response.json()

        setMatches(data)
        setError('')
      } catch {
        setError('Unable to connect to the match server.')
      } finally {
        setLoading(false)
      }
    }

    fetchMatches()

    const interval = setInterval(fetchMatches, 5000)

    return () => clearInterval(interval)
  }, [])

  const groups = calculateGroupStandings(matches)

  return (
    <main className="page-container">

      <header className="page-header">
        <p className="page-label">
          PEPSI UNIVERSITY FOOTBALL LEAGUE
        </p>

        <h1>League Standings</h1>

        <p>
          Follow university teams and their positions in the league.
        </p>
      </header>

      <section className="page-content">
        <h2>Group Standings</h2>

        <p>
          All 31 teams are listed in their original groups.
          Tables refresh automatically every five seconds.
          Only completed matches between teams in the same group
          count toward standings.
        </p>

        {loading ? (
          <p>Loading league standings...</p>
        ) : error ? (
          <div className="no-live-matches">
            <h3>Connection Problem</h3>
            <p>{error}</p>
            <p>Make sure the VarsityScore backend is running.</p>
          </div>
        ) : (
          groups.map((group) => (
            <section
              className="group-standings-section"
              key={group.name}
            >
              <h2>{group.name}</h2>
              <p>{group.region}</p>

              <div className="standings-table-container">
                <table className="standings-table">
                  <thead>
                    <tr>
                      <th>Pos</th>
                      <th>Team</th>
                      <th>P</th>
                      <th>W</th>
                      <th>D</th>
                      <th>L</th>
                      <th>GF</th>
                      <th>GA</th>
                      <th>GD</th>
                      <th>Pts</th>
                    </tr>
                  </thead>

                  <tbody>
                    {group.standings.map((team, index) => (
                      <tr key={team.team}>
                        <td>{index + 1}</td>
                        <td>{team.team}</td>
                        <td>{team.played}</td>
                        <td>{team.won}</td>
                        <td>{team.drawn}</td>
                        <td>{team.lost}</td>
                        <td>{team.goalsFor}</td>
                        <td>{team.goalsAgainst}</td>
                        <td>
                          {team.goalDifference > 0
                            ? `+${team.goalDifference}`
                            : team.goalDifference}
                        </td>
                        <td>{team.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))
        )}

        <p className="demo-notice">
          Monitor your university's progress in the standings.
        </p>
      </section>
    </main>
  )
}

export default Standings