import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { uflGroups } from '../data/uflGroups'
import { getCanonicalTeamName } from '../utils/teamIdentity'

function Teams() {
  const navigate = useNavigate()
  const [searchTerm, setSearchTerm] = useState('')

  // Always use the official university names from the UFL groups.
  const groups = uflGroups.map((group) => ({
    ...group,
    teams: group.teams
      .map((team) => getCanonicalTeamName(team))
      .filter((team) =>
        team.toLowerCase().includes(searchTerm.toLowerCase())
      ),
  }))

  const totalTeams = groups.reduce(
    (total, group) => total + group.teams.length,
    0
  )

  return (
    <main className="page-container">
      <header className="page-header">
        <p className="page-label">
          PEPSI UNIVERSITY FOOTBALL LEAGUE
        </p>

        <h1>University Teams</h1>

        <p>
          Explore the universities participating in the Pepsi University Football League.
        </p>
      </header>

      <section className="page-content">
        <h2>Participating Teams</h2>

        <p className="team-count">
          {totalTeams} universities found
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

        {groups.map((group) => (
          <div key={group.name}>
            {group.teams.length > 0 && (
              <>
                <h2>{group.name} — {group.region}</h2>

                <div className="teams-grid">
                  {group.teams.map((team, index) => (
                    <article
                      className="university-team-card"
                      key={team}
                      tabIndex={0}
                      role="link"
                      onClick={() =>
                        navigate(
                          `/teams/${team.toLowerCase().replace(/\s+/g, '-')}`
                        )
                      }
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          navigate(
                            `/teams/${team.toLowerCase().replace(/\s+/g, '-')}`
                          )
                        }
                      }}
                    >
                      <div className="team-card-number">
                        {String(index + 1).padStart(2, '0')}
                      </div>

                      <div className="university-badge">
                        {team
                          .split(/\s+/)
                          .filter(
                            (word) =>
                              !['of', 'the', 'and'].includes(
                                word.toLowerCase()
                              )
                          )
                          .map((word) => word[0])
                          .slice(0, 3)
                          .join('')
                          .toUpperCase()}
                      </div>

                      <h3 className="university-team-name">
                        {team}
                      </h3>
                    </article>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </section>
    </main>
  )
}

export default Teams