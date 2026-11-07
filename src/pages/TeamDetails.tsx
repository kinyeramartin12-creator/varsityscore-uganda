import { useParams, Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { uflGroups } from '../data/uflGroups'

function TeamDetails() {

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

const [matches, setMatches] = useState<Match[]>([])

type TeamPairing = {
  opponent: string
  venue: "Home" | "Away"
  homeTeam: string
  awayTeam: string
  date: string | null
  kickoffTime: string | null
  sourcePage: number
}

type SharedTeamAliases = Record<string, string[]>

type PairingsData = {
  season: string
  teams: {
    name: string
    fixtures: TeamPairing[]
  }[]
}

const [sharedTeamAliases, setSharedTeamAliases] =
  useState<SharedTeamAliases>({})

const [pairingsData, setPairingsData] =
  useState<PairingsData | null>(null)

useEffect(() => {
  const loadPairings = async () => {
    try {
      const response = await fetch(
        "http://localhost:3001/api/ufl-team-pairings"
      )

      if (!response.ok) {
        throw new Error("Failed to load UFL pairings")
      }

      const data: PairingsData = await response.json()
      setPairingsData(data)
    } catch (error) {
      console.error("Unable to load UFL pairings:", error)
    }
  }

  loadPairings()
}, [])

useEffect(() => {
  const loadTeamAliases = async () => {
    try {
      const response = await fetch(
        "http://localhost:3001/api/team-aliases"
      )

      if (!response.ok) {
        throw new Error("Failed to load shared team aliases")
      }

      const data: SharedTeamAliases = await response.json()
      setSharedTeamAliases(data)
    } catch (error) {
      console.error("Unable to load shared team aliases:", error)
    }
  }

  loadTeamAliases()
}, [])

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
      console.error('Unable to load team matches:', error)
    }
  }

  loadMatches()

  const interval = setInterval(loadMatches, 5000)

  return () => clearInterval(interval)
}, [])

    const shareTeam = async () => {
  const shareData = {
    title: `${formattedName} - VarsityScore Uganda`,
    text: `View ${formattedName}'s team profile on VarsityScore Uganda.`,
    url: window.location.href,
  }

  try {
    if (navigator.share) {
      await navigator.share(shareData)
    } else {
      await navigator.clipboard.writeText(shareData.url)
      alert('Team profile link copied!')
    }
  } catch (error) {
    if (error instanceof Error && error.name !== 'AbortError') {
      alert('Unable to share the link. Please copy it from your browser.')
    }
  }
}

    const scrollToSection = (sectionId: string) => {
  document.getElementById(sectionId)?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  })
}

const { teamName } = useParams()

const formattedName = teamName
  ? teamName
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  : 'Unknown Team'

const normalizeName = (name: string) =>
  String(name || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]/g, '')

const getCanonicalTeamName = (name: string) => {
  const normalizedName = normalizeName(name)

  for (const [canonicalName, aliases] of Object.entries(sharedTeamAliases)) {
    const allNames = [canonicalName, ...aliases]

    if (allNames.some((alias) => normalizeName(alias) === normalizedName)) {
      return normalizeName(canonicalName)
    }
  }

  return normalizedName
}

const canonicalTeam = getCanonicalTeamName(formattedName)

const isSameTeam = (name: string) =>
  getCanonicalTeamName(name) === canonicalTeam

const getOfficialTeamName = (name: string) => {
  const canonicalName = getCanonicalTeamName(name)

  for (const group of uflGroups) {
    const officialName = group.teams.find(
      (team) => getCanonicalTeamName(team) === canonicalName
    )

    if (officialName) return officialName
  }

  return name
}


const teamMatches = matches.filter(
  (match) => isSameTeam(match.homeTeam) || isSameTeam(match.awayTeam)
)

const completedMatches = teamMatches.filter(
  (match) => match.status === 'FINISHED'
)

const upcomingMatches = teamMatches.filter(
  (match) => match.status === 'NOT STARTED'
)

const teamHistory = [...completedMatches].reverse()

const recentForm = teamHistory.slice(0, 5).map((match) => {
  const isHome = isSameTeam(match.homeTeam)
  const teamScore = isHome ? match.homeScore : match.awayScore
  const opponentScore = isHome ? match.awayScore : match.homeScore

  if (teamScore > opponentScore) return 'W'
  if (teamScore < opponentScore) return 'L'
  return 'D'
})

const wins = completedMatches.filter(
  (match) =>
    (isSameTeam(match.homeTeam) && match.homeScore > match.awayScore) ||
    (isSameTeam(match.awayTeam) && match.awayScore > match.homeScore)
).length

const draws = completedMatches.filter(
  (match) => match.homeScore === match.awayScore
).length

