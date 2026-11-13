import { useEffect, useRef, useState } from 'react'
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

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)

  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/')

  const rawData = window.atob(base64)

  return Uint8Array.from(
    Array.from(rawData).map(char => char.charCodeAt(0))
  )
}

function LiveScores() {
  const [matches, setMatches] = useState<LiveMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState('')
  const [resultSearch, setResultSearch] = useState('')
  const [showAllResults, setShowAllResults] = useState(false)
  
  const [notificationsEnabled, setNotificationsEnabled] = useState(() =>
  typeof window !== 'undefined' &&
  localStorage.getItem('varsityscore-notifications-enabled') === 'true'
)

const previousMatchesRef = useRef<LiveMatch[] | null>(null)


  useEffect(() => {
  async function fetchMatch() {
    try {
      const response = await fetch('/api/matches')

      if (!response.ok) {
        throw new Error('Could not load match data')
      }

      const data: LiveMatch[] = await response.json()

      const previousMatches = previousMatchesRef.current

      const notify = (title: string, body: string, tag: string) => {
       if (
  'Notification' in window &&
  Notification.permission === 'granted' &&
  localStorage.getItem('varsityscore-notifications-enabled') === 'true'
) {
  new Notification(title, { body, tag })
}
      }

      if (previousMatches) {
        const oldMatches = new Map(
          previousMatches.map(match => [match.id, match])
        )

        data.forEach(match => {
          const previous = oldMatches.get(match.id)

          if (!previous) return

          const matchName = `${match.homeTeam} vs ${match.awayTeam}`

          const oldGoals = new Set(
            (previous.goals || []).map(goal =>
              goal.id || `${goal.scorer}-${goal.minute}`
            )
          )

          ;(match.goals || []).forEach(goal => {
            const goalKey =
              goal.id || `${goal.scorer}-${goal.minute}`

            if (!oldGoals.has(goalKey)) {
              notify(
                '⚽ GOAL!',
                `${goal.scorer} scored for ${goal.team || matchName}`,
                `goal-${match.id}-${goalKey}`
              )
            }
          })

          const oldStatus = previous.status.trim().toUpperCase()
          const newStatus = match.status.trim().toUpperCase()

          const wasLive = ['LIVE', 'IN PLAY', 'IN PROGRESS'].includes(oldStatus)
          const nowLive = ['LIVE', 'IN PLAY', 'IN PROGRESS'].includes(newStatus)

          const wasHalfTime = ['HALF TIME', 'HALFTIME', 'HT'].includes(oldStatus)
          const nowHalfTime = ['HALF TIME', 'HALFTIME', 'HT'].includes(newStatus)

          const wasFinished = ['FINISHED', 'FULL TIME', 'FULLTIME', 'FT', 'COMPLETED'].includes(oldStatus)
          const nowFinished = ['FINISHED', 'FULL TIME', 'FULLTIME', 'FT', 'COMPLETED'].includes(newStatus)

          if (!wasLive && nowLive) {
            notify('🟢 KICK-OFF', matchName, `kickoff-${match.id}`)
          }

          if (!wasHalfTime && nowHalfTime) {
            notify('⏸️ HALF-TIME', matchName, `halftime-${match.id}`)
          }

          if (!wasFinished && nowFinished) {
            notify(
              '🏁 FULL-TIME',
              `${matchName}: ${match.homeScore} - ${match.awayScore}`,
              `fulltime-${match.id}`
            )
          }
        })
      }

      previousMatchesRef.current = data

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
                  ? goal.minute > 90
                  ? `90+${goal.minute - 90}'`
                  : `${goal.minute}'`
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
                    ? card.minute > 90
                      ? `90+${card.minute - 90}'`
                      : `${card.minute}'`
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

<button
  type="button"
  onClick={async () => {
    try {
      if (
        !('Notification' in window) ||
        !('serviceWorker' in navigator) ||
        !('PushManager' in window)
      ) {
        alert('Your browser does not support background notifications.')
        return
      }

      if (!notificationsEnabled) {
        let permission = Notification.permission

        if (permission !== 'granted') {
          permission = await Notification.requestPermission()
        }

        if (permission !== 'granted') {
          alert('Please allow notifications in your browser.')
          return
        }

        const registration = await navigator.serviceWorker.ready

        const keyResponse = await fetch('/api/push/public-key')

        if (!keyResponse.ok) {
          throw new Error('Could not retrieve notification settings.')
        }

        const { publicKey } = await keyResponse.json()

        let subscription = await registration.pushManager.getSubscription()

        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey)
          })
        }

        const saveResponse = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(subscription)
        })

        if (!saveResponse.ok) {
          throw new Error('Could not save your notification subscription.')
        }

        localStorage.setItem('varsityscore-notifications-enabled', 'true')
        setNotificationsEnabled(true)

        alert('Background notifications enabled!')
      } else {
        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.getSubscription()

        if (subscription) {
          const removeResponse = await fetch('/api/push/unsubscribe', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              endpoint: subscription.endpoint
            })
          })

          if (!removeResponse.ok) {
            throw new Error('Could not remove your notification subscription.')
          }

          await subscription.unsubscribe()
        }

        localStorage.setItem('varsityscore-notifications-enabled', 'false')
        setNotificationsEnabled(false)

        alert('Notifications disabled.')
      }
    } catch (error) {
      console.error('Notification error:', error)
      alert(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }}
>
  {notificationsEnabled
    ? '🔕 Disable Notifications'
    : '🔔 Enable Notifications'}
</button>

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