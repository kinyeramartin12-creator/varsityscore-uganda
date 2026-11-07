import { useEffect, useState } from 'react'
import { getUFLGroup } from '../utils/uflGroup'
import { getCanonicalTeamName } from '../utils/teamIdentity'


type LiveMatch = {
  id: string
  homeTeam: string
  awayTeam: string
  homeScore: number
  awayScore: number
  status: string
  date?: string
  minute?: number | null
  events?: string[]

  goals?: {
    id: string
    scorer: string
    team?: string | null
    minute?: number | null
    type?: string
    assist?: string
  }[]

  cards?: {
    id: string
    player: string
    team?: string | null
    type: string
    minute?: number | null
  }[]
}

function getOfficialTeamName(teamName?: string | null): string {
  if (!teamName) return ''
  return getCanonicalTeamName(teamName)
}

function LiveScores() {
  const [matches, setMatches] = useState<LiveMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState('')
  const [resultSearch, setResultSearch] = useState('')
  const [showAllResults, setShowAllResults] = useState(false)

  useEffect(() => {
    async function fetchMatch() {
      try {
        const response = await fetch(
          'http://localhost:3001/api/matches'
        )

        if (!response.ok) {
          throw new Error('Could not load match data')
        }

        const data: LiveMatch[] = await response.json()
        setMatches(data)
        setError('')
        setLastUpdated(new Date().toLocaleTimeString())
      } catch {
        setError('Unable to connect to the match server.')
      } finally {
        setLoading(false)
      }
    }

    fetchMatch()

    const interval = setInterval(fetchMatch, 5000)

    return () => clearInterval(interval)
  }, [])

  const getStatus = (status: string) =>
    status.trim().toUpperCase().replace(/[_-]+/g, ' ')

  const isLive = (status: string) =>
    ['LIVE', 'IN PLAY', 'IN PROGRESS'].includes(getStatus(status))

  const isHalfTime = (status: string) =>
    ['HALF TIME', 'HALFTIME', 'HT'].includes(getStatus(status))

  const isFinished = (status: string) =>
    ['FINISHED', 'FULL TIME', 'FULLTIME', 'FT', 'COMPLETED'].includes(
      getStatus(status)
    )

  const validMatches = matches.filter(
    (match) =>
      match.homeTeam?.trim() !== '' &&
      match.awayTeam?.trim() !== ''
  )

  const liveMatches = validMatches.filter(
    (match) => isLive(match.status) || isHalfTime(match.status)
  )

  const finishedMatches = validMatches
    .filter((match) => isFinished(match.status))
    .sort((a, b) => {
      const dateA = a.date ? new Date(a.date).getTime() : NaN
      const dateB = b.date ? new Date(b.date).getTime() : NaN

      if (Number.isNaN(dateA) && Number.isNaN(dateB)) return 0
      if (Number.isNaN(dateA)) return 1
      if (Number.isNaN(dateB)) return -1

      return dateB - dateA
    })

  const searchedResults = finishedMatches.filter((match) => {
    const search = resultSearch.trim().toLowerCase()

    if (!search) return true

    return (
  getOfficialTeamName(match.homeTeam).toLowerCase().includes(search) ||
  getOfficialTeamName(match.awayTeam).toLowerCase().includes(search)
)
  })

  const visibleResults = showAllResults
    ? searchedResults
    : searchedResults.slice(0, 10)

  function renderMatchCard(liveMatch: LiveMatch) {
    return (
      <article className="fixture-card" key={liveMatch.id}>
        <div className="fixture-information">
          <span className="fixture-competition">
            Pepsi UFL
          </span>

          <span className="live-match-indicator">
            {isLive(liveMatch.status)
              ? `● LIVE ${liveMatch.minute ?? ''}${liveMatch.minute != null ? "'" : ''}`
              : isHalfTime(liveMatch.status)
                ? 'HALF TIME'
                : 'FULL TIME'}
          </span>
        </div>

<div className="fixture-teams">
  <span className="fixture-team-name">
      {getOfficialTeamName(liveMatch.homeTeam)}

    {isFinished(liveMatch.status) &&
       getUFLGroup(getOfficialTeamName(liveMatch.homeTeam))&& (
        <small className="fixture-group-badge">
          {getUFLGroup(getOfficialTeamName(liveMatch.homeTeam))}
        </small>
      )}
  </span>

  <strong>
    {liveMatch.homeScore} - {liveMatch.awayScore}
  </strong>

  <span className="fixture-team-name">
    {getOfficialTeamName(liveMatch.awayTeam)}

    {isFinished(liveMatch.status) &&
      getUFLGroup(getOfficialTeamName(liveMatch.awayTeam)) && (
        <small className="fixture-group-badge">
          {getUFLGroup(getOfficialTeamName(liveMatch.awayTeam))}
        </small>
      )}
  </span>
</div>

        {isLive(liveMatch.status) && (
          <p>
            Match minute:{' '}
            {liveMatch.minute != null
              ? `${liveMatch.minute}'`
              : 'Not stated'}
          </p>
        )}

        {isHalfTime(liveMatch.status) && (
          <p>Half-time break</p>
        )}

        {isFinished(liveMatch.status) && (
          <p>Match ended</p>
        )}

        <h4>Match Events</h4>

        {(liveMatch.goals || []).length > 0 && (
          <div>
            <h5>⚽ Goals</h5>

            <ul>
              {(liveMatch.goals || []).map((goal) => (
                <li key={goal.id}>
                  {goal.minute != null
                    ? `${goal.minute}'`
                    : 'Not stated'}
                  {' — '}
                  {goal.scorer}
                  {goal.team ? ` (${getOfficialTeamName(goal.team)})` : ''}
                  {goal.type && goal.type !== 'NORMAL'
                    ? ` · ${goal.type.replace(/_/g, ' ')}`
                    : ''}
                  {goal.assist ? ` · Assist: ${goal.assist}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}

        {(liveMatch.cards || []).length > 0 && (
          <div>
            <h5>🟨 Cards</h5>

            <ul>
              {(liveMatch.cards || []).map((card) => (
                <li key={card.id}>
                  {card.minute != null
                    ? `${card.minute}'`
                    : 'Not stated'}
                  {' — '}
                  {card.player}
                  {card.team ? ` (${getOfficialTeamName(card.team)})` : ''}
                  {' · '}
                  {card.type} CARD
                </li>
              ))}
            </ul>
          </div>
        )}

        {(liveMatch.events || []).length > 0 && (
          <ul>
            {(liveMatch.events || []).map((event, index) => (
              <li key={`${event}-${index}`}>{event}</li>
            ))}
          </ul>
        )}

        {!(liveMatch.goals || []).length &&
          !(liveMatch.cards || []).length &&
          !(liveMatch.events || []).length && (
            <p>No match events recorded yet.</p>
          )}
      </article>
    )
  }

  return (
    <main className="page-container">
      <header className="page-header">
        <p className="page-label">
          PEPSI UNIVERSITY FOOTBALL LEAGUE
        </p>

        <h1>Live Scores</h1>

        <p>
          Follow university football matches as they happen.
        </p>
      </header>

      <section className="page-content">

        {lastUpdated && (
          <p>Last updated: {lastUpdated}</p>
        )}

        {loading ? (
          <p>Loading match data...</p>
        ) : error ? (
          <div className="no-live-matches">
            <h3>Connection Problem</h3>
            <p>{error}</p>
            <p>Make sure the VarsityScore backend is running.</p>
          </div>
        ) : (
          <>
            <section>
              <h2>🔴 LIVE NOW</h2>

              <p>
                Matches currently in progress or at half-time.
              </p>

              {liveMatches.length > 0 ? (
                <div className="fixtures-list">
                  {liveMatches.map(renderMatchCard)}
                </div>
              ) : (
                <div className="no-live-matches">
                  <div className="no-live-icon">⚽</div>
                  <h3>No Live Matches Currently</h3>
                </div>
              )}
            </section>

            <section>
              <h2>RECENT RESULTS</h2>

              <p>
                SEARCH TO NAVIGATE EASILY.
              </p>

              <input
                type="text"
                value={resultSearch}
                onChange={(event) => {
                  setResultSearch(event.target.value)
                  setShowAllResults(false)
                }}
                placeholder="Search university name..."
                aria-label="Search results by university name"
              />

              {visibleResults.length > 0 ? (
                <>
                  <div className="fixtures-list">
                    {visibleResults.map(renderMatchCard)}
                  </div>

                  {searchedResults.length > 10 && (
                    <button
                      type="button"
                      onClick={() =>
                        setShowAllResults(!showAllResults)
                      }
                    >
                      {showAllResults
                        ? 'Show Latest 10'
                        : `View All Results (${searchedResults.length})`}
                    </button>
                  )}
                </>
              ) : (
                <div className="no-live-matches">
                  <h3>No Results Found</h3>
                  <p>
                    {resultSearch
                      ? 'No completed matches found for that university.'
                      : 'No completed matches have been recorded yet.'}
                  </p>
                </div>
              )}
            </section>
          </>
        )}

        <p className="About">
          Match updates appear here automatically when
          loaded.
        </p>
      </section>
    </main>
  )
}

export default LiveScores