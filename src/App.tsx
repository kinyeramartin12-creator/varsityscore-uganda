import { Routes, Route, Outlet } from 'react-router-dom'
import Standings from './pages/standings'
import { useState, useEffect } from 'react'
import './App.css'
import PlayerStats from "./pages/PlayerStats"
import PageNavigation from './components/pagenavigation'
import { uflGroups } from './data/uflGroups'
import { getCanonicalTeamName } from './utils/teamIdentity'

type Match = {
id: string | number
date: string
competition?: string
kickoffTime?: string
homeTeam: string
awayTeam: string
status: string
homeScore: number
awayScore: number
minute?: number
events?: string[]
}


import './App.css'
import Fixtures from './pages/fixtures'
import Teams from './pages/teams'
import LiveScores from './pages/LiveScore'
import TeamDetails from './pages/TeamDetails'
import News from "./pages/News"
import MatchControl from './pages/MatchControl'
import AdminPepsiUFL from './pages/AdminPepsiUFL'

type TeamStanding = {
  team: string
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  points: number
}

function MatchCard({ match }: { match: Match }) {
  return (
    <article className="match-card">
      <div className="match-date">{match.date}</div>

      <div className="match-competition">
        {match.competition ?? 'Pepsi UFL'}
      </div>

      <div className="match-teams">
        <div className="team">
          <span className="team-name">
  {getCanonicalTeamName(match.homeTeam)}
</span>
          <strong>{match.homeScore}</strong>
        </div>

        <div className="team">
          <span className="team-name">
  {getCanonicalTeamName(match.awayTeam)}
</span>
          <strong>{match.awayScore}</strong>
        </div>
      </div>

      <div className="match-status finished">
        FULL TIME
      </div>
    </article>
  )
}