const losses = completedMatches.length - wins - draws
const points = wins * 3 + draws
const totalPlayed = completedMatches.length
const unbeatenMatches = wins + draws

const unbeatenPercentage =
  totalPlayed > 0
    ? Math.round((unbeatenMatches / totalPlayed) * 100)
    : 0

const winPercentage =
  totalPlayed > 0
    ? Math.round((wins / totalPlayed) * 100)
    : 0

let performanceMessage = 'No completed matches available yet.'

if (completedMatches.length > 0) {
  if (wins > losses) {
    performanceMessage = 'This team has more wins than losses.'
  } else if (losses > wins) {
    performanceMessage = 'This team has more losses than wins.'
  } else {
    performanceMessage = 'Wins and losses are currently balanced.'
  }
}

const goalsScored = completedMatches.reduce(
  (total, match) =>
    total +
    (isSameTeam(match.homeTeam) ? match.homeScore : match.awayScore),
  0
)

const goalsConceded = completedMatches.reduce(
  (total, match) =>
    total +
    (isSameTeam(match.homeTeam) ? match.awayScore : match.homeScore),
  0
)

const cleanSheets = completedMatches.filter((match) => {
  const isHome = isSameTeam(match.homeTeam)
  const conceded = isHome ? match.awayScore : match.homeScore
  return conceded === 0
}).length

const averageGoalsScored =
  totalPlayed > 0
    ? (goalsScored / totalPlayed).toFixed(2)
    : '0.00'

const averageGoalsConceded =
  totalPlayed > 0
    ? (goalsConceded / totalPlayed).toFixed(2)
    : '0.00'

const goalDifference = goalsScored - goalsConceded
const totalGoals = goalsScored + goalsConceded

const scoringPercentage =
  totalGoals > 0
    ? Math.round((goalsScored / totalGoals) * 100)
    : 0

const concedingPercentage =
  totalGoals > 0
    ? Math.round((goalsConceded / totalGoals) * 100)
    : 0

let goalEfficiencyMessage = 'No completed matches to analyse yet.'

if (totalPlayed > 0) {
  if (goalDifference > 0) {
    goalEfficiencyMessage =
      'Strong attack: more goals scored than conceded.'
  } else if (goalDifference < 0) {
    goalEfficiencyMessage =
      'Needs improvement: more goals conceded than scored.'
  } else {
    goalEfficiencyMessage =
      'Balanced: goals scored equal goals conceded.'
  }
}

const currentTeamPairings =
  pairingsData?.teams.find(
    (item) => getCanonicalTeamName(item.name) === canonicalTeam
  )?.fixtures || []

const getPairingMatch = (fixture: TeamPairing) => {
  return matches.find((match) => {
    const directMatch =
      getCanonicalTeamName(match.homeTeam) ===
        getCanonicalTeamName(fixture.homeTeam) &&
      getCanonicalTeamName(match.awayTeam) ===
        getCanonicalTeamName(fixture.awayTeam)

    const reversedMatch =
      getCanonicalTeamName(match.homeTeam) ===
        getCanonicalTeamName(fixture.awayTeam) &&
      getCanonicalTeamName(match.awayTeam) ===
        getCanonicalTeamName(fixture.homeTeam)

    return directMatch || reversedMatch
  })
}

useEffect(() => {
  document.title = `${formattedName} - VarsityScore Uganda`

  return () => {
    document.title = 'VarsityScore Uganda'
  }
}, [formattedName])

