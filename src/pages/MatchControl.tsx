import { useEffect, useRef, useState } from "react"

type Goal = {
id: string
team: string
scorer: string
assist: string
minute: number
type: "NORMAL" | "PENALTY" | "OWN_GOAL" | "DIRECT_FREE_KICK"
}

type MatchCard = {
id: string
team: string
player: string
minute: number
type: "YELLOW" | "RED"
}

type Match = {
id: string
homeTeam: string
awayTeam: string
homeScore: number
awayScore: number
status: string
minute: number
events: string[]
date: string
kickoffTime: string
goals?: Goal[]
cards?: MatchCard[]
}


function MatchControl() {
  const [homeTeam, setHomeTeam] = useState(
    () => localStorage.getItem("varsityscore-home-team") || ""
  )

  const skipNextSave = useRef(false)

  const [awayTeam, setAwayTeam] = useState(
    () => localStorage.getItem("varsityscore-away-team") || ""
  )

  const [homeScore, setHomeScore] = useState(
    () => Number(localStorage.getItem("varsityscore-home-score") || 0)
  )

  const [awayScore, setAwayScore] = useState(
    () => Number(localStorage.getItem("varsityscore-away-score") || 0)
  )

  const [matchStatus, setMatchStatus] = useState(
    () => localStorage.getItem("varsityscore-match-status") || "NOT STARTED"
  )

  const [matchMinute, setMatchMinute] = useState(
    () => localStorage.getItem("varsityscore-match-minute") || "0"
  )


  const [goals, setGoals] = useState<Goal[]>([])
const [cards, setCards] = useState<MatchCard[]>([])
  const [matches, setMatches] = useState<Match[]>([])
const [goalScorer, setGoalScorer] = useState("")
const [goalAssist, setGoalAssist] = useState("")
const [goalType, setGoalType] = useState<Goal["type"]>("NORMAL")

const [cardPlayer, setCardPlayer] = useState("")
const [cardTeam, setCardTeam] = useState<"home" | "away">("home")
const [cardType, setCardType] = useState<MatchCard["type"]>("YELLOW")

  const [selectedMatchId, setSelectedMatchId] = useState("")

  const selectedMatch = matches.find(
    (match) => match.id === selectedMatchId
  )

  const [events, setEvents] = useState<string[]>(() => {
    const savedEvents = localStorage.getItem("varsityscore-events")
    return savedEvents ? JSON.parse(savedEvents) : []
  })

  const [matchDate, setMatchDate] = useState('')
const [kickoffTime, setKickoffTime] = useState('')

  // Automatically count match minutes while the match is live.
  useEffect(() => {
    if (matchStatus !== "LIVE") {
      return
    }

    const interval = setInterval(() => {
      setMatchMinute((minute) => String(Number(minute) + 1))
    }, 60000)

    return () => clearInterval(interval)
  }, [matchStatus])

  // Save the current match information in the browser.
  useEffect(() => {
    localStorage.setItem("varsityscore-home-team", homeTeam)
    localStorage.setItem("varsityscore-away-team", awayTeam)
    localStorage.setItem("varsityscore-home-score", String(homeScore))
    localStorage.setItem("varsityscore-away-score", String(awayScore))
    localStorage.setItem("varsityscore-match-status", matchStatus)
    localStorage.setItem("varsityscore-match-minute", matchMinute)
  }, [
    selectedMatchId,
    homeTeam,
    awayTeam,
    homeScore,
    awayScore,
    matchStatus,
    matchMinute,
  ])

  // Load matches from the backend and refresh the list every five seconds.
  useEffect(() => {
    async function loadMatches() {
      try {
        const response = await fetch(
          "/api/matches"
        )

        if (!response.ok) {
          throw new Error("Failed to load matches")
        }

        const data: Match[] = await response.json()

        setMatches(data)

        setSelectedMatchId((currentId) => {
          if (currentId && data.some((match) => match.id === currentId)) {
            return currentId
          }

          return data[0]?.id ?? ""
        })
      } catch (error) {
        console.error("Unable to load matches:", error)
      }
    }

    loadMatches()

    const interval = setInterval(loadMatches, 5000)

    return () => clearInterval(interval)
  }, [])

  // Load the selected match into the controls.
  useEffect(() => {
    if (!selectedMatch) {
      return
    }

    skipNextSave.current = true

    setHomeTeam(selectedMatch.homeTeam)
setAwayTeam(selectedMatch.awayTeam)
setHomeScore(selectedMatch.homeScore)
setAwayScore(selectedMatch.awayScore)
setMatchStatus(selectedMatch.status)
setMatchMinute(String(selectedMatch.minute))
setMatchDate(selectedMatch.date || '')
setKickoffTime(selectedMatch.kickoffTime || '')
setGoals(selectedMatch.goals ?? [])
setCards(selectedMatch.cards ?? [])

    const savedEvents = localStorage.getItem(
      `varsityscore-events-${selectedMatch.id}`
    )

    setEvents(
      savedEvents ? JSON.parse(savedEvents) : selectedMatch.events
    )
  }, [selectedMatchId])

  // Send changes to the backend.
  useEffect(() => {
    if (!selectedMatchId) {
      return
    }

    if (skipNextSave.current) {
      skipNextSave.current = false
      return
    }

    fetch(`/api/matches/${selectedMatchId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        homeTeam,
        awayTeam,
        homeScore,
        awayScore,
        status: matchStatus,
        minute: Number(matchMinute),
        events,
        date: matchDate,
        kickoffTime: kickoffTime,
        goals,
        cards,
      }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to update the match")
        }

        return response.json()
      })
      .then((data) => {
        console.log("Match sent to backend:", data)
      })
      .catch((error) => {
        console.error("Backend connection failed:", error)
      })
        }, [
    selectedMatchId,
    homeTeam,
    awayTeam,
    homeScore,
    awayScore,
    matchStatus,
    matchMinute,
    events,
    matchDate,
    kickoffTime,
    goals,
    cards,
  ])

  // Save match events in browser storage.
  function saveEvents(updatedEvents: string[]) {
    setEvents(updatedEvents)

    if (selectedMatchId) {
      localStorage.setItem(
        `varsityscore-events-${selectedMatchId}`,
        JSON.stringify(updatedEvents)
      )
    }
  }

  // Record an event with its match minute and timestamp.
  function recordEvent(event: string) {
    const minute = matchMinute.trim() || "0"
    const recordedAt = new Date().toLocaleTimeString()

    const updatedEvents = [
      `${minute}' - ${event} (${recordedAt})`,
      ...events,
    ]

    saveEvents(updatedEvents)
  }

  // Start the match.
  
function startMatch() {
  if (!homeTeam.trim() || !awayTeam.trim()) {
    alert("Please enter both team names before starting the match.")
    return
  }

  if (matchStatus !== "NOT STARTED") {
    alert("Only a match that has not started can be started.")
    return
  }

  setMatchStatus("LIVE")
  recordEvent("Kick-off")
}


  // Create a new match.
  async function createNewMatch() {
    if (!homeTeam.trim() || !awayTeam.trim()) {
      alert("Please enter both team names.")
      return
    }

    try {
      const response = await fetch(
        "/api/matches",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            homeTeam: homeTeam.trim(),
            awayTeam: awayTeam.trim(),
date: matchDate,
kickoffTime: kickoffTime,

          }),
        }
      )

      if (!response.ok) {
        throw new Error("Could not create the match.")
      }

      const data = await response.json()

      setMatches(data.matches)
setSelectedMatchId(data.match.id)

setHomeTeam(data.match.homeTeam)
setAwayTeam(data.match.awayTeam)
setHomeScore(0)
setAwayScore(0)
setMatchStatus("NOT STARTED")
setMatchMinute("0")
setEvents([])

localStorage.setItem(
  `varsityscore-events-${data.match.id}`,
  JSON.stringify([])
)

alert("New match created successfully!")
    } catch (error) {
      console.error(error)
      alert(
        "Unable to create the match. Check that the backend is running."
      )
    }
  }

  // Delete the selected match.
  async function deleteSelectedMatch() {
    if (!selectedMatchId) {
      alert("Please select a match.")
      return
    }

    if (
      !window.confirm(
        "Are you sure you want to delete this match?"
      )
    ) {
      return
    }

    try {
      const response = await fetch(
        `/api/matches/${selectedMatchId}`,
        {
          method: "DELETE",
        }
      )

      if (!response.ok) {
        throw new Error("Failed to delete match.")
      }

      const data = await response.json()

      setMatches(data.matches)

if (data.matches.length > 0) {
  setSelectedMatchId(data.matches[0].id)
} else {
  setSelectedMatchId("")
  setHomeTeam("")
  setAwayTeam("")
  setHomeScore(0)
  setAwayScore(0)
  setMatchStatus("NOT STARTED")
  setMatchMinute("0")
  setMatchDate('')
  setKickoffTime('')
  setEvents([])
}

      alert("Match deleted successfully.")
    } catch (error) {
      console.error(error)
      alert(
        "Could not delete the match. Check the backend."
      )
    }
  }

  // Reset the current match.
  

