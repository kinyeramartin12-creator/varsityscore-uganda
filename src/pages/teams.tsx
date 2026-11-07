import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import sharedTeamAliases from '../../shared/teamAliases.json'
import { uflGroups } from '../data/uflGroups'

type Match = {
id: string | number
homeTeam: string
awayTeam: string
homeScore: number
awayScore: number
status: string
minute?: number
events?: string[]
date?: string
kickoffTime?: string
}

function Teams() {
const navigate = useNavigate()

const [matches, setMatches] = useState<Match[]>([])
const [searchTerm, setSearchTerm] = useState('')

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
        normalizeTeamName(officialName) === normalizedTeam ||
        aliases.some(
          (alias) => normalizeTeamName(alias) === normalizedTeam
        )
      ) {
        return officialName
      }
    }
  }

  return teamName
}

useEffect(() => {
const loadMatches = async () => {
try {
const response = await fetch('http://localhost:3001/api/matches')

    if (!response.ok) {
      throw new Error('Failed to load matches')
    }

    const data: Match[] = await response.json()
    setMatches(data)
  } catch (error) {
    console.error('Unable to load university teams:', error)
  }
}

loadMatches()

const interval = setInterval(loadMatches, 5000)

return () => clearInterval(interval)

}, [])

const teams = Array.from(
new Set(
matches.flatMap((match) => [
match.homeTeam.trim(),
match.awayTeam.trim(),
]).filter(Boolean)
)
).sort()

const filteredTeams = teams.filter((team) => {
  const normalizedSearch = searchTerm
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

  const officialName = getOfficialTeamName(team)

  const normalizedOfficialName = officialName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

  const canonicalKey = normalizedOfficialName

  const aliases =
    (sharedTeamAliases as Record<string, string[]>)[canonicalKey] || []

  return (
    normalizedOfficialName.includes(normalizedSearch) ||
    aliases.some((alias) =>
      alias.toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .includes(normalizedSearch)
    )
  )
})

return ( <main className="page-container">

  <header className="page-header">
    <p className="page-label">
      PEPSI UNIVERSITY FOOTBALL LEAGUE
    </p>

    <h1>University Teams</h1>

    <p>
      Explore the universities featured in VarsityScore Uganda.
    </p>
  </header>

  <section className="page-content">
    <h2>Participating Teams</h2>

    <p className="team-count">
      {filteredTeams.length} universities found
    </p>

    <p>
      Click on a university to view its team details, including match history, player statistics, and more.
    </p>

    <input
      type="text"
      className="team-search-input"
      placeholder="Search universities..."
      value={searchTerm}
      onChange={(event) => setSearchTerm(event.target.value)}
      aria-label="Search universities"
    />

    {searchTerm && (
      <button
        type="button"
        className="clear-search-button"
        onClick={() => setSearchTerm('')}
      >
        Clear Search
      </button>
    )}

    <div className="teams-grid">
      {filteredTeams.map((team, index) => (
        <article
          className="university-team-card"
          key={team}
          tabIndex={0}
          role="link"
          onClick={() =>
            navigate(`/teams/${team.toLowerCase().replace(/\s+/g, '-')}`)
          }
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              navigate(`/teams/${team.toLowerCase().replace(/\s+/g, '-')}`)
            }
          }}
        >
          <div className="team-card-number">
            {String(index + 1).padStart(2, '0')}
          </div>

          <div className="university-badge">
            {team
              .split(/\s+/)
              .filter((word) => !['of', 'the', 'and'].includes(word.toLowerCase()))
              .map((word) => word[0])
              .slice(0, 3)
              .join('')
              .toUpperCase()}
          </div>

<h3 className="university-team-name">
  {getOfficialTeamName(team)}
</h3>

        </article>
      ))}
    </div>
  </section>
</main>
)
}

export default Teams