function resolveTeamKey(teamName: string): string {
  return getCanonicalTeamName(teamName)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function calculateStandings(matches: Match[]): TeamStanding[] {
  const teams: Record<string, TeamStanding> = {}

  // Register all official UFL teams using their official names.
  uflGroups.forEach((group) => {
    group.teams.forEach((teamName) => {
      const key = resolveTeamKey(teamName)

      teams[key] = {
        team: teamName,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        points: 0,
      }
    })
  })

  // Process completed matches.
  matches.forEach((match) => {
    if (match.status !== 'FINISHED') return

    const homeKey = resolveTeamKey(match.homeTeam)
    const awayKey = resolveTeamKey(match.awayTeam)

    const home = teams[homeKey]
    const away = teams[awayKey]

    if (!home || !away || homeKey === awayKey) return

    const homeGoals = Number(match.homeScore)
    const awayGoals = Number(match.awayScore)

    home.played++
    away.played++

    home.goalsFor += homeGoals
    home.goalsAgainst += awayGoals

    away.goalsFor += awayGoals
    away.goalsAgainst += homeGoals

    if (homeGoals > awayGoals) {
      home.won++
      home.points += 3
      away.lost++
    } else if (homeGoals < awayGoals) {
      away.won++
      away.points += 3
      home.lost++
    } else {
      home.drawn++
      away.drawn++
      home.points++
      away.points++
    }
  })

  return Object.values(teams).sort((a, b) => {
    const goalDifferenceA = a.goalsFor - a.goalsAgainst
    const goalDifferenceB = b.goalsFor - b.goalsAgainst

    return (
      b.points - a.points ||
      goalDifferenceB - goalDifferenceA ||
      b.goalsFor - a.goalsFor
    )
  })
}

function Home() {

    const [matches, setMatches] = useState<Match[]>([])

  useEffect(() => {
    const fetchMatches = async () => {
      try {
        const response = await fetch('/api/matches')
        if (!response.ok) return

        const data: Match[] = await response.json()
        setMatches(data)
      } catch (error) {
        console.error('Failed to load matches:', error)
      }
    }

    fetchMatches()
    const interval = setInterval(fetchMatches, 5000)

    return () => clearInterval(interval)
  }, [])

  const standings = calculateStandings(matches)

 const recentResults = [...matches]
  .filter((match) => match.status === 'FINISHED')
  .sort((a, b) => {
    const dateA = new Date(a.date).getTime()
    const dateB = new Date(b.date).getTime()

    if (Number.isNaN(dateA)) return 1
    if (Number.isNaN(dateB)) return -1

    return dateB - dateA
  })
  .slice(0, 4)

  const upcomingMatches = [...matches]
  .filter(
    (match) =>
      match.status === 'SCHEDULED' ||
      match.status === 'NOT STARTED'
  )
  .sort((a, b) => {
    const dateA = new Date(a.date).getTime()
    const dateB = new Date(b.date).getTime()

    if (Number.isNaN(dateA)) return 1
    if (Number.isNaN(dateB)) return -1

    return dateA - dateB
  })
  .slice(0, 4)
  
  return ( 
  <div className="app"> 
  

  <main id="home">
    <section className="hero">
      <div className="hero-content">
        <p className="eyebrow">UGANDA UNIVERSITY FOOTBALL</p>
        <h1>Every Match.<br /><span>Every Moment.</span></h1>
        <p className="hero-description">
          Your home for Pepsi University Football League scores,
          fixtures, results and university football updates.
        </p>
        <a className="primary-button" href="#live">Explore Matches ↗</a>
      </div>

      <div className="hero-badge">
        <span className="badge-top">YOUR HOME FOR</span>
        <strong>PEPSI</strong>
        <strong>UFL</strong>
        <span className="badge-bottom">UNIVERSITY FOOTBALL</span>
      </div>
    </section>

    <section className="competition-strip">
      <div>
        <span className="status-dot"></span>
        <span>PEPSI UNIVERSITY FOOTBALL LEAGUE</span>
      </div>
      <span className="season-label">UGANDA · MATCH CENTRE</span>
    </section>

<section className="content-section" id="upcoming">
  <div className="section-heading">
    <div>
      <p className="section-kicker">WHAT'S NEXT</p>
      <h2>Upcoming Matches</h2>
    </div>
  </div>

  <div className="match-count">
    Showing {upcomingMatches.length} upcoming matches
  </div>

  {upcomingMatches.length > 0 ? (
    <div className="match-list">
      {upcomingMatches.map((match) => (
        <MatchCard
          key={match.id}
          match={match}
        />
      ))}
    </div>
  ) : (
    <div className="empty-state">
      <h3>No upcoming matches available</h3>
      <p>New fixtures will appear here when they are added.</p>
    </div>
  )}
</section>

    <section className="content-section" id="live">
      <div className="section-heading">
        <div>
          <p className="section-kicker">FOLLOW THE ACTION</p>
          <h2>Recent Results</h2>
        </div>
      </div>

      <div className="match-count">
  Showing {recentResults.length} most recent completed matches
</div>

{recentResults.length > 0 ? (
  <div className="match-list">
    {recentResults.map((match) => (
      <MatchCard
        key={match.id}
        match={match}
      />
    ))}
  </div>
) : (
  <div className="empty-state">
    <h3>No completed matches yet</h3>
    <p>Recent results will appear here when matches finish.</p>
  </div>
)}

    </section>

        <section className="content-section standings-section" id="standings">
          <div className="section-heading">
            <div>
              <p className="section-kicker">THE RACE FOR GLORY</p>
              <h2>UFL Overall Standings</h2>
            </div>
          </div>

          <div className="table-wrapper">
            <table className="standings-table">
            <thead>
  <tr>
    <th>POS</th>
    <th>TEAM</th>
    <th>P</th>
    <th>W</th>
    <th>D</th>
    <th>L</th>
    <th>GF</th>
    <th>GA</th>
    <th>GD</th>
    <th>PTS</th>
  </tr>
</thead>

              <tbody>
               {standings.map((team, index) => (
  <tr key={team.team}>
    <td>{index + 1}</td>
    <td className="standings-team">{team.team}</td>
    <td>{team.played}</td>
    <td>{team.won}</td>
    <td>{team.drawn}</td>
    <td>{team.lost}</td>
    <td>{team.goalsFor}</td>
    <td>{team.goalsAgainst}</td>
    <td>
      {team.goalsFor - team.goalsAgainst > 0 ? '+' : ''}
      {team.goalsFor - team.goalsAgainst}
    </td>
    <td className="points">{team.points}</td>
  </tr>
))}
              </tbody>
            </table>
          </div>

          <p className="table-note">
            OVERALL STANDINGS ACROSS ALL GROUPS. TEAMS ARE RANKED BY POINTS, THEN GOAL DIFFERENCE, THEN GOALS FOR.
          </p>
        </section>


  </main>

  <footer className="footer">
    <a className="brand footer-brand" href="#home">
      <span className="brand-icon">V</span>
      <span>VARSITY<span className="brand-accent">SCORE</span></span>
    </a>
    <p>Built for university football fans in Uganda.</p>
    <span className="footer-tag">PEPSI UFL</span>
  </footer>
</div>

)
}

function SiteLayout() {
  return (
    <div className="site-shell">
      <PageNavigation />

      <div className="site-content">
        <Outlet />
      </div>
    </div>
  )
}

function App() {
  const [showSplash, setShowSplash] = useState(
    () => !sessionStorage.getItem("varsityscore-intro-seen")
  )

  useEffect(() => {
    if (!showSplash) return

    const timer = setTimeout(() => {
      sessionStorage.setItem("varsityscore-intro-seen", "true")
      setShowSplash(false)
    }, 2000)

    return () => clearTimeout(timer)
  }, [showSplash])

  return (
  <>
    {showSplash ? (
      <div className="splash-screen">
        <div className="splash-logo">
          <span>V</span>
          <span>S</span>
        </div>

        <h1 className="splash-title">
          VARSITY<span>SCORE</span>
        </h1>

        <p className="splash-country">UGANDA</p>

        <div className="splash-loader">
          <span />
        </div>

        <p className="splash-tagline">
          EVERY MATCH. EVERY MOMENT.
        </p>
      </div>
    ) : (
      <Routes>
        <Route element={<SiteLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/standings" element={<Standings />} />
          <Route path="/fixtures" element={<Fixtures />} />
          <Route path="/teams" element={<Teams />} />
          <Route path="/teams/:teamName" element={<TeamDetails />} />
          <Route path="/live-scores" element={<LiveScores />} />
          <Route path="/match-control" element={<MatchControl />} />
          <Route path="/news" element={<News />} />
          <Route path="/player-stats" element={<PlayerStats />} />
          <Route path="*" element={<Home />} />
        </Route>

        <Route path="/admin/pepsi-ufl" element={<AdminPepsiUFL />} />
      </Routes>
    )}
  </>
)
}

export default App