function resetMatch() {
  if (!selectedMatchId) {
    alert("Please select a match.")
    return
  }

  const confirmed = window.confirm(
    "Reset this match? The score, minute, status, and event history will be cleared."
  )

  if (!confirmed) {
    return
  }

  setHomeScore(0)
  setAwayScore(0)
  setMatchStatus("NOT STARTED")
  setMatchMinute("0")
  saveEvents([])
}

  // Record a goal for either team.
  
function recordGoal(team: "home" | "away") {
  if (matchStatus !== "LIVE") {
    alert("Goals can only be recorded while the match is live.")
    return
  }

  if (!goalScorer.trim()) {
    alert("Enter the name of the player who scored.")
    return
  }

  const scoringTeam = team === "home" ? homeTeam : awayTeam

  const newGoal: Goal = {
    id: `goal-${Date.now()}`,
    team: scoringTeam,
    scorer: goalScorer.trim(),
    assist: goalAssist.trim(),
    minute: Number(matchMinute),
    type: goalType,
  }

  setGoals((currentGoals) => [...currentGoals, newGoal])

  if (team === "home") {
    setHomeScore((score) => score + 1)
  } else {
    setAwayScore((score) => score + 1)
  }

  recordEvent(
    `Goal for ${scoringTeam}: ${goalScorer.trim()} (${matchMinute}')`
  )

  setGoalScorer("")
  setGoalAssist("")
  setGoalType("NORMAL")
}

