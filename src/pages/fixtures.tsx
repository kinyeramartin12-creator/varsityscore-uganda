import { Fragment, useEffect, useState } from 'react'
import { getUFLGroup } from '../utils/uflGroup'
import sharedTeamAliases from '../../shared/teamAliases.json'
import { uflGroups } from '../data/uflGroups'
import { getCanonicalTeamName } from '../utils/teamIdentity'

type Goal = {
id?: string | number
team: string
scorer: string
assist?: string
minute?: number | null
type?: 'NORMAL' | 'PENALTY' | 'OWN_GOAL' | 'DIRECT_FREE_KICK'
}

type MatchCard = {
id: string | number
homeTeam: string
awayTeam: string
homeScore?: number
awayScore?: number
status: string
minute?: number
events?: string[]
date?: string
kickoffTime?: string
competition?: string
goals?: Goal[]
cards?: {
id?: string | number
team: string
player: string
minute?: number | null
type: 'YELLOW' | 'RED'
}[]
officialSource?: string
sourceType?: string
}

type TeamPairing = {
  opponent: string
  venue: 'Home' | 'Away'
  homeTeam: string
  awayTeam: string
  date: string | null
  kickoffTime: string | null
  sourcePage: number
}

type UniversityPairings = {
  name: string
  fixtures: TeamPairing[]
}

type UFLPairingsData = {
  season: string
  competition: string
  source: string
  note: string
  teamCount: number
  teamFixtureEntryCount: number
  teams: UniversityPairings[]
}