return ( <main className="page-container"> <header className="page-header"> <p className="page-label">

<div className="team-back-navigation">
  <Link to="/teams">← Back to All Teams</Link>
</div>

PEPSI UNIVERSITY FOOTBALL LEAGUE </p>
    
    <div className="team-details-badge">
  {formattedName
    .split(/\s+/)
    .filter((word) => !['of', 'the', 'and'].includes(word.toLowerCase()))
    .map((word) => word[0])
    .slice(0, 3)
    .join('')
    .toUpperCase()}
</div>
    
    <h1>{formattedName}</h1>

    <p className="team-details-subtitle">
  Follow {formattedName} on VarsityScore Uganda.
</p>
  </header>

  <section className="team-hero-banner">
  <div className="team-hero-content">
    <p className="team-hero-label">
      UNIVERSITY FOOTBALL
    </p>

    <h2>{formattedName}</h2>

    <p>
      Match results, upcoming fixtures, and team statistics
      in one place.
    </p>
  </div>

  <button
  type="button"
  className="share-team-button"
  onClick={shareTeam}
>
  Share Team Profile
</button>

  <div className="team-hero-decoration">
    VS
  </div>
</section>

<nav className="team-section-navigation" aria-label="Team profile sections">
  <button type="button" onClick={() => scrollToSection('team-overview')}>
    Overview
  </button>

  <button type="button" onClick={() => scrollToSection('team-statistics')}>
    Statistics
  </button>

  <button type="button" onClick={() => scrollToSection('team-history')}>
    Match History
  </button>

  <button type="button" onClick={() => scrollToSection('team-upcoming')}>
    Upcoming Fixtures
  </button>
</nav>

<button
  type="button"
  onClick={() => scrollToSection('team-pairings')}
>
  Season Pairings
</button>

  <section className="page-content" id="team-overview">
    <h2>Team Overview</h2>
    
    <div className="team-statistics" id="team-statistics">
  <div className="team-stat-card">
    <span>Played</span>
    <strong>{completedMatches.length}</strong>
  </div>

  <div className="team-stat-card">
  <span>Points</span>
  <strong>{points}</strong>
</div>

  <div className="team-stat-card">
    <span>Wins</span>
    <strong>{wins}</strong>
  </div>

  <div className="team-stat-card">
    <span>Draws</span>
    <strong>{draws}</strong>
  </div>

  <div className="team-stat-card">
    <span>Losses</span>
    <strong>{losses}</strong>
  </div>

  <div className="team-stat-card">
    <span>Goals Scored</span>
    <strong>{goalsScored}</strong>
  </div>

  <div className="team-stat-card">
  <span>Goals Conceded</span>
  <strong>{goalsConceded}</strong>
</div>

<div className="team-stat-card">
  <span>Clean Sheets</span>
  <strong>{cleanSheets}</strong>
</div>

<div className="team-stat-card">
  <span>Goal Difference</span>
  <strong>
    {goalDifference > 0 ? '+' : ''}{goalDifference}
  </strong>
</div>

  <div className="team-stat-card">
  <span>Win Rate</span>
  <strong>{winPercentage}%</strong>
</div>

<div className="team-win-rate-panel">
  <div className="team-win-rate-heading">
    <span>Win Rate Progress</span>
    <strong>{winPercentage}%</strong>
  </div>

  <div className="team-win-rate-track">
    <div
      className="team-win-rate-fill"
      style={{ width: `${winPercentage}%` }}
    />
  </div>
</div>

<div className="team-stat-card">
  <span>Upcoming</span>
  <strong>{upcomingMatches.length}</strong>
</div>

</div>

<div className="team-performance-summary">
  <h3>Performance Summary</h3>
  <p>{performanceMessage}</p>
</div>

<div className="goal-efficiency-summary">
  <h3>Goal Efficiency</h3>
  <p>{goalEfficiencyMessage}</p>
  <p>
    Goal Difference: {goalDifference > 0 ? '+' : ''}
    {goalDifference}
  </p>
</div>

<div className="team-scoring-breakdown">
  <h3>Scoring Breakdown</h3>

  <div className="scoring-breakdown-row">
    <span>Goals Scored</span>
    <strong>{goalsScored}</strong>
  </div>

  <div className="scoring-breakdown-bar">
    <div
      className="scoring-bar-scored"
      style={{ width: `${scoringPercentage}%` }}
    />
  </div>

  <div className="scoring-breakdown-row">
    <span>Goals Conceded</span>
    <strong>{goalsConceded}</strong>
  </div>

  <div className="scoring-breakdown-bar">
    <div
      className="scoring-bar-conceded"
      style={{ width: `${concedingPercentage}%` }}
    />
  </div>
</div>

<div className="team-recent-form">
  <h3>Recent Form</h3>

  <div className="team-form-results">
    {recentForm.length === 0 ? (
      <p>No recent results available.</p>
    ) : (
      recentForm.map((result, index) => (
        <span
          className={`team-form-badge form-${result.toLowerCase()}`}
          key={`${result}-${index}`}
        >
          {result}
        </span>
      ))
    )}
  </div>

  <p>Last {recentForm.length} completed matches</p>
</div>

    <p>
      Team information, fixtures, and results will appear here
      as verified data becomes available.
    </p>

    <Link to="/teams">← Back to All Teams</Link>
  
<div className="team-history" id="team-history">
  <h2>Match History</h2>

  {teamHistory.length === 0 ? (
    <p>No completed matches are available for this team yet.</p>
  ) : (
    teamHistory.map((match) => {
      const isHome =
        isSameTeam(match.homeTeam)

      const opponent = isHome
        ? match.awayTeam
        : match.homeTeam

      const teamScore = isHome
        ? match.homeScore
        : match.awayScore

      const opponentScore = isHome
        ? match.awayScore
        : match.homeScore

      const result =
        teamScore > opponentScore
          ? 'W'
          : teamScore < opponentScore
            ? 'L'
            : 'D'

      return (
        <article className="team-history-card" key={match.id}>
          <div>


            <strong className={`result-indicator result-${result.toLowerCase()}`}>
  {result}
</strong>
            <span>{getOfficialTeamName(opponent)}</span>
          </div>

          <div className="team-history-score">
            {teamScore} - {opponentScore}
          </div>

          <small>{match.date}</small>
        </article>
      )
    })
  )}
</div>

<div className="team-upcoming-fixtures" id="team-pairings">
  <h2>2026/27 Season Pairings</h2>

  <p>
    Official Pepsi University Football League opponents for this season.
  </p>

  <p>
    {currentTeamPairings.length} of 6 pairings loaded
  </p>

  {currentTeamPairings.length === 0 ? (
    <p>Pairings are loading or are not available for this university.</p>
  ) : (
    currentTeamPairings.map((fixture, index) => {
      const match = getPairingMatch(fixture)

      const isReversed = Boolean(
  match &&
    getCanonicalTeamName(match.homeTeam) ===
      getCanonicalTeamName(fixture.awayTeam) &&
    getCanonicalTeamName(match.awayTeam) ===
      getCanonicalTeamName(fixture.homeTeam)
)
      const homeScore = match
        ? isReversed ? match.awayScore : match.homeScore
        : null

      const awayScore = match
        ? isReversed ? match.homeScore : match.awayScore
        : null

      const status = match?.status?.toUpperCase() || ""

      let displayStatus = "UPCOMING"

      if (["FINISHED", "FT", "FULL TIME"].includes(status)) {
        displayStatus = "FINISHED"
      } else if (
        ["LIVE", "IN PLAY", "SECOND HALF", "FIRST HALF", "HALF TIME", "HT"].includes(status)
      ) {
        displayStatus = "LIVE"
      } else if (match) {
        displayStatus = "AWAITING VERIFICATION"
      }

      return (
        <article
          className="upcoming-fixture-card"
          key={`${fixture.homeTeam}-${fixture.awayTeam}-${index}`}
        >
          <div className="upcoming-fixture-teams">
            <strong>{getOfficialTeamName(fixture.homeTeam)}</strong>

            {match && displayStatus !== "AWAITING VERIFICATION" ? (
              <strong>
                {homeScore ?? 0} - {awayScore ?? 0}
              </strong>
            ) : (
              <span>vs</span>
            )}

            <strong>{getOfficialTeamName(fixture.awayTeam)}</strong>
          </div>

          <p>
            {fixture.venue === "Home" ? "🏠 Home match" : "✈️ Away match"}
          </p>

          <p>
            Status: {displayStatus}
          </p>

          <p>
            Date: {match?.date || fixture.date || "Not yet confirmed"}
          </p>

          <p>
            Kickoff: {match?.kickoffTime || fixture.kickoffTime || "Not yet confirmed"}
          </p>
        </article>
      )
    })
  )}
</div>

<div className="team-upcoming-fixtures" id="team-upcoming">
  <h2>Upcoming Fixtures</h2>

  {upcomingMatches.length === 0 ? (
    <p>No upcoming fixtures are available for this team yet.</p>
  ) : (
    upcomingMatches.map((match) => {
      const isHome =
        isSameTeam(match.homeTeam)

      const opponent = isHome
        ? match.awayTeam
        : match.homeTeam

      return (
        <article
          className="upcoming-fixture-card"
          key={match.id}
        >
          <div className="upcoming-fixture-teams">
            <strong>{getOfficialTeamName(isHome ? formattedName : opponent)}</strong>
<span>vs</span>
<strong>{getOfficialTeamName(isHome ? opponent : formattedName)}</strong>
          </div>

          <p>{match.date}</p>

          <span className="upcoming-fixture-status">
            {match.status}
          </span>
        </article>
      )
    })
  )}
</div>

<div className="team-goal-averages">
  <div>
    <span>Goals Scored Per Match</span>
    <strong>{averageGoalsScored}</strong>
  </div>

  <div>
    <span>Goals Conceded Per Match</span>
    <strong>{averageGoalsConceded}</strong>
  </div>
</div>

<div className="team-overview-summary">
  <div>
    <span>Matches Played</span>
    <strong>{totalPlayed}</strong>
  </div>

  <div>
    <span>Matches Without Defeat</span>
    <strong>{unbeatenMatches}</strong>
  </div>

  <div>
    <span>Unbeaten Rate</span>
    <strong>{unbeatenPercentage}%</strong>
  </div>
</div>

<div className="back-to-top-container">
  <button
    type="button"
    className="back-to-top-button"
    onClick={() => scrollToSection('team-overview')}
  >
    ↑ Back to Top
  </button>
</div>

  </section>
</main>

)
}

export default TeamDetails