function recordCard() {
  if (matchStatus !== "LIVE") {
    alert("Cards can only be recorded while the match is live.")
    return
  }

  if (!cardPlayer.trim()) {
    alert("Enter the name of the player receiving the card.")
    return
  }

  const receivingTeam = cardTeam === "home" ? homeTeam : awayTeam

  const newCard: MatchCard = {
    id: `card-${Date.now()}`,
    team: receivingTeam,
    player: cardPlayer.trim(),
    minute: Number(matchMinute),
    type: cardType,
  }

  setCards((currentCards) => [...currentCards, newCard])

  recordEvent(
    `${cardType === "YELLOW" ? "Yellow" : "Red"} card: ${cardPlayer.trim()} (${receivingTeam}, ${matchMinute}')`
  )

  setCardPlayer("")
  setCardType("YELLOW")
}


  return (
    <main className="page-container">

      <div>
        <label htmlFor="match-selector">
          Select Match:
        </label>

        <select
          id="match-selector"
          value={selectedMatchId}
          onChange={(event) =>
            setSelectedMatchId(event.target.value)
          }
        >
          {matches.map((match) => (
            <option key={match.id} value={match.id}>
              {match.homeTeam} vs {match.awayTeam}
            </option>
          ))}
        </select>
      </div>

      <header className="page-header">
        <p className="page-label">VARSITYSCORE UGANDA</p>
        <h1>Match Control</h1>
        <p>
          Record verified match events and update the scoreboard.
        </p>
      </header>

      <section className="page-content">
        <p className="About">
          Match Control. Match information is saved in this
          browser and sent to the local backend.
        </p>

        <label>
          Home team
          <input
            className="news-search"
            value={homeTeam}
            onChange={(event) => setHomeTeam(event.target.value)}
            placeholder="Enter home university"
          />
        </label>

        <label>
          Away team
          <input
            className="news-search"
            value={awayTeam}
            onChange={(event) => setAwayTeam(event.target.value)}
            placeholder="Enter away university"
          />
        </label>

        <label>
  Match Date
  <input
    type="date"
    value={matchDate}
    onChange={(event) => setMatchDate(event.target.value)}
  />
</label>

<label>
  Kickoff Time
  <input
    type="time"
    value={kickoffTime}
    onChange={(event) => setKickoffTime(event.target.value)}
  />
</label>

        <div className="fixture-card">
          <h2>
            {homeTeam || "Home Team"} {homeScore} - {awayScore}{" "}
            {awayTeam || "Away Team"}
          </h2>

          <p>Match status: {matchStatus}</p>
          <p>Match minute: {matchMinute}'</p>
        </div>

        <label>
          Match minute
          <input
            className="news-search"
            type="number"
            min="0"
            max="130"
            value={matchMinute}
            onChange={(event) => {
  const value = event.target.value

  if (
    value === "" ||
    (/^\d+$/.test(value) && Number(value) <= 130)
  ) {
    setMatchMinute(value)
  }
}}
          />
        </label>

        <div className="news-filters">
          <button
            onClick={startMatch}
            disabled={
              !homeTeam.trim() ||
              !awayTeam.trim() ||
              matchStatus !== "NOT STARTED"
            }
          >
            Start Match
          </button>

          <button
          onClick={() => {
  setMatchStatus("HALF TIME")
  recordEvent("Half-Time")
}}
            disabled={matchStatus !== "LIVE"}
          >
            Half-Time
          </button>
<button
  onClick={() => {
    setMatchStatus("LIVE")
    recordEvent("Second-half kick-off")
  }}
  disabled={matchStatus !== "HALF TIME"}
>
  Second Half
</button>


          <button
          onClick={() => {
  setMatchStatus("FINISHED")
  recordEvent("Full-Time")
}}
            disabled={
              matchStatus === "NOT STARTED" ||
              matchStatus === "FINISHED"
            }
          >
            Full-Time
          </button>

          <button onClick={resetMatch}>
            Reset Match
          </button>

          <button onClick={createNewMatch}>
            Create New Match
          </button>

          <button
            onClick={deleteSelectedMatch}
            disabled={!selectedMatchId}
          >
            Delete Match
          </button>
        </div>

<h3>Record a Goal</h3>

<label>
  Scorer
  <input
    className="news-search"
    value={goalScorer}
    onChange={(event) => setGoalScorer(event.target.value)}
    placeholder="Enter scorer's name"
  />
</label>

<label>
  Assist Maker (optional)
  <input
    className="news-search"
    value={goalAssist}
    onChange={(event) => setGoalAssist(event.target.value)}
    placeholder="Enter assist maker's name"
  />
</label>

<label>
  Goal Type
  <select
    value={goalType}
    onChange={(event) =>
      setGoalType(event.target.value as Goal["type"])
    }
  >
    <option value="NORMAL">Normal Goal</option>
    <option value="PENALTY">Penalty</option>
    <option value="OWN_GOAL">Own Goal</option>
    <option value="DIRECT_FREE_KICK">Direct Free Kick</option>
  </select>
</label>

<div className="news-filters">
  <button
    onClick={() => recordGoal("home")}
    disabled={matchStatus !== "LIVE" || !homeTeam.trim()}
  >
    Goal: {homeTeam || "Home Team"}
  </button>

  <button
    onClick={() => recordGoal("away")}
    disabled={matchStatus !== "LIVE" || !awayTeam.trim()}
  >
    Goal: {awayTeam || "Away Team"}
  </button>
</div>

<hr />

<h3>Record a Card</h3>

<label>
  Player Receiving Card
  <input
    className="news-search"
    value={cardPlayer}
    onChange={(event) => setCardPlayer(event.target.value)}
    placeholder="Enter player's name"
  />
</label>

<label>
  Team
  <select
    value={cardTeam}
    onChange={(event) =>
      setCardTeam(event.target.value as "home" | "away")
    }
  >
    <option value="home">{homeTeam || "Home Team"}</option>
    <option value="away">{awayTeam || "Away Team"}</option>
  </select>
</label>

<label>
  Card Type
  <select
    value={cardType}
    onChange={(event) =>
      setCardType(event.target.value as MatchCard["type"])
    }
  >
    <option value="YELLOW">Yellow Card</option>
    <option value="RED">Red Card</option>
  </select>
</label>

<button
  onClick={recordCard}
  disabled={matchStatus !== "LIVE"}
>
  Record Card
</button>

        <h3>Match Events</h3>

        {events.length > 0 ? (
          <ul>
            {events.map((event, index) => (
              <li key={`${event}-${index}`}>
                {event}
              </li>
            ))}
          </ul>
        ) : (
          <p>No match events recorded yet.</p>
        )}

                <hr />

        <h3>Goals and Assists</h3>

        {goals.length > 0 ? (
          <ul>
            {goals.map((goal) => (
              <li key={goal.id}>
                <strong>{goal.minute}' — {goal.scorer}</strong>
                {" "}({goal.team})

                {goal.assist.trim()
                  ? ` — Assist: ${goal.assist}`
                  : " — No assist recorded"}

                {goal.type !== "NORMAL" &&
                  ` — ${goal.type.replaceAll("_", " ")}`}
              </li>
            ))}
          </ul>
        ) : (
          <p>No goals recorded yet.</p>
        )}

        <hr />

        <h3>Yellow and Red Cards</h3>

        {cards.length > 0 ? (
          <ul>
            {cards.map((card) => (
              <li key={card.id}>
                <strong>
                  {card.minute}' — {card.player}
                </strong>
                {" "}({card.team}) — {card.type} CARD
              </li>
            ))}
          </ul>
        ) : (
          <p>No cards recorded yet.</p>
        )}
      </section>
    </main>
  )
}

export default MatchControl