function Fixtures() {
const [matches, setMatches] = useState<MatchCard[]>([])
const [uflFixtures, setUflFixtures] = useState<MatchCard[]>([])
const [teamPairings, setTeamPairings] = useState<UniversityPairings[]>([])
const [loading, setLoading] = useState(true)
const [error, setError] = useState('')
const [expandedMatches, setExpandedMatches] = useState<string[]>([])
const [activeFilter, setActiveFilter] = useState('ALL')
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

const getStatus = (status: string) =>
  status.trim().toUpperCase().replace(/[_-]+/g, ' ')

const isFinished = (status: string) =>
  ['FINISHED', 'FULL TIME', 'FULLTIME', 'FT', 'COMPLETED'].includes(
    getStatus(status)
  )

const isLive = (status: string) =>
  ['LIVE', 'IN PLAY', 'IN PROGRESS'].includes(getStatus(status))

const isHalfTime = (status: string) =>
  ['HALF TIME', 'HALFTIME', 'HT'].includes(getStatus(status))

const isUpcoming = (status: string) =>
  ['SCHEDULED', 'NOT STARTED', 'UPCOMING'].includes(getStatus(status))

useEffect(() => {
async function fetchMatches() {
try {
const [matchesResponse, fixturesResponse, pairingsResponse] =
  await Promise.all([
    fetch('/api/matches'),
    fetch('/api/ufl-fixtures'),
    fetch('/api/ufl-team-pairings')
  ])

    if (
  !matchesResponse.ok ||
  !fixturesResponse.ok ||
  !pairingsResponse.ok
) {
  throw new Error('Could not load matches, fixtures and UFL pairings.')
}

    const matchesData: MatchCard[] = await matchesResponse.json()
    const fixturesData: MatchCard[] = await fixturesResponse.json()
const pairingsData: UFLPairingsData = await pairingsResponse.json()

    setMatches(matchesData)
    setUflFixtures(fixturesData)
    setTeamPairings(pairingsData.teams || [])
    setError('')
  } catch (error) {
    console.error('Unable to load fixtures:', error)
    setError('Unable to connect to the match server.')
  } finally {
    setLoading(false)
  }
}

fetchMatches()

const interval = setInterval(fetchMatches, 30000)

return () => clearInterval(interval)

}, [])

function toggleMatchDetails(id: string | number) {
const matchId = String(id)

setExpandedMatches((current) =>
  current.includes(matchId)
    ? current.filter((item) => item !== matchId)
    : [...current, matchId]
)

}

// Combine manually managed matches and automatically detected UFL fixtures.
const combinedMatches = [
...matches,
...uflFixtures.filter(
(fixture) =>
!matches.some(
(match) =>
String(match.id) === String(fixture.id) ||
(
match.homeTeam === fixture.homeTeam &&
match.awayTeam === fixture.awayTeam &&
match.date === fixture.date
)
)
)
]

// Resolve all detected university names to official UFL names.
const normalizedMatches = combinedMatches.map((match) => ({
  ...match,

  homeTeam: getCanonicalTeamName(match.homeTeam),
  awayTeam: getCanonicalTeamName(match.awayTeam),

  goals: match.goals?.map((goal) => ({
    ...goal,
    team: getCanonicalTeamName(goal.team),
  })),

  cards: match.cards?.map((card) => ({
    ...card,
    team: getCanonicalTeamName(card.team),
  })),
}))

const displayedMatches = normalizedMatches.filter(
  (match) =>
    match.homeTeam?.trim() !== '' &&
    match.awayTeam?.trim() !== ''
)

// Use Uganda's local date.
const today = new Intl.DateTimeFormat('en-CA', {
timeZone: 'Africa/Kampala',
year: 'numeric',
month: '2-digit',
day: '2-digit'
}).format(new Date())

// Display the latest matches first.
const sortedMatches = [...displayedMatches].sort((a, b) => {
return (b.date || '').localeCompare(a.date || '')
})

const upcomingMatches = sortedMatches.filter((match) =>
  isUpcoming(match.status)
)

const liveMatches = sortedMatches.filter(
  (match) => isLive(match.status) || isHalfTime(match.status)
)

const resultsMatches = sortedMatches.filter((match) =>
  isFinished(match.status)
)

const filteredMatches =
  activeFilter === 'UPCOMING'
    ? upcomingMatches
    : activeFilter === 'LIVE'
      ? liveMatches
      : activeFilter === 'RESULTS'
        ? resultsMatches
        : sortedMatches

return ( <main className="page-container">

  <header className="page-header">
    <p className="page-label">
      PEPSI UNIVERSITY FOOTBALL LEAGUE
    </p>

    <h1>Fixtures & Results</h1>

    <p>
      Explore university football fixtures and match results.
    </p>
  </header>

  <section className="page-content">
    <h2>Matches Centre</h2>

<div className="fixture-filter-bar">
  {[
    { id: 'ALL', label: 'All Matches' },
    { id: 'UPCOMING', label: 'Fixtures' },
    { id: 'LIVE', label: 'Live' },
    { id: 'RESULTS', label: 'Results' },
  ].map((filter) => (
    <button
      key={filter.id}
      type="button"
      className={
        activeFilter === filter.id
          ? 'fixture-filter-button active'
          : 'fixture-filter-button'
      }
      onClick={() => setActiveFilter(filter.id)}
    >
      {filter.label}
    </button>
  ))}
</div>

    <p>
      Fixtures and results refresh automatically every 30 seconds.
      Select a match to view its details.
      {teamPairings.length > 0 && (
        <> UFL pairings are available for {teamPairings.length} teams.</>
      )}
    </p>

    {loading ? (
      <p>Loading fixtures and results...</p>
    ) : error ? (
      <div className="no-live-matches">
        <h3>Connection Problem</h3>
        <p>{error}</p>
        <p>Make sure the VarsityScore backend is running.</p>
      </div>
    ) : activeFilter === 'ALL' ? (
  <div className="fixture-overview">
    {[
      {
        id: 'UPCOMING',
        title: 'Upcoming Fixtures',
        items: upcomingMatches,
      },
      {
        id: 'LIVE',
        title: 'Live Matches',
        items: liveMatches,
      },
      {
        id: 'RESULTS',
        title: 'Recent Results',
        items: resultsMatches,
      },
    ].map((category) => (
      <section
        key={category.id}
        className="fixture-overview-section"
      >
        <div className="fixture-overview-heading">
          <h3>{category.title}</h3>

          <button
            type="button"
            onClick={() => setActiveFilter(category.id)}
          >
            View all
          </button>
        </div>

        {category.items.length > 0 ? (
          category.items.slice(0, 4).map((match) => (
            <article
              key={match.id}
              className="fixture-preview-card"
            >
              <div className="fixture-preview-info">
                <span>{match.date || 'Date not announced'}</span>

                <span>
                  {isLive(match.status)
                    ? `● LIVE ${match.minute != null ? `${match.minute}'` : 'In progress'}`
                    : isHalfTime(match.status)
                      ? 'HALF TIME'
                      : isFinished(match.status)
                        ? 'FULL TIME'
                        : 'UPCOMING'}
                </span>
              </div>

              <div className="fixture-preview-teams">

  <div className="fixture-preview-team-row">
    <span>{match.homeTeam}</span>
    {!isUpcoming(match.status) && (
      <strong>{match.homeScore ?? 0}</strong>
    )}
  </div>

  {isUpcoming(match.status) && (
    <div className="fixture-preview-vs">VS</div>
  )}

  <div className="fixture-preview-team-row">
    <span>{match.awayTeam}</span>
    {!isUpcoming(match.status) && (
      <strong>{match.awayScore ?? 0}</strong>
    )}
  </div>

</div>
            </article>
          ))
        ) : (
          <p>No {category.title.toLowerCase()} available.
            Alternatively check team details in team page to view team pairigs
          and results
          </p>
        )}
      </section>
    ))}
  </div>
) : filteredMatches.length > 0 ? (
      <div className="fixtures-list">

{filteredMatches.map((match, index) => {
  const previousMatch = filteredMatches[index - 1]

  const showDateHeading =
    index === 0 || match.date !== previousMatch?.date

  const matchdayTitle = match.date
    ? new Date(`${match.date}T12:00:00`).toLocaleDateString(
        'en-UG',
        {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }
      )
    : 'Date not announced'

          const isPlayed = isFinished(match.status)

          const isMatchDay =
            match.date === today &&
            match.status === 'SCHEDULED'

          const isExpanded = expandedMatches.includes(
            String(match.id)
          )

          const hasDetails = Boolean(
            (match.goals && match.goals.length > 0) ||
            (match.cards && match.cards.length > 0) ||
            (match.events && match.events.length > 0) ||
            match.officialSource
          )

          return (
  <Fragment key={match.id}>
    {showDateHeading && (
      <h3 className="fixture-matchday-heading">
        {matchdayTitle}
      </h3>
    )}

    <article className="fixture-card">
              <div className="fixture-information">
                <span className="fixture-competition">
                  {match.competition || 'Pepsi UFL'}
                </span>

                <span className="fixture-status">
                  {isLive(match.status)
                    ? `● LIVE ${match.minute ?? 0}'`
                    : isHalfTime(match.status)
                      ? 'HALF TIME'
                      : isFinished(match.status)
                        ? 'FULL TIME'
                        : isMatchDay
                          ? 'MATCH DAY'
                          : isUpcoming(match.status)
                            ? 'UPCOMING'
                            : match.status}
                </span>
              </div>

              {(match.date || match.kickoffTime) && (
                <p className="fixture-date">
                  {match.date && `Date: ${match.date}`}
                  {match.date && match.kickoffTime && ' | '}
                  {match.kickoffTime &&
                    `Kickoff: ${match.kickoffTime}`}
                </p>
              )}

              <div className="fixture-teams">
  <span className="fixture-team-name">
    {getOfficialTeamName(match.homeTeam)}

    {isPlayed && getUFLGroup(match.homeTeam) && (
      <small className="fixture-group-badge">
        {getUFLGroup(match.homeTeam)}
      </small>
    )}
  </span>

  <strong>
    {match.status === 'SCHEDULED' ||
    match.status === 'NOT STARTED'
      ? 'VS'
      : `${match.homeScore ?? 0} - ${match.awayScore ?? 0}`}
  </strong>

  <span className="fixture-team-name">
    {getOfficialTeamName(match.awayTeam)}

    {isPlayed && getUFLGroup(match.awayTeam) && (
      <small className="fixture-group-badge">
        {getUFLGroup(match.awayTeam)}
      </small>
    )}
  </span>
</div>

              {isLive(match.status) && (
                <p>Match minute: {match.minute ?? 0}'</p>
              )}

              { isHalfTime(match.status)&& (
                <p>Half-time break</p>
              )}

              {isPlayed && <p>Match ended</p>}

              <button
                type="button"
                className="match-details-button"
                onClick={() => toggleMatchDetails(match.id)}
                aria-expanded={isExpanded}
              >
                {isExpanded
                  ? 'Hide Match Details'
                  : 'View Match Details'}
              </button>

              {isExpanded && (
                <div className="match-details">
                  <h3>Match Details</h3>

                  <h4>Goals</h4>

                  {match.goals && match.goals.length > 0 ? (
                    <ul>
                      {match.goals
                        .slice()
                        .sort(
                          (a, b) =>
                            (a.minute ?? 0) - (b.minute ?? 0)
                        )
                        .map((goal, index) => (
                          <li
                            key={
                              goal.id ??
                              `${goal.team}-${goal.scorer}-${goal.minute}-${index}`
                            }
                          >
                            ⚽{' '}
                            {goal.minute != null && (
                              <strong>{goal.minute}'</strong>
                            )}
                            {goal.minute == null && (
                              <strong>Not stated</strong>
                            )}
                            {' — '}
                            {goal.scorer} ({goal.team})

                            {goal.type === 'PENALTY' && ' — Penalty'}
                            {goal.type === 'OWN_GOAL' && ' — Own goal'}
                            {goal.type === 'DIRECT_FREE_KICK' &&
                              ' — Direct free kick'}

                            {goal.assist &&
                              ` — Assist: ${goal.assist}`}
                          </li>
                        ))}
                    </ul>
                  ) : (
                    <p>No goal details recorded yet.</p>
                  )}

                  <h4>Cards</h4>

                  {match.cards && match.cards.length > 0 ? (
                    <ul>
                      {match.cards
                        .slice()
                        .sort(
                          (a, b) =>
                            (a.minute ?? 0) - (b.minute ?? 0)
                        )
                        .map((card, index) => (
                          <li
                            key={
                              card.id ??
                              `${card.team}-${card.player}-${card.minute}-${index}`
                            }
                          >
                            {card.type === 'YELLOW' ? '🟨' : '🟥'}{' '}
                            {card.minute != null
                              ? `${card.minute}'`
                              : 'Minute not stated'}
                            {' — '}
                            {card.player} ({card.team}) —{' '}
                            {card.type === 'YELLOW'
                              ? 'Yellow card'
                              : 'Red card'}
                          </li>
                        ))}
                    </ul>
                  ) : (
                    <p>No card details recorded yet.</p>
                  )}

                  <h4>Match Events</h4>

                  {match.events && match.events.length > 0 ? (
                    <ul>
                      {match.events.map((event, index) => (
                        <li key={`${event}-${index}`}>
                          {event}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>No additional match events recorded.</p>
                  )}

                  {match.officialSource && (
                    <p>
                      <a
                        href={match.officialSource}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View Official Source
                      </a>
                    </p>
                  )}

                  {!hasDetails && (
                    <p>
                      More match information will appear when it
                      becomes available.
                    </p>
                  )}
                </div>
              )}
            </article>
              </Fragment>
)
        })}
      </div>
    ) : (
      <div className="no-live-matches">
        <div className="no-live-icon">⚽</div>

        <h3>No Live Events Yet</h3>
        <p>
      STAY TUNED! The Pepsi University Football League is gearing up for an exciting season.
      </p>
      </div>
    )}

    <p className="demo-notice">
      STAY LIVE, LIVE LIVE
    </p>
  </section>
</main>

)
}

export default Fixtures
