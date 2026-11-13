import express from "express"
import cors from "cors"
import Parser from "rss-parser"
import fs from "node:fs"
import { randomBytes, timingSafeEqual } from "node:crypto"
import { createWorker } from "tesseract.js"
import sharp from "sharp"
import { supabase } from "./database.js"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const webpush = require("web-push")

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Load private administrator settings.
const ENV_FILE = new URL("../.env", import.meta.url)

if (fs.existsSync(ENV_FILE)) {
  const envLines = fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)

  for (const line of envLines) {
    const trimmed = line.trim()

    if (!trimmed || trimmed.startsWith("#")) continue

    const separator = trimmed.indexOf("=")
    if (separator === -1) continue

    const key = trimmed.slice(0, separator).trim()
    const value = trimmed.slice(separator + 1).trim()

    if (key && process.env[key] === undefined) {
      process.env[key] = value.replace(/^["']|["']$/g, "")
    }
  }
}

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const VAPID_SUBJECT = process.env.VAPID_SUBJECT

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
  console.warn("Web Push configuration is incomplete.")
} else {
  webpush.setVapidDetails(
    VAPID_SUBJECT,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  )
}

const ADMIN_PASSWORD =
  process.env.VARSITYSCORE_ADMIN_PASSWORD || ""

const app = express()
const parser = new Parser({
  headers: {
    "User-Agent": "Mozilla/5.0",
    "Accept": "application/atom+xml, application/xml, text/xml, */*"
  },
  customFields: {
    item: [
      ["media:content", "mediaContent"],
      ["media:thumbnail", "mediaThumbnail"]
    ]
  }
})


const PORT = process.env.PORT || 3001
const UFL_FIXTURE_CHECK_INTERVAL = 5 * 60 * 1000
const FIXTURES_FILE = new URL("./fixtures.json", import.meta.url)

const UFL_TEAM_FIXTURES_FILE = new URL(
  "./ufl-team-fixtures-2026-27.json",
  import.meta.url
)

const PROCESSED_UFL_POSTS_FILE = new URL(
  "./processed-ufl-posts.json",
  import.meta.url


)

function normalizeTeamName(name = "") {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}

// Load the shared university aliases used by the backend.
const TEAM_ALIASES_FILE = new URL(
  "../shared/teamAliases.json",
  import.meta.url
)

const sharedTeamAliases = JSON.parse(
  fs.readFileSync(TEAM_ALIASES_FILE, "utf8")
)


// Build one searchable alias list for each university.
function getTeamAliases(teamName = "") {
  const normalizedName = normalizeTeamName(teamName)

  for (const [canonicalName, aliases] of Object.entries(sharedTeamAliases)) {
    const allNames = [canonicalName, ...aliases]

    if (
      allNames.some(
        (name) => normalizeTeamName(name) === normalizedName
      )
    ) {
      return allNames
    }
  }

  return [teamName]
}


// Resolve university names and unfamiliar official-feed handles.
function resolveTeamIdentity(teamName = "") {
  const normalized = normalizeTeamName(
    String(teamName).replace(/^@/, "")
  )

  if (!normalized) return null

  const teams = Object.entries(sharedTeamAliases)

  // 1. Exact canonical name or alias recognition.
  for (const [canonicalKey, aliases] of teams) {
    const allNames = [canonicalKey, ...aliases]

    if (
      allNames.some(
        (name) => normalizeTeamName(name) === normalized
      )
    ) {
      return {
        key: canonicalKey,
        name: aliases[0] || canonicalKey,
        method: "EXACT",
      }
    }
  }

  // 2. Recognise familiar additions to known short handles.
  const recognisedSuffixes = [
    "uganda",
    "university",
    "univ",
    "uni",
    "varsity",
    "official",
  ]

  const suffixMatches = []

  for (const [canonicalKey, aliases] of teams) {
    for (const alias of [canonicalKey, ...aliases]) {
      const knownName = normalizeTeamName(alias)

      if (
        knownName.length >= 4 &&
        normalized.startsWith(knownName)
      ) {
        const suffix = normalized.slice(knownName.length)

        if (recognisedSuffixes.includes(suffix)) {
          suffixMatches.push({
            key: canonicalKey,
            name: aliases[0] || canonicalKey,
          })
        }
      }
    }
  }

  const uniqueSuffixMatches = [
    ...new Map(suffixMatches.map((item) => [item.key, item])).values(),
  ]

  if (uniqueSuffixMatches.length === 1) {
    return {
      ...uniqueSuffixMatches[0],
      method: "KNOWN_SUFFIX",
    }
  }

  // 3. Compare unfamiliar names against registered aliases.
  function editDistance(first, second) {
    const previous = Array.from(
      { length: second.length + 1 },
      (_, index) => index
    )

    for (let i = 1; i <= first.length; i++) {
      const current = [i]

      for (let j = 1; j <= second.length; j++) {
        const cost = first[i - 1] === second[j - 1] ? 0 : 1

        current[j] = Math.min(
          current[j - 1] + 1,
          previous[j] + 1,
          previous[j - 1] + cost
        )
      }

      for (let j = 0; j <= second.length; j++) {
        previous[j] = current[j]
      }
    }

    return previous[second.length]
  }

  // Avoid guessing identities from very short abbreviations.
  if (normalized.length < 9) return null

  const scores = new Map()

  for (const [canonicalKey, aliases] of teams) {
    for (const alias of [canonicalKey, ...aliases]) {
      const candidate = normalizeTeamName(alias)

      if (candidate.length < 9) continue

      const distance = editDistance(normalized, candidate)

      const similarity =
        1 - distance / Math.max(normalized.length, candidate.length)

      const previous = scores.get(canonicalKey) || {
        key: canonicalKey,
        name: aliases[0] || canonicalKey,
        score: 0,
      }

      if (similarity > previous.score) {
        scores.set(canonicalKey, {
          key: canonicalKey,
          name: aliases[0] || canonicalKey,
          score: similarity,
        })
      }
    }
  }

  const ranked = [...scores.values()].sort(
    (a, b) => b.score - a.score
  )

  const best = ranked[0]
  const secondBest = ranked[1]

  // Accept only a very strong, clearly unique match.
  if (
    best &&
    best.score >= 0.90 &&
    (!secondBest || best.score - secondBest.score >= 0.06)
  ) {
    return {
      key: best.key,
      name: best.name,
      method: "FUZZY",
    }
  }

  return null
}

// Compare two names using their resolved university identities.
function sameUniversity(firstTeam, secondTeam) {
  const first = resolveTeamIdentity(firstTeam)
  const second = resolveTeamIdentity(secondTeam)

  if (first && second) {
    return first.key === second.key
  }

  return (
    normalizeTeamName(firstTeam) ===
    normalizeTeamName(secondTeam)
  )
}


// Load official fixtures from Supabase when the server starts.
let fixturesCache = []

const { data: fixtureRows, error: fixtureLoadError } = await supabase
  .from("fixtures")
  .select("record")

if (fixtureLoadError) {
  throw new Error(
    `Unable to load fixtures from Supabase: ${fixtureLoadError.message}`
  )
}

fixturesCache = fixtureRows.map((row) => row.record)

console.log(`Loaded ${fixturesCache.length} fixtures from Supabase.`)

function readFixtures() {
  return structuredClone(fixturesCache)
}

let fixturesSaveQueue = Promise.resolve()

function saveFixtures(fixtures) {
  const snapshot = structuredClone(fixtures)

  fixturesCache = snapshot

  fixturesSaveQueue = fixturesSaveQueue.then(async () => {
    const rows = snapshot.map((fixture) => ({
      id: String(fixture.id),
      home_team: fixture.homeTeam || "",
      away_team: fixture.awayTeam || "",
      fixture_date: fixture.date || null,
      status: fixture.status || "",
      record: fixture,
    }))

    if (rows.length > 0) {
      const { error } = await supabase
        .from("fixtures")
        .upsert(rows, { onConflict: "id" })

      if (error) throw error
    }

    console.log(`Saved ${rows.length} fixtures to Supabase.`)
  }).catch((error) => {
    console.error("Supabase fixtures save failed:", error)
  })

  return fixturesSaveQueue
}

// Load previously processed UFL posts from Supabase.
let processedUFLPostsCache = []

const { data: processedPostRows, error: processedPostsLoadError } =
  await supabase
    .from("processed_ufl_posts")
    .select("post_id")

if (processedPostsLoadError) {
  throw new Error(
    `Unable to load processed UFL posts: ${processedPostsLoadError.message}`
  )
}

processedUFLPostsCache = processedPostRows.map((row) => row.post_id)

console.log(
  `Loaded ${processedUFLPostsCache.length} processed UFL posts from Supabase.`
)

function readProcessedUFLPosts() {
  return [...processedUFLPostsCache]
}

let processedPostsSaveQueue = Promise.resolve()

function saveProcessedUFLPosts(postIds) {
  const snapshot = [...new Set(postIds)]

  processedUFLPostsCache = snapshot

  processedPostsSaveQueue = processedPostsSaveQueue.then(async () => {
    const rows = snapshot.map((postId) => ({
      post_id: String(postId),
    }))

    if (rows.length > 0) {
      const { error } = await supabase
        .from("processed_ufl_posts")
        .upsert(rows, { onConflict: "post_id" })

      if (error) throw error
    }

    console.log(`Saved ${rows.length} processed UFL posts to Supabase.`)
  }).catch((error) => {
    console.error("Supabase processed posts save failed:", error)
  })

  return processedPostsSaveQueue
}


// Store official results that cannot yet be matched safely.
const UNMATCHED_UFL_RESULTS_FILE = new URL(
  "./unmatched-ufl-results.json",
  import.meta.url
)

// Load unmatched official results from Supabase.
let unmatchedUFLResultsCache = []

const { data: unmatchedRows, error: unmatchedLoadError } =
  await supabase
    .from("unmatched_ufl_results")
    .select("record")

if (unmatchedLoadError) {
  throw new Error(
    `Unable to load unmatched UFL results: ${unmatchedLoadError.message}`
  )
}

unmatchedUFLResultsCache = unmatchedRows.map((row) => row.record)

console.log(
  `Loaded ${unmatchedUFLResultsCache.length} unmatched UFL results from Supabase.`
)

function readUnmatchedUFLResults() {
  return structuredClone(unmatchedUFLResultsCache)
}

let unmatchedResultsSaveQueue = Promise.resolve()

function saveUnmatchedUFLResults(results) {
  const snapshot = structuredClone(results)

  unmatchedUFLResultsCache = snapshot

  unmatchedResultsSaveQueue = unmatchedResultsSaveQueue.then(async () => {
    const rows = snapshot.map((result) => ({
      source_post: String(result.sourcePost),
      published_at: result.publishedAt || null,
      match_date: result.matchDate || null,
      record: result,
    }))

    if (rows.length > 0) {
      const { error } = await supabase
        .from("unmatched_ufl_results")
        .upsert(rows, { onConflict: "source_post" })

      if (error) throw error
    }

    console.log(`Saved ${rows.length} unmatched UFL results to Supabase.`)
  }).catch((error) => {
    console.error("Supabase unmatched results save failed:", error)
  })

  return unmatchedResultsSaveQueue
}

async function findNewUFLMatchDayPost() {
  const feed = await fetchUFLFeed()

  const processedPosts = readProcessedUFLPosts()

  console.log("UFL MATCH DAY DETECTION CHECK:")

  feed.items.forEach((item) => {
    const title = item.title || ""
    const content = item.contentSnippet || item.content || ""
    const link = item.link || ""
    const statusId = link.match(/status\/(\d+)/)?.[1]

    if (/MATCH|MOUNTAINS|LAWRENCE/i.test(title + " " + content)) {
      console.log({
        statusId,
        title,
        content: content.slice(0, 200),
        alreadyProcessed: processedPosts.includes(statusId)
      })
    }
  })

  const newPost = feed.items.find((item) => {
    const title = item.title || ""
    const content = item.contentSnippet || item.content || ""
    const link = item.link || ""
    const statusId = link.match(/status\/(\d+)/)?.[1]

    return (
      /MATCH DAY/i.test(title + " " + content) &&
      statusId &&
      !processedPosts.includes(statusId)
    )
  })

  if (!newPost) {
    return null
  }

  const statusId = newPost.link.match(/status\/(\d+)/)?.[1]

  return {
    statusId,
    title: newPost.title || "",
    link: newPost.link || "",
    publishedAt: newPost.isoDate || newPost.pubDate || ""
  }
}

async function readUFLMatchDayPoster(statusId) {
const tweetResponse = await fetch(
`https://api.fxtwitter.com/uflug/status/${statusId}`
)

if (!tweetResponse.ok) {
throw new Error("Unable to retrieve UFL poster information.")
}

const tweetData = await tweetResponse.json()

const imageUrl =
tweetData.tweet?.media?.photos?.[0]?.url ||
tweetData.tweet?.media?.all?.find(
(media) => media.type === "photo"
)?.url

if (!imageUrl) {
throw new Error("No poster image found.")
}

const imageResponse = await fetch(imageUrl)

if (!imageResponse.ok) {
throw new Error("Unable to download UFL poster.")
}

const imageBuffer = Buffer.from(
await imageResponse.arrayBuffer()
)

const worker = await createWorker("eng")

try {
const recognitionModes = ["6", "11", "12"]
const recognitionResults = []

for (const mode of recognitionModes) {
  await worker.setParameters({
    tessedit_pageseg_mode: mode,
    preserve_interword_spaces: "1"
  })

  const result = await worker.recognize(imageBuffer)

  recognitionResults.push({
    mode,
    text: result.data.text,
    confidence: result.data.confidence
  })
}

const bestResult = recognitionResults.reduce(
  (best, current) =>
    current.confidence > best.confidence
      ? current
      : best
)

// Read the two university names separately.
const metadata = await sharp(imageBuffer).metadata()

const imageWidth = metadata.width
const imageHeight = metadata.height

// Left university name.
const leftCrop = await sharp(imageBuffer)
  .extract({
    left: Math.round(imageWidth * 0.14),
    top: Math.round(imageHeight * 0.65),
    width: Math.round(imageWidth * 0.34),
    height: Math.round(imageHeight * 0.18)
  })
  .resize({ width: 800 })
  .grayscale()
  .normalize()
  .sharpen()
  .png()
  .toBuffer()

// Right university name.
const rightCrop = await sharp(imageBuffer)
  .extract({
    left: Math.round(imageWidth * 0.55),
    top: Math.round(imageHeight * 0.65),
    width: Math.round(imageWidth * 0.36),
    height: Math.round(imageHeight * 0.18)
  })
  .resize({ width: 800 })
  .grayscale()
  .normalize()
  .sharpen()
  .png()
  .toBuffer()

await worker.setParameters({
  tessedit_pageseg_mode: "6",
  preserve_interword_spaces: "1"
})

const leftTeamResult = await worker.recognize(leftCrop)
const rightTeamResult = await worker.recognize(rightCrop)

const leftTeamOCR = leftTeamResult.data.text.trim()
const rightTeamOCR = rightTeamResult.data.text.trim()

return {
  imageUrl,
  extractedText: bestResult.text,
  confidence: bestResult.confidence,
  leftTeamOCR,
  rightTeamOCR,
  allOCRResults: recognitionResults
}

} finally {
await worker.terminate()
}
}


function extractUFLFixtureDetails(
  extractedText,
  publishedAt,
  leftTeamOCR = "",
  rightTeamOCR = ""
) {
  // Remove short OCR noise such as stray symbols and letters.
  function cleanOCR(value) {
    return String(value || "")
      .split(/\r?\n/)
      .map(line =>
        line
          .toLowerCase()
          .replace(/[^a-z\s]/g, " ")
          .replace(/\s+/g, " ")
          .trim()
      )
      .filter(line => line.length > 2)
      .join(" ")
      .trim()
  }

  // Recognise a university using the existing shared aliases.
  function recogniseOCRTeam(value) {
    const cleaned = cleanOCR(value)

    if (!cleaned) return null

    return resolveTeamIdentity(cleaned)
  }

  // Read the left and right university names independently.
  let home = recogniseOCRTeam(leftTeamOCR)
  let away = recogniseOCRTeam(rightTeamOCR)

  // Fall back to the complete poster OCR if necessary.
  if (!home || !away) {
    const fullText = cleanOCR(extractedText)

    const detectedTeams = []

    for (const [teamKey, aliases] of Object.entries(sharedTeamAliases)) {
      const allNames = [teamKey, ...aliases]

      const matched = allNames.some(alias => {
        const name = cleanOCR(alias)

        if (!name) return false

        return new RegExp(
          `\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
          "i"
        ).test(fullText)
      })

      if (matched) {
        detectedTeams.push({
          key: teamKey,
          name: aliases[0] || teamKey
        })
      }
    }

    if (!home && detectedTeams.length === 2) {
      home = detectedTeams[0]
    }

    if (!away && detectedTeams.length === 2) {
      away = detectedTeams[1]
    }
  }

  if (!home || !away || home.key === away.key) {
    return {
      valid: false,
      reason: "Exactly two different recognised university teams could not be identified.",
      detectedTeams: [
        home?.key || null,
        away?.key || null
      ]
    }
  }

  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kampala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(publishedAt))

  return {
    valid: true,
    homeTeam: home.key,
    awayTeam: away.key,
    date,
    kickoffTime: "15:00",
    competition: "Pepsi University Football League",
    status: "SCHEDULED",
    source: "OFFICIAL UFL"
  }
}



let lastDetectedUFLPostId = null

async function checkUFLFixturesAutomatically() {
  try {
    const newPost = await findNewUFLMatchDayPost()

    if (!newPost) {
      console.log("UFL fixture check: No new announcement.")
      return
    }

    if (newPost.statusId === lastDetectedUFLPostId) {
      return
    }

    console.log("NEW OFFICIAL UFL MATCH DAY POST DETECTED!")
    console.log(newPost)

    const poster = await readUFLMatchDayPoster(newPost.statusId)

    console.log("UFL MATCH DAY POSTER SUCCESSFULLY READ!")
    console.log(poster.extractedText)

    const fixture = extractUFLFixtureDetails(
  poster.extractedText,
  newPost.publishedAt,
  poster.leftTeamOCR,
  poster.rightTeamOCR
)

    if (!fixture.valid) {
      console.log("Fixture not saved:", fixture.reason)
      return
    }

    const fixtures = readFixtures()

    const alreadyExists = fixtures.some((item) => {
  // First check the original announcement identity.
  if (
    item.officialSource === newPost.link ||
    item.id === `ufl-fixture-${newPost.statusId}`
  ) {
    return true
  }

  // Also check whether the same universities already have
  // a fixture scheduled for the same date.
  const aliasesMatch = (firstTeam, secondTeam) => {
    const firstAliases = getTeamAliases(firstTeam)
      .map(normalizeTeamName)

    const secondAliases = getTeamAliases(secondTeam)
      .map(normalizeTeamName)

    return secondAliases.some((alias) =>
      firstAliases.includes(alias)
    )
  }

  const sameHome = aliasesMatch(
    item.homeTeam,
    fixture.homeTeam
  )

  const sameAway = aliasesMatch(
    item.awayTeam,
    fixture.awayTeam
  )

  const existingDate = String(item.date || "").slice(0, 10)
  const incomingDate = String(fixture.date || "").slice(0, 10)

  const sameDate =
    existingDate !== "" &&
    incomingDate !== "" &&
    existingDate === incomingDate

  return sameHome && sameAway && sameDate
})

    if (!alreadyExists) {
      const savedFixture = {
        id: `ufl-fixture-${newPost.statusId}`,
        ...fixture,
        officialSource: newPost.link,
        sourceType: "OFFICIAL_UFL",
        imageUrl: poster.imageUrl,
        announcedAt: newPost.publishedAt
      }

      fixtures.push(savedFixture)
      saveFixtures(fixtures)

      console.log("NEW UFL FIXTURE SAVED:", savedFixture)
    } else {
      console.log("This fixture is already saved.")
    }

   const processedPosts = readProcessedUFLPosts()

if (!processedPosts.includes(newPost.statusId)) {
  processedPosts.push(newPost.statusId)
  saveProcessedUFLPosts(processedPosts)

  console.log(
    "UFL MATCH DAY POST MARKED AS PROCESSED:",
    newPost.statusId
  )
}

lastDetectedUFLPostId = newPost.statusId
  } catch (error) {
    console.error(
      "Automatic UFL fixture check failed:",
      error.message
    )
  }
}

const UFL_FEED_URL = "https://fxtwitter.com/uflug/feed.atom.xml"

async function fetchUFLFeed() {
  const feedUrls = [
    {
      url: UFL_FEED_URL,
      attempts: 3
    },
    {
      url: "https://fixupx.com/uflug/feed.atom.xml",
      attempts: 1
    }
  ]

  let lastError

  for (const source of feedUrls) {
    for (let attempt = 1; attempt <= source.attempts; attempt++) {
      try {
        console.log(
          `Trying UFL feed: ${source.url} (attempt ${attempt}/${source.attempts})`
        )

        const response = await fetch(source.url, {
          headers: {
            "User-Agent": "Mozilla/5.0",
            "Accept": "application/atom+xml, application/xml, text/xml, */*"
          }
        })

        if (!response.ok) {
          throw new Error(`Feed returned status ${response.status}`)
        }

        const xml = await response.text()
        const feed = await parser.parseString(xml)

        if (!feed.items || !Array.isArray(feed.items)) {
          throw new Error("Invalid UFL feed response")
        }

        console.log("UFL feed connected successfully:", source.url)

        return feed

      } catch (error) {
        console.log(
          `UFL feed attempt ${attempt} failed:`,
          error.message
        )

        lastError = error

        if (attempt < source.attempts) {
          await new Promise(resolve => setTimeout(resolve, 2000))
        }
      }
    }
  }

  throw lastError
}


app.use(cors({
  origin: "http://localhost:5173",
  credentials: true,
}))

app.use(express.json())

// ========================================
// WEB PUSH NOTIFICATION ENDPOINTS
// ========================================

app.get("/api/push/public-key", (req, res) => {
  if (!VAPID_PUBLIC_KEY) {
    return res.status(503).json({
      message: "Push notifications are not configured."
    })
  }

  res.json({ publicKey: VAPID_PUBLIC_KEY })
})

app.post("/api/push/subscribe", async (req, res) => {
  try {
    const subscription = req.body

    if (
      !subscription?.endpoint ||
      !subscription?.keys?.p256dh ||
      !subscription?.keys?.auth ||
      !subscription.endpoint.startsWith("https://")
    ) {
      return res.status(400).json({
        message: "Invalid push subscription."
      })
    }

    const { error } = await supabase
      .from("push_subscriptions")
      .upsert(
        {
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth
        },
        { onConflict: "endpoint" }
      )

    if (error) throw error

    res.json({ success: true })
  } catch (error) {
    console.error("Push subscription error:", error)

    res.status(500).json({
      message: "Could not save push subscription."
    })
  }
})

app.post("/api/push/unsubscribe", async (req, res) => {
  try {
    const endpoint = req.body?.endpoint

    if (!endpoint || !endpoint.startsWith("https://")) {
      return res.status(400).json({
        message: "Invalid subscription endpoint."
      })
    }

    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", endpoint)

    if (error) throw error

    res.json({ success: true })
  } catch (error) {
    console.error("Push unsubscribe error:", error)

    res.status(500).json({
      message: "Could not remove push subscription."
    })
  }
})

// ========================================
// SEND BACKGROUND PUSH NOTIFICATIONS
// ========================================

async function sendPushNotificationOnce({
  eventKey,
  sourcePost,
  title,
  body,
}) {
  try {
    // Record this event first to prevent duplicate notifications.
    const { error: recordError } = await supabase
      .from("push_notification_events")
      .insert({
        event_key: eventKey,
        source_post: sourcePost,
      })

    // This official post has already triggered a notification.
    if (recordError?.code === "23505") {
      return
    }

    if (recordError) {
      throw recordError
    }

    // Retrieve all subscribed devices.
    const { data: subscriptions, error } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")

    if (error) throw error

    if (!subscriptions?.length) {
      console.log("No devices subscribed to push notifications.")
      return
    }

    const payload = JSON.stringify({
      title,
      body,
      url: "/",
      tag: eventKey,
    })

    // Send the notification to every subscribed device.
    await Promise.allSettled(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth,
              },
            },
            payload
          )
        } catch (pushError) {
          console.error(
            "Push notification delivery failed:",
            pushError.statusCode || pushError.message
          )

          // Remove subscriptions that are no longer valid.
          if (
            pushError.statusCode === 404 ||
            pushError.statusCode === 410
          ) {
            await supabase
              .from("push_subscriptions")
              .delete()
              .eq("endpoint", subscription.endpoint)
          }
        }
      })
    )

    console.log(`Background notification sent: ${title}`)
  } catch (error) {
    console.error("Background push notification error:", error)
  }
}

// ========================================
// VARSITYSCORE PRIVATE ADMIN AUTHENTICATION
// ========================================

const ADMIN_SESSION_COOKIE = "vs_admin_session"

const ADMIN_SESSION_DURATION = 8 * 60 * 60 * 1000

const adminSessions = new Map()

// Internal key for automatic background UFL processing.
// This is generated privately whenever the server starts.
const INTERNAL_TASK_KEY = randomBytes(32).toString("hex")

function getAdminToken(req) {
  const cookies = (req.headers.cookie || "").split(";")

  const sessionCookie = cookies
    .map((cookie) => cookie.trim())
    .find((cookie) =>
      cookie.startsWith(`${ADMIN_SESSION_COOKIE}=`)
    )

  return sessionCookie
    ? sessionCookie.slice(ADMIN_SESSION_COOKIE.length + 1)
    : ""
}

function isAdminAuthenticated(req) {
  const token = getAdminToken(req)

  if (!token) return false

  const session = adminSessions.get(token)

  if (!session) return false

  if (session.expiresAt <= Date.now()) {
    adminSessions.delete(token)
    return false
  }

  return true
}

// Protect routes that require an administrator login.
function requireAdmin(req, res, next) {
  if (!isAdminAuthenticated(req)) {
    return res.status(401).json({
      message: "Administrator login required.",
    })
  }

  next()
}

// Allow either an administrator or the server's own
// automatic background process.
function requireAdminOrInternalTask(req, res, next) {
  const suppliedKey = Buffer.from(
    req.headers["x-internal-task-key"] || ""
  )

  const expectedKey = Buffer.from(INTERNAL_TASK_KEY)

  const validInternalRequest =
    suppliedKey.length === expectedKey.length &&
    timingSafeEqual(suppliedKey, expectedKey)

  if (validInternalRequest || isAdminAuthenticated(req)) {
    return next()
  }

  return res.status(401).json({
    message: "Administrator access required.",
  })
}

// Administrator login.
app.post("/api/admin/login", (req, res) => {
  if (!ADMIN_PASSWORD) {
    return res.status(503).json({
      message: "Administrator password is not configured.",
    })
  }

  const suppliedPassword = Buffer.from(
    String(req.body?.password || "")
  )

  const expectedPassword = Buffer.from(ADMIN_PASSWORD)

  const passwordMatches =
    suppliedPassword.length === expectedPassword.length &&
    timingSafeEqual(suppliedPassword, expectedPassword)

  if (!passwordMatches) {
    return res.status(401).json({
      message: "Incorrect administrator password.",
    })
  }

  const token = randomBytes(32).toString("hex")

  adminSessions.set(token, {
    expiresAt: Date.now() + ADMIN_SESSION_DURATION,
  })

  const secureCookie =
    process.env.NODE_ENV === "production" ? "; Secure" : ""

  res.setHeader(
    "Set-Cookie",
    `${ADMIN_SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secureCookie}`
  )

  res.json({
    authenticated: true,
    message: "Administrator login successful.",
  })
})

// Check whether the current browser has an active session.
app.get("/api/admin/session", (req, res) => {
  res.json({
    authenticated: isAdminAuthenticated(req),
  })
})

// Administrator logout.
app.post("/api/admin/logout", (req, res) => {
  const token = getAdminToken(req)

  if (token) {
    adminSessions.delete(token)
  }

  const secureCookie =
    process.env.NODE_ENV === "production" ? "; Secure" : ""

  res.setHeader(
    "Set-Cookie",
    `${ADMIN_SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureCookie}`
  )

  res.json({
    authenticated: false,
    message: "Administrator logged out.",
  })
})

app.get("/api/ufl-feed", requireAdmin, async (req, res) => {
  try {
    const feed = await fetchUFLFeed()

    const articles = feed.items.map((item) => ({
      title: item.title || "",
      link: item.link || "",
      publishedAt: item.isoDate || item.pubDate || "",
      content: item.contentSnippet || item.content || "",
    }))

    res.json({
      source: "Official Pepsi University Football League on X",
      articles,
    })
  } catch (error) {
    console.error("Failed to fetch Pepsi UFL feed:", error)

    res.status(502).json({
      message: "Could not retrieve Pepsi UFL updates right now.",
    })
  }
})

app.get("/api/ufl-match-updates", requireAdmin, async (req, res) => {
  try {
    const feed = await fetchUFLFeed()

    const matchKeywords =
      /\b(vs|versus|full.?time|half.?time|kick.?off|goal|scored|assist|yellow card|red card|penalty|own goal|matchday|fixture|league table)\b/i

    const updates = feed.items
      .map((item) => ({
        title: item.title || "",
        link: item.link || "",
        publishedAt: item.isoDate || item.pubDate || "",
        content: item.contentSnippet || item.content || "",
      }))
      .filter((post) =>
        matchKeywords.test(`${post.title} ${post.content}`)
      )

    res.json({
      source: "Pepsi UFL on X",
      count: updates.length,
      updates,
    })
  } catch (error) {
    console.error("Failed to fetch UFL match updates:", error)

    res.status(502).json({
      message: "Could not retrieve Pepsi UFL match updates.",
    })
  }
})

app.get("/api/ufl-parsed-updates", requireAdminOrInternalTask, async (req, res) => {
try {
const feed = await fetchUFLFeed()

const updates = feed.items.map((item) => {
  const title = item.title || ""
  const content = (
    item.content ||
    item.contentSnippet ||
    ""
  )
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()

  const cleanTitle = title.replace(/…+$/, "").trim()

const text = content.toLowerCase().startsWith(cleanTitle.toLowerCase())
  ? content
  : `${title} ${content}`

const normalizedText = text
  .replace(/\s+/g, " ")
  .trim()

  const fullTime = text.match(
    /FULL-TIME\s*\|?\s*@?(.+?)\s+(\d+)\s*[-–]\s*(\d+)\s+@?([^\s⚽|]+)/i
  )

  const homeTeam = fullTime ? fullTime[1].trim() : ""
const awayTeam = fullTime ? fullTime[4].trim() : ""

const goals = []

const keepTwoNameParts = (name) => {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (parts.length === 0) return ""

  return parts.length > 1
    ? `${parts[0]} ${parts[parts.length - 1]}`
    : parts[0]
}

const goalPattern =
  /⚽\s*([A-Z][A-Za-z.'’-]+(?:\s+[A-Z][A-Za-z.'’-]+){0,3})\s*(?:\(\s*🅿️\s*\)\s*)?(\d{1,3}(?:\s*\+\s*\d{1,2})?)?["'′’]?(?:\s*\(\s*🅿️\s*\))?/g
const goalMatches = [...text.matchAll(goalPattern)]

goalMatches.forEach((goalMatch, index) => {
  const scorer = keepTwoNameParts(goalMatch[1])

 const minuteMatch = goalMatch[0].match(
  /(\d{1,3})(?:\s*\+\s*(\d{1,2}))?\s*["'′’]?/
)

const minute = minuteMatch
  ? Number(minuteMatch[1]) + Number(minuteMatch[2] || 0)
  : null
  const start = goalMatch.index + goalMatch[0].length
  const nextGoal = goalMatches[index + 1]
  const end = nextGoal ? nextGoal.index : text.length

  const followingText = text.slice(start, end)

  const isPenalty =
    /\(\s*🅿️\s*\)|\bpenalty\b/i.test(
      goalMatch[0] + " " + followingText
    )

  // First check the official assist emoji format.
  let assist = ""

 const emojiAssist = followingText.match(
  /🅰️[ \t]*([A-Z][A-Za-z.'’-]+(?:[ \t]+[A-Z][A-Za-z.'’-]+))/
)

  if (emojiAssist) {
    assist = keepTwoNameParts(emojiAssist[1])
  } else {
    // Also recognise assists described in normal sentences.
    const naturalAssistPatterns = [
      /(?:after|following)\s+(?:meeting|connecting with)\s+([A-Z][A-Za-z.'’-]+(?:\s+[A-Z][A-Za-z.'’-]+){1,2})['’]?s\s+pass/i,
      /(?:after|following)\s+(?:a\s+)?pass\s+from\s+([A-Z][A-Za-z.'’-]+(?:\s+[A-Z][A-Za-z.'’-]+){1,2})/i,
      /assisted by\s+([A-Z][A-Za-z.'’-]+(?:\s+[A-Z][A-Za-z.'’-]+){1,2})/i,
      /(?:cross|delivery|through ball)\s+from\s+([A-Z][A-Za-z.'’-]+(?:\s+[A-Z][A-Za-z.'’-]+){1,2})/i
    ]

    for (const pattern of naturalAssistPatterns) {
      const match = followingText.match(pattern)

      if (match) {
        assist = keepTwoNameParts(match[1])
        break
      }
    }
  }

  goals.push({
    scorer,
    minute,
    type: isPenalty ? "PENALTY" : "NORMAL",
    assist,
    team: null
  })
})

  // ADDITION: recognise natural-language goal announcements.
  // The existing emoji-based goal parser above remains unchanged.

 const postMinuteMatch =
  text.match(/#PepsiUFL\s+(\d{1,3})(?:\s*\+\s*(\d{1,2}))?\s*["'′’]/i) ||
  text.match(/\b(\d{1,3})(?:st|nd|rd|th)\s+minute\b/i)

const postGoalMinute = postMinuteMatch
  ? Number(postMinuteMatch[1]) + Number(postMinuteMatch[2] || 0)
  : null

  const goalActionWords =
    "breaks|levels|equalizes|equalises|brings|draws|puts|fires|scores|heads|slots|strikes|opens|doubles|restores|makes|finds|with|after|following|from|into"

  const getDescribedAssist = (description) => {
    const assistPatterns = [
      /(?:after|following)\s+(?:meeting|connecting with)\s+([A-Z][A-Za-z.'’-]+(?:\s+[A-Z][A-Za-z.'’-]+){1,2})[’']?s\s+(?:free kick|pass|cross|delivery|long ball)/i,
      /(?:free kick|pass|cross|delivery|long ball)\s+from\s+([A-Z][A-Za-z.'’-]+(?:\s+[A-Z][A-Za-z.'’-]+){1,2})/i,
      /assisted by\s+([A-Z][A-Za-z.'’-]+(?:\s+[A-Z][A-Za-z.'’-]+){1,2})/i,
    ]

    for (const pattern of assistPatterns) {
      const assistMatch = description.match(pattern)

      if (assistMatch) {
        return keepTwoNameParts(
  assistMatch[1].trim().replace(/[’']+$/, "")
)
      }
    }

    return ""
  }

  const addNaturalLanguageGoal = (scorerText, textAfterScorer) => {
    const scorer = keepTwoNameParts(
  scorerText.trim().replace(/[’']+$/, "")
)

    if (!scorer) return

    const scorerKey = normalizeTeamName(scorer)

    const alreadyDetected = goals.some((goal) => {
      const sameScorer =
        normalizeTeamName(goal.scorer) === scorerKey

      const sameMinute =
        goal.minute === postGoalMinute ||
        goal.minute == null ||
        postGoalMinute == null

      return sameScorer && sameMinute
    })

    if (alreadyDetected) return

    goals.push({
      scorer,
      minute: postGoalMinute,
      type: /\bpenalty\b|🅿️/i.test(textAfterScorer)
        ? "PENALTY"
        : "NORMAL",
      assist: getDescribedAssist(textAfterScorer),
      team: null,
    })
  }

  // Goal for the visitors/hosts.
  // Also recognise Equalizer and Equaliser.

  const naturalGoalPatterns = [
    new RegExp(
      `\\bGoal\\s+for\\s+(?:the\\s+)?(?:visitors|away team|hosts|home team)\\s+([A-Z][A-Za-z.'’-]+(?:\\s+[A-Z][A-Za-z.'’-]+){1,2})(?=\\s+(?:${goalActionWords})\\b)`,
      "gi"
    ),
    new RegExp(
      `\\b(?:equalizer|equaliser)\\s+([A-Z][A-Za-z.'’-]+(?:\\s+[A-Z][A-Za-z.'’-]+){1,2})(?=\\s+(?:${goalActionWords})\\b)`,
      "gi"
    ),
  ]

  for (const pattern of naturalGoalPatterns) {
    for (const match of text.matchAll(pattern)) {
      const scorerPosition =
        match.index + match[0].lastIndexOf(match[1])

      const afterScorerPosition =
        scorerPosition + match[1].length

      addNaturalLanguageGoal(
        match[1],
        text.slice(afterScorerPosition)
      )
    }
  }

  // Also recognise "Goal for [university name] [scorer]"
  // using the existing university aliases.

  const teamAliasesForGoalPosts = Object.entries(sharedTeamAliases)
    .flatMap(([canonicalName, aliases]) => [
      canonicalName,
      ...(Array.isArray(aliases) ? aliases : []),
    ])
    .filter(Boolean)
    .sort((a, b) => String(b).length - String(a).length)

  for (const marker of text.matchAll(/\bGoal\s+for\s+/gi)) {
    const textAfterMarker =
      text.slice(marker.index + marker[0].length)

    for (const alias of teamAliasesForGoalPosts) {
      const escapedAlias = String(alias).replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      )

      const aliasMatch = textAfterMarker.match(
        new RegExp(`^${escapedAlias}(?=\\s|\\b)`, "i")
      )

      if (!aliasMatch) continue

      const textAfterTeam =
        textAfterMarker.slice(aliasMatch[0].length)

      const scorerMatch = textAfterTeam.match(
        new RegExp(
          `^\\s*([A-Z][A-Za-z.'’-]+(?:\\s+[A-Z][A-Za-z.'’-]+){1,2})(?=\\s+(?:${goalActionWords})\\b)`,
          "i"
        )
      )

      if (scorerMatch) {
        const scorerPosition =
          marker.index +
          marker[0].length +
          aliasMatch[0].length +
          scorerMatch[0].indexOf(scorerMatch[1])

        const afterScorerPosition =
          scorerPosition + scorerMatch[1].length

        addNaturalLanguageGoal(
          scorerMatch[1],
          text.slice(afterScorerPosition)
        )
      }

      break
    }
  }


  const cards = []

const cardPatterns = [
  {
    type: "RED",
    pattern: /([A-Z][A-Za-z.'’-]+(?:\s+[A-Z][A-Za-z.'’-]+){1,3})\s+(?:was\s+)?(?:sent off|shown a red card|received a second booking|was dismissed)/gi,
  },
  {
    type: "RED",
    pattern: /(?:red card|sent off|second booking|second yellow)\s+(?:for|to)\s+([A-Z][A-Za-z.'’-]+(?:\s+[A-Z][A-Za-z.'’-]+){1,3})/gi,
  },
  {
    type: "YELLOW",
    pattern: /(?:yellow card|booked)\s+(?:for|to)\s+([A-Z][A-Za-z.'’-]+(?:\s+[A-Z][A-Za-z.'’-]+){1,3})/gi,
  },
]

const detectedCards = new Map()

cardPatterns.forEach(({ type, pattern }) => {
  let cardMatch

  while ((cardMatch = pattern.exec(text)) !== null) {
    const player = keepTwoNameParts(cardMatch[1])

    const context = text.slice(
      Math.max(0, cardMatch.index - 50),
      Math.min(text.length, cardMatch.index + cardMatch[0].length + 50)
    )

    const minuteMatch = context.match(
  /(\d{1,3})(?:st|nd|rd|th)?\s*(?:minute|min|["'′’])/i
)

    const key = `${type}-${player.toLowerCase()}`

    if (!detectedCards.has(key)) {
      detectedCards.set(key, {
        id: `ufl-card-${item.link?.split("/").pop() || "unknown"}-${detectedCards.size}`,
        player,
        team: null,
        type,
        minute: minuteMatch ? Number(minuteMatch[1]) : null,
      })
    }
  }
})

cards.push(...detectedCards.values())

  const publishedAt = item.isoDate || item.pubDate || ""

  const matchDate = publishedAt
    ? new Date(publishedAt).toISOString().slice(0, 10)
    : ""

  const matchKey = fullTime
    ? [
        matchDate,
        fullTime[1].trim().toLowerCase(),
        fullTime[4].trim().toLowerCase(),
      ].join("__")
    : null

  return {
    title,
    link: item.link || "",
    publishedAt,
    matchDate,
    matchKey,
    sourcePost: item.link || "",
    status: fullTime ? "FINISHED" : "UNCONFIRMED",
    score: fullTime
      ? {
          homeTeam: fullTime[1].trim(),
          homeScore: Number(fullTime[2]),
          awayScore: Number(fullTime[3]),
          awayTeam: fullTime[4].trim(),
        }
      : null,
    goals,
    cards,
    originalText: text,
  }
})

const uniqueResults = []
const seenPosts = new Set()

for (const update of [...updates].reverse()) {
  if (!update.score || !update.sourcePost) continue

  if (seenPosts.has(update.sourcePost)) continue

  seenPosts.add(update.sourcePost)
  uniqueResults.push(update)
}

// SAFEGUARD: Make sure official fixtures are available
// before processing FULL-TIME results.

const fixturesReadyForResults = readFixtures()
let fixturesSyncedBeforeResults = false

for (const fixture of fixturesReadyForResults) {

  const sameTeam = (firstTeam, secondTeam) => {
  const firstIdentity = resolveTeamIdentity(firstTeam)
  const secondIdentity = resolveTeamIdentity(secondTeam)

  // Both names resolve to registered universities.
  if (firstIdentity && secondIdentity) {
    return firstIdentity.key === secondIdentity.key
  }

  // Otherwise, only accept an exact normalised match.
  return (
    normalizeTeamName(firstTeam) ===
    normalizeTeamName(secondTeam)
  )
}

 const sameResultFixture = (match) => {
  const directOrder =
    sameTeam(match.homeTeam, fixture.homeTeam) &&
    sameTeam(match.awayTeam, fixture.awayTeam)

  const reversedOrder =
    sameTeam(match.homeTeam, fixture.awayTeam) &&
    sameTeam(match.awayTeam, fixture.homeTeam)

  const matchDate = String(match.date || "").slice(0, 10)
  const fixtureDate = String(fixture.date || "").slice(0, 10)

  const sameDate =
    !matchDate ||
    !fixtureDate ||
    matchDate === fixtureDate

  return (directOrder || reversedOrder) && sameDate
}

  // Check whether this official fixture is already imported.
  const officialFixtureIndex = matches.findIndex(
    (match) =>
      match.fixtureId === fixture.id ||
      match.id === fixture.id
  )

  if (officialFixtureIndex !== -1) {
    if (!matches[officialFixtureIndex].fixtureId) {
      matches[officialFixtureIndex].fixtureId = fixture.id
      fixturesSyncedBeforeResults = true
    }

    continue
  }

  // Find an existing record for the same fixture.
  let equivalentIndex = matches.findIndex(
    (match) =>
      sameResultFixture(match) &&
      match.status !== "FINISHED"
  )

  if (equivalentIndex === -1) {
    equivalentIndex = matches.findIndex(sameResultFixture)
  }

  if (equivalentIndex !== -1) {

    // Preserve the existing scores and events while attaching
    // the official fixture identity and university names.
    const existing = matches[equivalentIndex]

   matches[equivalentIndex] = {
  ...fixture,
  ...existing,
  id: existing.id,
  fixtureId: fixture.id,
  homeTeam: existing.homeTeam,
  awayTeam: existing.awayTeam,
  date: existing.date || fixture.date,
  competition:
    fixture.competition ||
    existing.competition ||
    "Pepsi University Football League",
  sourceType: "OFFICIAL_UFL",
}

    fixturesSyncedBeforeResults = true

  } else {

    // Import the official fixture before processing its result.
    matches.push({
      ...fixture,
      fixtureId: fixture.id,
      homeScore: 0,
      awayScore: 0,
      status: "SCHEDULED",
      minute: 0,
      events: [],
      goals: [],
      cards: [],
      competition:
        fixture.competition ||
        "Pepsi University Football League",
      sourceType: "OFFICIAL_UFL",
    })

    fixturesSyncedBeforeResults = true
  }
}

if (fixturesSyncedBeforeResults) {
  saveMatches()
  console.log("Official fixtures synchronised before result processing.")
}


const savedResults = []

for (const update of uniqueResults) {
  const homeTeam = update.score.homeTeam
  const awayTeam = update.score.awayTeam

  const sameTeam = (firstTeam, secondTeam) => {
  const firstAliases = getTeamAliases(firstTeam)
    .map(normalizeTeamName)

  const secondAliases = getTeamAliases(secondTeam)
    .map(normalizeTeamName)

  return secondAliases.some((alias) =>
    firstAliases.includes(alias)
  )
}

const sameResultFixture = (match) => {
  const directOrder =
    sameTeam(match.homeTeam, homeTeam) &&
    sameTeam(match.awayTeam, awayTeam)

  const reversedOrder =
    sameTeam(match.homeTeam, awayTeam) &&
    sameTeam(match.awayTeam, homeTeam)

  const savedDate = String(match.date || "").slice(0, 10)
  const resultDate = String(update.matchDate || "").slice(0, 10)

  const sameDate =
    !savedDate ||
    !resultDate ||
    savedDate === resultDate

  return (directOrder || reversedOrder) && sameDate
}

// Prefer the original official fixture.
let existingIndex = matches.findIndex(
  (match) =>
    sameResultFixture(match) &&
    Boolean(match.fixtureId)
)

// Otherwise find an unfinished matching record.
if (existingIndex === -1) {
  existingIndex = matches.findIndex(
    (match) =>
      sameResultFixture(match) &&
      match.status !== "FINISHED"
  )
}

// Then check the official result post reference.
if (existingIndex === -1) {
  existingIndex = matches.findIndex(
    (match) => match.officialSource === update.sourcePost
  )
}

// Last, find any matching record.
if (existingIndex === -1) {
  existingIndex = matches.findIndex(sameResultFixture)
}

// FALLBACK: identify a fixture using one recognised opponent.

let matchedUsingKnownOpponent = false
let fixtureFallbackReversed = false

if (existingIndex === -1) {
  const parsedHome = resolveTeamIdentity(homeTeam)
  const parsedAway = resolveTeamIdentity(awayTeam)

  const knownFeedTeams = [
    parsedHome
      ? { identity: parsedHome, side: "home" }
      : null,
    parsedAway
      ? { identity: parsedAway, side: "away" }
      : null,
  ].filter(Boolean)

  const resultDate = String(update.matchDate || "").slice(0, 10)

  // Only use this fallback when exactly one feed team is recognised.
  if (knownFeedTeams.length === 1 && resultDate) {
    const knownTeam = knownFeedTeams[0]

    const candidates = matches
      .map((match, index) => ({ match, index }))
      .filter(({ match }) => {
        if (!match.fixtureId) return false

        const savedDate = String(match.date || "").slice(0, 10)

        if (savedDate !== resultDate) return false

        const savedHome = resolveTeamIdentity(match.homeTeam)
        const savedAway = resolveTeamIdentity(match.awayTeam)

        if (!savedHome || !savedAway) return false

        return (
          savedHome.key === knownTeam.identity.key ||
          savedAway.key === knownTeam.identity.key
        )
      })

    // Never guess if more than one fixture is possible.
    if (candidates.length === 1) {
      const candidate = candidates[0]
      const savedHome = resolveTeamIdentity(candidate.match.homeTeam)

      fixtureFallbackReversed =
        (knownTeam.side === "home" &&
          candidate.match.awayTeam &&
          resolveTeamIdentity(candidate.match.awayTeam)?.key === knownTeam.identity.key) ||
        (knownTeam.side === "away" &&
          savedHome?.key === knownTeam.identity.key)

      existingIndex = candidate.index
      matchedUsingKnownOpponent = true

      console.log(
        "UFL RESULT MATCHED USING RECOGNISED OPPONENT:",
        candidate.match.homeTeam,
        "vs",
        candidate.match.awayTeam
      )
    } else if (candidates.length > 1) {
      console.warn(
        "UFL result needs manual review: multiple possible fixtures.",
        update.sourcePost
      )
    }
  }
}

const existingMatch =
  existingIndex === -1 ? null : matches[existingIndex]


  // Never create a second match when fixture identification fails.
if (!existingMatch) {
  const pendingResults = readUnmatchedUFLResults()

  const pendingResult = {
    sourcePost: update.sourcePost,
    publishedAt: update.publishedAt,
    matchDate: update.matchDate,
    feedHomeTeam: homeTeam,
    feedAwayTeam: awayTeam,
    homeScore: update.score.homeScore,
    awayScore: update.score.awayScore,
    originalText: update.originalText,
    reason: "No confident existing fixture match found.",
  }

  const existingPendingIndex = pendingResults.findIndex(
    (item) => item.sourcePost === update.sourcePost
  )

  if (existingPendingIndex === -1) {
    pendingResults.push(pendingResult)
  } else {
    pendingResults[existingPendingIndex] = pendingResult
  }

  saveUnmatchedUFLResults(pendingResults)

  console.warn(
    "UFL RESULT HELD FOR ADMIN REVIEW:",
    update.sourcePost
  )

  continue
}

// Determine whether the official feed has reversed the teams.
const resultOrientationIsReversed =
  matchedUsingKnownOpponent
    ? fixtureFallbackReversed
    : Boolean(existingMatch) &&
      sameTeam(existingMatch.homeTeam, awayTeam) &&
      sameTeam(existingMatch.awayTeam, homeTeam)
  Boolean(existingMatch) &&
  sameTeam(existingMatch.homeTeam, awayTeam) &&
  sameTeam(existingMatch.awayTeam, homeTeam)

// Prepare detected cards without overwriting verified records.
const savedCards = update.cards.map((card, index) => ({
  id: card.id || `ufl-card-${update.sourcePost.split("/").pop()}-${index}`,
  player: card.player,
  team: card.team || null,
  type: card.type,
  minute: card.minute ?? null,
}))

const isParserOwned = existingMatch?.sourceType === "OFFICIAL_UFL"

// Only assign goals automatically when the final score
// makes the scoring team certain.
let inferredGoalTeam = ""

if (
  update.score.homeScore > 0 &&
  update.score.awayScore === 0
) {
  inferredGoalTeam = homeTeam
} else if (
  update.score.awayScore > 0 &&
  update.score.homeScore === 0
) {
  inferredGoalTeam = awayTeam
}

// Preserve every reported goal.
// Do not remove goals just because the scorer and minute match.

const uniqueGoals = update.goals.filter(
  (goal) => goal.scorer && goal.scorer.trim()
)


// Match goal announcements to their score updates.
// This identifies the scoring team without hardcoding player names.

const normalizePlayer = (name) =>
  (name || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "")

const normalizeHandle = (name) =>
  (name || "")
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[^a-z0-9]/g, "")

const playerNamesMatch = (first, second) => {
  const a = normalizePlayer(first)
  const b = normalizePlayer(second)

  if (!a || !b) return false
  if (a === b) return true

  // Allow small spelling differences in reported player names.
  const tokensA = (first || "").toLowerCase().match(/[a-z]+/g) || []
  const tokensB = (second || "").toLowerCase().match(/[a-z]+/g) || []

  return tokensA.some((tokenA) =>
    tokensB.some((tokenB) => {
      if (tokenA === tokenB) return true
      if (Math.abs(tokenA.length - tokenB.length) > 1) return false

      let differences = 0
      let i = 0
      let j = 0

      while (i < tokenA.length && j < tokenB.length) {
        if (tokenA[i] === tokenB[j]) {
          i++
          j++
        } else {
          differences++

          if (differences > 1) return false

          if (tokenA.length > tokenB.length) i++
          else if (tokenB.length > tokenA.length) j++
          else {
            i++
            j++
          }
        }
      }

      differences += (tokenA.length - i) + (tokenB.length - j)

      return differences <= 1
    })
  )
}

// Collect score updates for this particular match.
const homeHandle = normalizeHandle(homeTeam)
const awayHandle = normalizeHandle(awayTeam)

const scoreSnapshots = updates
  .map((post) => {
    const postText = post.originalText || ""

    const scoreMatch = postText.match(
      /@?([a-z0-9_]+)\s+(\d+)\s*[-–]\s*(\d+)\s+@?([a-z0-9_]+)/i
    )

    if (!scoreMatch) return null

    if (
      normalizeHandle(scoreMatch[1]) !== homeHandle ||
      normalizeHandle(scoreMatch[4]) !== awayHandle
    ) {
      return null
    }

    return {
      post,
      homeScore: Number(scoreMatch[2]),
      awayScore: Number(scoreMatch[3]),
      time: new Date(post.publishedAt || 0).getTime(),
    }
  })
  .filter(Boolean)
  .sort((a, b) => a.time - b.time)

// Find the team responsible for an individual goal.
const findGoalTeam = (goal) => {
  const scorer = goal.scorer || ""

  const announcements = scoreSnapshots.filter((snapshot) => {
    const post = snapshot.post
    const postText = post.originalText || ""

    const scorerFound = playerNamesMatch(scorer, postText)

    const minuteMatches =
      goal.minute == null ||
      new RegExp(`\\b${goal.minute}\\s*["'′’]`).test(postText)

    return scorerFound && minuteMatches
  })

  for (const announcement of announcements) {
    const previous = [...scoreSnapshots]
      .reverse()
      .find((snapshot) => snapshot.time < announcement.time)

    if (previous) {
      if (announcement.homeScore > previous.homeScore) {
        return homeTeam
      }

      if (announcement.awayScore > previous.awayScore) {
        return awayTeam
      }
    }

    // If this is the first recorded score update, use the score itself.
    if (
      announcement.homeScore > 0 &&
      announcement.awayScore === 0
    ) {
      return homeTeam
    }

    if (
      announcement.awayScore > 0 &&
      announcement.homeScore === 0
    ) {
      return awayTeam
    }

    const announcementText =
      announcement.post.originalText || ""

    if (/goal for the visitors|for the visitors|away team/i.test(announcementText)) {
      return awayTeam
    }

    if (/goal for the hosts|for the hosts|home team/i.test(announcementText)) {
      return homeTeam
    }
  }

  return inferredGoalTeam || null
}

const savedGoals = uniqueGoals.map((goal, index) => ({
  id: `ufl-goal-${update.sourcePost.split("/").pop()}-${index}`,
  team: findGoalTeam(goal),
  scorer: goal.scorer,
  minute: goal.minute ?? null,
  type: goal.type,
  ...(goal.assist ? { assist: goal.assist } : {}),
}))

// Enrich full-time goals using earlier official posts
// about the same match.
const enrichedSavedGoals = savedGoals.map((goal) => {
  if (goal.assist || goal.minute == null) return goal

  const scorerKey = normalizeTeamName(goal.scorer)
  const homeKey = normalizeTeamName(homeTeam)
  const awayKey = normalizeTeamName(awayTeam)

  for (const eventUpdate of updates) {
    if (!eventUpdate.sourcePost || eventUpdate.score) continue

    const eventText = (
      eventUpdate.originalText ||
      `${eventUpdate.title} ${eventUpdate.content}`
    )
      .replace(/&apos;/gi, "'")
      .replace(/&#39;/gi, "'")
      .replace(/&amp;/gi, "&")

    const eventKey = normalizeTeamName(eventText)

    // The post must mention both teams and the scorer.
    if (
      !eventKey.includes(homeKey) ||
      !eventKey.includes(awayKey) ||
      !eventKey.includes(scorerKey)
    ) {
      continue
    }

    // The post must refer to the same match minute.
    const minutePattern =
  goal.minute > 90
    ? new RegExp(
        `\\b90\\s*\\+\\s*${goal.minute - 90}\\b|\\b${goal.minute}\\s*["'′’]?`
      )
    : new RegExp(
        `\\b${goal.minute}\\s*["'′’]?`
      )

    if (!minutePattern.test(eventText)) continue

    // Look for an assist described in normal language.
    const assistMatch = eventText.match(
      /(?:after receiving|after meeting|after connecting with|following|pass from|assisted by)\s+([A-Z][A-Za-z.'’-]+(?:\s+[A-Z][A-Za-z.'’-]+){0,2})['’]?\s*(?:&apos;)?s?\s+(?:long ball|pass|cross|delivery)/i
    )

    if (assistMatch) {
      return {
        ...goal,
        assist: assistMatch[1].trim(),
      }
    }

    // Also recognise the official assist emoji.
   const emojiAssist = eventText.match(
  /🅰️[ \t]*([A-Z][A-Za-z.'’-]+(?:[ \t]+[A-Z][A-Za-z.'’-]+))/
)

    if (emojiAssist) {
      return {
        ...goal,
        assist: emojiAssist[1].trim(),
      }
    }
  }

  return goal
})

// PRESERVE MANUALLY REMOVED ASSISTS
// Never allow the official feed to restore a manually removed assist.

const finalSavedGoals = enrichedSavedGoals.map((goal) => {
 
  console.log("CHECKING PREVIOUS GOALS:", existingMatch?.goals)
 
  const previousGoal = (existingMatch?.goals || []).find(
    (oldGoal) =>
      oldGoal.id === goal.id ||
      (
        normalizePlayer(oldGoal.scorer) === normalizePlayer(goal.scorer) &&
        oldGoal.minute === goal.minute
      )
  )

  if (previousGoal?.assistManuallyRemoved) {
    const {
      assist,
      ...goalWithoutAssist
    } = goal

    return {
      ...goalWithoutAssist,
      assistManuallyRemoved: true,
    }
  }

  return goal
})

// Only replace existing goals when the parsed list
// accounts for the complete final score.
const expectedGoalCount =
  update.score.homeScore + update.score.awayScore

const completeGoalList =
  expectedGoalCount > 0 &&
  savedGoals.length === expectedGoalCount

if (existingMatch) {
  const updatedMatch = {
    ...existingMatch,

    homeScore: resultOrientationIsReversed
  ? update.score.awayScore
  : update.score.homeScore,

awayScore: resultOrientationIsReversed
  ? update.score.homeScore
  : update.score.awayScore,

    status: "FINISHED",

    officialSource: update.sourcePost,

    ...(
  isParserOwned &&
  completeGoalList &&
  savedGoals.every(goal => goal.team)
      ? { goals: finalSavedGoals }
    : {}
),

    // Preserve verified cards and events.
    cards: [
  ...(existingMatch.cards || []),
  ...savedCards.filter(
    (card) =>
      !(existingMatch.cards || []).some(
        (existing) =>
          existing.player?.toLowerCase() === card.player.toLowerCase() &&
          existing.type === card.type
      )
  ),
],
    events: existingMatch.events || [],
  }

  matches[existingIndex] = updatedMatch

  savedResults.push(updatedMatch)

  continue
}

  const newMatch = {
    id: `ufl-${update.sourcePost.split("/").pop()}`,
    homeTeam,
    awayTeam,
    homeScore: update.score.homeScore,
    awayScore: update.score.awayScore,
    status: "FINISHED",
    minute: 90,
    date: update.matchDate || "",
    kickoffTime: "",
    competition: "Pepsi UFL",
    events:[],
    goals: enrichedSavedGoals,
    cards: savedCards,
    officialSource: update.sourcePost,
    sourceType: "OFFICIAL_UFL",
  }

  matches.push(newMatch)
  savedResults.push(newMatch)
}

// Process separate live-match event posts without final scores.
const savedLiveEvents = []

for (const update of [...updates].reverse()) {
  if (update.score || !update.sourcePost) continue

  const postText = (
    update.originalText || `${update.title} ${update.content}`
  ).toLowerCase()

  // Only attach an update when BOTH teams are clearly identified.

  const normalizeTeamName = (name) =>
  name.toLowerCase().replace(/[^a-z0-9]/g, "")

const teamAliases = sharedTeamAliases

const normalizedPost = normalizeTeamName(postText)

// Import officially detected fixtures before searching for a match.
const officialFixtures = readFixtures()

let importedFixture = false

for (const fixture of officialFixtures) {
  const fixtureHomeAliases =
    getTeamAliases(fixture.homeTeam)

  const fixtureAwayAliases =
    getTeamAliases(fixture.awayTeam)

 const sameMatch = matches.some((existing) => {
  if (existing.fixtureId === fixture.id) return true

  const existingDate = String(existing.date || "").slice(0, 10)
  const fixtureDate = String(fixture.date || "").slice(0, 10)

  if (existingDate !== fixtureDate) return false

  const existingHomeAliases = getTeamAliases(existing.homeTeam)
  const existingAwayAliases = getTeamAliases(existing.awayTeam)

  const homeMatchesHome = fixtureHomeAliases.some((a) =>
    existingHomeAliases.some(
      (b) => normalizeTeamName(a) === normalizeTeamName(b)
    )
  )

  const awayMatchesAway = fixtureAwayAliases.some((a) =>
    existingAwayAliases.some(
      (b) => normalizeTeamName(a) === normalizeTeamName(b)
    )
  )

  const homeMatchesAway = fixtureHomeAliases.some((a) =>
    existingAwayAliases.some(
      (b) => normalizeTeamName(a) === normalizeTeamName(b)
    )
  )

  const awayMatchesHome = fixtureAwayAliases.some((a) =>
    existingHomeAliases.some(
      (b) => normalizeTeamName(a) === normalizeTeamName(b)
    )
  )

  const sameOrder = homeMatchesHome && awayMatchesAway
  const reversedOrder = homeMatchesAway && awayMatchesHome

  return sameOrder || reversedOrder
})

  if (!sameMatch) {
    matches.push({
      ...fixture,
      fixtureId: fixture.id,
      homeScore: 0,
      awayScore: 0,
      status: "SCHEDULED",
      minute: 0,
      events: [],
      goals: [],
      cards: [],
      competition: fixture.competition || "Pepsi UFL",
      sourceType: "OFFICIAL_UFL"
    })

    importedFixture = true
  }
}

// Now find the match mentioned in the official post.
const matchingMatches = matches.filter((match) => {
  const home = normalizeTeamName(match.homeTeam || "")
  const away = normalizeTeamName(match.awayTeam || "")

  const homeAliases = getTeamAliases(match.homeTeam)

  const awayAliases = getTeamAliases(match.awayTeam)

  const homeMentioned = homeAliases.some((alias) =>
    normalizedPost.includes(normalizeTeamName(alias))
  )

  const awayMentioned = awayAliases.some((alias) =>
    normalizedPost.includes(normalizeTeamName(alias))
  )

  return (
    home &&
    away &&
    homeMentioned &&
    awayMentioned &&
    match.status !== "FINISHED"
  )
})

 if (matchingMatches.length === 0) {

  // Recognise the official UFL kick-off format.
  const kickoffScore = postText.match(
    /KICK[\s-]?OFF\s*\|\s*@?([^\s]+)\s+(\d+)\s*[-–]\s*(\d+)\s+@?([^\s|]+)(?:\s+(\d{1,3})(?:\s*\+\s*(\d{1,2}))?\s*['′’"])?/i
  )

  if (!kickoffScore) continue

  const resolvePostedTeam = (handle) => {
    const normalizedHandle = normalizeTeamName(handle)

    for (const [key, aliases] of Object.entries(teamAliases)) {
      const allAliases = [key, ...(aliases || [])]

      const recognised = allAliases.some(
        (alias) =>
          normalizeTeamName(alias) === normalizedHandle
      )

      if (recognised) {
        const displayName = (aliases || []).find(
          (alias) =>
            /\s/.test(alias) &&
            /(university|institute|college)/i.test(alias)
        )

        if (!displayName) return null

        return {
          key,
          name: displayName
            .split(" ")
            .map(
              (word) =>
                word.charAt(0).toUpperCase() + word.slice(1)
            )
            .join(" "),
        }
      }
    }

    return null
  }

  const postedHome = resolvePostedTeam(kickoffScore[1])
  const postedAway = resolvePostedTeam(kickoffScore[4])

  if (
    !postedHome ||
    !postedAway ||
    postedHome.key === postedAway.key
  ) {
    console.log("Kick-off ignored: teams not safely identified.")
    continue
  }

  // Read the minute directly from the kick-off post.
  // This avoids using explicitMinute before its declaration.
  const kickoffMinute = kickoffScore[5]
    ? Number(kickoffScore[5]) + Number(kickoffScore[6] || 0)
    : 0

  // Prevent duplicate records in either team order.
  const alreadyExists = matches.some((existing) => {
    const existingHome = getTeamAliases(existing.homeTeam)
    const existingAway = getTeamAliases(existing.awayTeam)

    const homeMatches = existingHome.some((alias) =>
      [postedHome.key, ...(teamAliases[postedHome.key] || [])]
        .some(
          (known) =>
            normalizeTeamName(alias) === normalizeTeamName(known)
        )
    )

    const awayMatches = existingAway.some((alias) =>
      [postedAway.key, ...(teamAliases[postedAway.key] || [])]
        .some(
          (known) =>
            normalizeTeamName(alias) === normalizeTeamName(known)
        )
    )

    const reversedHome = existingHome.some((alias) =>
      [postedAway.key, ...(teamAliases[postedAway.key] || [])]
        .some(
          (known) =>
            normalizeTeamName(alias) === normalizeTeamName(known)
        )
    )

    const reversedAway = existingAway.some((alias) =>
      [postedHome.key, ...(teamAliases[postedHome.key] || [])]
        .some(
          (known) =>
            normalizeTeamName(alias) === normalizeTeamName(known)
        )
    )

    return (
      (homeMatches && awayMatches) ||
      (reversedHome && reversedAway)
    )
  })

  if (alreadyExists) continue

  const kickoffTime = update.publishedAt
    ? new Date(update.publishedAt).toISOString()
    : new Date().toISOString()

  const newLiveMatch = {
    id: `ufl-live-${update.sourcePost.split("/").pop()}`,
    homeTeam: postedHome.name,
    awayTeam: postedAway.name,
    homeScore: Number(kickoffScore[2]),
    awayScore: Number(kickoffScore[3]),
    status: "LIVE",
    minute: kickoffMinute,
    clockBaseMinute: kickoffMinute,
    clockStartedAt: kickoffTime,
    clockPausedAt: null,
    date: kickoffTime.slice(0, 10),
    kickoffTime: "",
    competition: "Pepsi University Football League",
    events: [],
    goals: [],
    cards: [],
    officialSource: update.sourcePost,
    sourceType: "OFFICIAL_UFL",
  }

  matches.push(newLiveMatch)
  matchingMatches.push(newLiveMatch)

  console.log(
    `New live match created from official kick-off: ${postedHome.name} vs ${postedAway.name}`
  )
}

if (matchingMatches.length !== 1) continue

  const match = matchingMatches[0]

// Identify the scoring university from official UFL wording.
const inferLiveGoalTeam = () => {
  const text = postText.toLowerCase()

  const getAliases = (teamName) => {
    
    const directAliases = getTeamAliases(teamName)

  return directAliases
  }

  const homeAliases = getAliases(match.homeTeam)
  const awayAliases = getAliases(match.awayTeam)

  // Give priority to explicit official wording such as "Goal for UCU".
const normalizedGoalText = normalizeTeamName(text)

const homeExplicitGoal = homeAliases.some((alias) => {
  const name = normalizeTeamName(alias)
  return name && normalizedGoalText.includes(`goalfor${name}`)
})

const awayExplicitGoal = awayAliases.some((alias) => {
  const name = normalizeTeamName(alias)
  return name && normalizedGoalText.includes(`goalfor${name}`)
})

if (homeExplicitGoal && !awayExplicitGoal) return match.homeTeam
if (awayExplicitGoal && !homeExplicitGoal) return match.awayTeam

  const homeMentioned = homeAliases.some(alias =>
    alias && text.includes(alias.toLowerCase())
  )

  const awayMentioned = awayAliases.some(alias =>
    alias && text.includes(alias.toLowerCase())
  )

  if (homeMentioned && !awayMentioned) return match.homeTeam
  if (awayMentioned && !homeMentioned) return match.awayTeam

  if (/\b(goal for the visitors|for the visitors|visitors|away team)\b/i.test(text)) {
    return match.awayTeam
  }

  if (/\b(goal for the hosts|for the hosts|hosts|home team)\b/i.test(text)) {
    return match.homeTeam
  }

  return null
}

let changed = false

// Detect match progress from official UFL updates.
const lowerText = postText.toLowerCase()

// Update the score from official UFL live scorelines.
const liveScoreMatch = postText.match(
  /@\S+\s+(\d+)\s*[-–]\s*(\d+)\s+@\S+/i
)

if (liveScoreMatch) {
  const newHomeScore = Number(liveScoreMatch[1])
  const newAwayScore = Number(liveScoreMatch[2])

  if (
    match.homeScore !== newHomeScore ||
    match.awayScore !== newAwayScore
  ) {
    match.homeScore = newHomeScore
    match.awayScore = newAwayScore
    changed = true
  }
}

const publishedAt = update.publishedAt
  ? new Date(update.publishedAt).toISOString()
  : new Date().toISOString()

const minuteMatch = lowerText.match(
  /(\d{1,3})(?:\s*\+\s*(\d{1,2}))?\s*['′’"]/
)

// Keep the original minute, including minutes such as 90+3.
const rawExplicitMinute = minuteMatch
  ? Number(minuteMatch[1]) + Number(minuteMatch[2] || 0)
  : null

// Never allow the clock beyond 100.
const explicitMinute =
  rawExplicitMinute !== null
    ? Math.min(rawExplicitMinute, 100)
    : null

// Recognise written added-time announcements.
const addedTimeNumber =
  "(one|two|three|four|five|six|seven|eight|nine|ten|\\d+)"

const addedTimeMatch = lowerText.match(
  new RegExp(
    `\\b(?:minimum\\s+of\\s+)?${addedTimeNumber}\\s+(?:minutes?\\s+(?:of\\s+)?added\\s+time|added\\s+minutes?|minutes?\\s+added\\s+on|minutes?\\s+(?:have\\s+been\\s+)?added)\\b`,
    "i"
  )
)

const addedTimeWords = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
}

const announcedAddedMinutes = addedTimeMatch
  ? Number(
      addedTimeWords[addedTimeMatch[1].toLowerCase()] ||
      addedTimeMatch[1]
    )
  : null

const saysAddedTime =
  announcedAddedMinutes !== null ||
  (rawExplicitMinute !== null && rawExplicitMinute > 90)

const saysKickoff =
  /\b(kick[\s-]?off|match underway|game underway|we are underway|underway)\b/i.test(lowerText)

const saysSecondHalf =
  /\b(second half|2nd half|second period)\b/i.test(lowerText)

const saysHalfTime =
  /\b(half[\s-]?time|half time break|interval)\b/i.test(lowerText)

const saysFullTime =
  /\b(full[\s-]?time|game over|match over|final whistle)\b/i.test(lowerText)

if (saysFullTime) {
  match.status = "FINISHED"
  match.minute = Math.min(Number(match.minute) || 0, 100)
  match.clockPausedAt = publishedAt
  changed = true

} else if (saysHalfTime) {
  match.status = "HALF TIME"
  match.clockPausedAt = publishedAt
  changed = true

} else if (saysAddedTime) {
  // Calculate the announced stopping point.
  const addedMinutes =
    announcedAddedMinutes !== null
      ? announcedAddedMinutes
      : rawExplicitMinute - 90

  match.status = "LIVE"
  match.minute = 90
  match.clockBaseMinute = 90
  match.clockLimitMinute = Math.min(90 + addedMinutes, 100)
  match.clockStartedAt = publishedAt
  match.clockPausedAt = null
  changed = true

} else if (saysSecondHalf || saysKickoff || explicitMinute !== null) {
  match.status = "LIVE"

  if (explicitMinute !== null) {
    match.minute = explicitMinute
    match.clockBaseMinute = explicitMinute
    match.clockStartedAt = publishedAt

    if (explicitMinute >= 90 && !match.clockLimitMinute) {
      match.clockLimitMinute = 100
    }

  } else if (saysSecondHalf) {
    match.minute = 45
    match.clockBaseMinute = 45
    match.clockStartedAt = publishedAt
    match.clockLimitMinute = 100

  } else if (saysKickoff && !match.clockStartedAt) {
    match.minute = 0
    match.clockBaseMinute = 0
    match.clockStartedAt = publishedAt
    match.clockLimitMinute = 100
  }

  match.clockPausedAt = null
  changed = true
}

  const newGoals = (update.goals || [])
    .filter((goal) => goal.scorer?.trim())
    .map((goal, index) => ({
      id: `ufl-live-goal-${update.sourcePost.split("/").pop()}-${index}`,
      team: goal.team || inferLiveGoalTeam(),
      scorer: goal.scorer,
      minute: goal.minute ?? null,
      type: goal.type || "NORMAL",
      ...(goal.assist ? { assist: goal.assist } : {}),
    }))

  const allGoals = [...(match.goals || []), ...newGoals]
const uniqueGoals = []

for (const goal of allGoals) {
  const scorerKey = (goal.scorer || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "")

  const teamKey = (goal.team || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "")

  const existing = uniqueGoals.find((item) => {
    const existingScorer = (item.scorer || "")
      .toLowerCase()
      .replace(/[^a-z]/g, "")

    const existingTeam = (item.team || "")
      .toLowerCase()
      .replace(/[^a-z]/g, "")

    return (
      scorerKey === existingScorer &&
      goal.minute === item.minute &&
      (!teamKey || !existingTeam || teamKey === existingTeam)
    )
  })

  if (existing) {
    if (
  !existing.assist &&
  goal.assist &&
  !existing.assistManuallyRemoved
) {
  existing.assist = goal.assist
}

    if (!existing.team && goal.team) {
      existing.team = goal.team
    }
  } else {
    uniqueGoals.push({ ...goal })
  }
}

if (uniqueGoals.length !== (match.goals || []).length) {
  match.goals = uniqueGoals
  changed = true
}

  const newCards = (update.cards || []).map((card, index) => ({
    id: card.id || `ufl-live-card-${update.sourcePost.split("/").pop()}-${index}`,
    player: card.player,
    team: card.team || null,
    type: card.type,
    minute: card.minute ?? null,
  }))

  for (const card of newCards) {
    const exists = (match.cards || []).some(
      (existing) => existing.id === card.id
    )

    if (!exists) {
      match.cards = [...(match.cards || []), card]
      changed = true
    }
  }

 if (changed) {
  let notificationType = ""
  let notificationTitle = ""
  let notificationBody = ""

  if (saysFullTime) {
    notificationType = "full-time"
    notificationTitle = "🏁 Full Time"
    notificationBody =
      `${match.homeTeam} ${match.homeScore}-${match.awayScore} ${match.awayTeam}`

  } else if (saysHalfTime) {
    notificationType = "half-time"
    notificationTitle = "⏸️ Half Time"
    notificationBody =
      `${match.homeTeam} ${match.homeScore}-${match.awayScore} ${match.awayTeam}`

  } else if (newGoals.length > 0) {
    notificationType = "goal"
    notificationTitle = "⚽ GOAL!"

    const goal = newGoals[0]

    notificationBody =
      `${goal.scorer} scores for ${goal.team || "their team"}! ` +
      `${match.homeTeam} ${match.homeScore}-${match.awayScore} ${match.awayTeam}`

  } else if (newCards.length > 0) {
    notificationType = "card"
    notificationTitle = "🟨 Match Card"

    const card = newCards[0]

    notificationBody =
      `${card.player} receives a ${card.type} card.`

  } else if (saysKickoff) {
    notificationType = "kickoff"
    notificationTitle = "⚽ Kick-off!"
    notificationBody =
      `${match.homeTeam} vs ${match.awayTeam} has started.`

  } else if (saysSecondHalf) {
    notificationType = "second-half"
    notificationTitle = "⚽ Second Half"
    notificationBody =
      `${match.homeTeam} vs ${match.awayTeam} has resumed.`
  }

  if (notificationType) {
    savedLiveEvents.push({
      matchId: match.id,
      sourcePost: update.sourcePost,
      eventKey: `${update.sourcePost}:${notificationType}`,
      title: notificationTitle,
      body: notificationBody,
    })
  }
}
}

if (savedLiveEvents.length > 0 || savedResults.length > 0) {
  // Wait until match updates have been saved to Supabase.
  await saveMatches()

  // Send notifications for live match events.
  for (const event of savedLiveEvents) {
    await sendPushNotificationOnce({
      eventKey: event.eventKey,
      sourcePost: event.sourcePost,
      title: event.title,
      body: event.body,
    })
  }

  // Send full-time notifications for completed results.
  for (const match of savedResults) {
    if (!match.officialSource) continue

    await sendPushNotificationOnce({
      eventKey: `${match.officialSource}:full-time`,
      sourcePost: match.officialSource,
      title: "🏁 Full Time",
      body:
        `${match.homeTeam} ${match.homeScore}-${match.awayScore} ${match.awayTeam}`,
    })
  }
}

res.json({
  source: "Pepsi UFL on X",
  count: updates.length,
  updates,
  confirmedResults: uniqueResults,
  confirmedResultsCount: uniqueResults.length,
  savedResultsCount: savedResults.length,
  savedLiveEventsCount: savedLiveEvents.length,
  savedLiveEvents,
})

} catch (error) {
console.error("Could not parse Pepsi UFL updates:", error)

res.status(502).json({
  message: "Could not retrieve Pepsi UFL updates.",
})

}
})

app.post("/api/backfill-ufl-results", requireAdmin,(req, res) => {
  const historicalResults = [
    {
      id: "ufl-history-2026-10-22-muteesa-bugema",
      date: "2026-10-22",
      homeTeam: "Muteesa I Royal University",
      awayTeam: "Bugema University",
      homeScore: 3,
      awayScore: 0,
      officialSource: "https://voiceofbugerere.com/pepsi-ufl-post-nyanzi-meddie-cry-begins-at-bugema-as-tony-mawejjes-royal-lions-send-a-strong-warning/"
    },
    {
      id: "ufl-history-2026-10-23-wmfu-mubs",
      date: "2026-10-23",
      homeTeam: "World Mission Frontiers University",
      awayTeam: "Makerere University Business School",
      homeScore: 0,
      awayScore: 1,
      officialSource: "https://kawowo.com/2026/10/23/10-man-mubs-edge-debutants-university-of-world-mission-frontier-2026-27-ufl/"
    },
    {
      id: "ufl-history-2026-10-24-soroti-king-ceasor",
      date: "2026-10-24",
      homeTeam: "Soroti University",
      awayTeam: "King Ceasor University",
      homeScore: 0,
      awayScore: 2,
      officialSource: "https://kawowo.com/2026/10/24/2026-27-ufl-king-ceasor-university-register-victory-on-the-road-at-soroti-university/"
    },
    {
      id: "ufl-history-2026-10-25-lira-kyambogo",
      date: "2026-10-25",
      homeTeam: "Lira University",
      awayTeam: "Kyambogo University",
      homeScore: 2,
      awayScore: 1,
      officialSource: "https://kawowo.com/2026/10/25/2026-27-ufl-lira-university-rallies-from-a-goal-down-to-defeat-kyambogo-university/"
    },
    {
      id: "ufl-history-2026-10-26-ndejje-gulu",
      date: "2026-10-26",
      homeTeam: "Ndejje University",
      awayTeam: "Gulu University",
      homeScore: 0,
      awayScore: 1,
      officialSource: "https://kawowo.com/2026/10/26/2026-27-ufl-rubagakene-on-target-as-gulu-university-wins-on-the-road-away-at-ndejje-university/"
    },
    {
      id: "ufl-history-2026-10-27-ymca-seeta",
      date: "2026-10-27",
      homeTeam: "YMCA Comprehensive Institute",
      awayTeam: "Seeta University",
      homeScore: 0,
      awayScore: 0,
      officialSource: "https://nbssport.co.ug/article/ymca-held-by-seeta-university-in-goalless-ufl-opener"
    },
    {
      id: "ufl-history-2026-10-28-kiu-isbat",
      date: "2026-10-28",
      homeTeam: "Kampala International University",
      awayTeam: "ISBAT University",
      homeScore: 0,
      awayScore: 0,
      officialSource: "https://gabaroadchronicle.wordpress.com/2026/10/29/kiu-isbat-share-spoils-in-goalless-pepsi-university-football-league-draw/"
    }
  ]

  const normalize = (name) =>
    name.trim().toLowerCase().replace(/[_\s]+/g, " ")

  const added = []
  const skipped = []

  historicalResults.forEach((result) => {
    const alreadyExists = matches.some(
      (match) =>
        normalize(match.homeTeam) === normalize(result.homeTeam) &&
        normalize(match.awayTeam) === normalize(result.awayTeam)
    )

    if (alreadyExists) {
      skipped.push(result.homeTeam + " vs " + result.awayTeam)
      return
    }

    const newMatch = {
      ...result,
      status: "FINISHED",
      minute: 90,
      kickoffTime: "",
      competition: "Pepsi University Football League",
      events: [],
      goals: [],
      cards: [],
      sourceType: "HISTORICAL_BACKFILL"
    }

    matches.push(newMatch)
    added.push(newMatch)
  })

  if (added.length > 0) {
    saveMatches()
  }

  res.json({
    message: "Historical Pepsi UFL results processed.",
    addedCount: added.length,
    skippedCount: skipped.length,
    added,
    skipped
  })
})


app.post("/api/repair-ufl-match-records",requireAdmin,(req, res) => {
  const normalize = (name) =>
    (name || "")
      .trim()
      .toLowerCase()
      .replace(/[_\s]+/g, " ")

  const aliases = {
    "ymcainstitute": "ymca comprehensive institute",
    "seetauniversity": "seeta university",
    "ndejjeunive": "ndejje university",
    "gul varsity": "gulu university",
    "gul uvarsity": "gulu university",
    "gul u varsity": "gulu university",
    "gul u university": "gulu university",
    "gul uvarsity ": "gulu university",
    "gul uvarsity": "gulu university",
    "gul u varsity": "gulu university",
    "gul u": "gulu university",
    "gul u varsity ": "gulu university",
    "gul uvarsity": "gulu university",
    "guluvarsity": "gulu university",
    "lira university": "lira university",
    "lira_university": "lira university",
    "kyambogou": "kyambogo university",
    "sorotiuniversi1": "soroti university",
    "kingceasoruni": "king ceasor university",
    "afruniversity": "africa renewal university",
    "muni university": "muni university",
    "kiuvarsity": "kampala international university",
    "isbatkampala": "isbat university",
    "mubs": "makerere university business school",
    "university of world mission frontier":
      "world mission frontiers university",
    "world mission frontier university":
      "world mission frontiers university",
    "muteesa 1 royal university":
      "muteesa i royal university",
    "muteesa i royal university":
      "muteesa i royal university",
  }

  const canonical = (name) => {
    const key = normalize(name)
    return aliases[key] || key
  }

  const repairs = [
    {
      date: "2026-10-22",
      homeTeam: "Bugema University",
      awayTeam: "Muteesa I Royal University",
      homeScore: 0,
      awayScore: 3,
      source:
        "https://kawowo.com/2026/10/22/muteesa-1-royal-university-defeats-bugema-university-in-2026-27-ufl-opener/",
      goals: [
        {
          scorer: "Shabir Lubega",
          team: "Muteesa I Royal University",
          minute: 45,
          type: "NORMAL",
          assist: "Ivan Ochan",
        },
        {
          scorer: "Erick Katende",
          team: "Muteesa I Royal University",
          minute: 50,
          type: "NORMAL",
        },
        {
          scorer: "Sam Mutambo",
          team: "Muteesa I Royal University",
          minute: 60,
          type: "NORMAL",
        },
      ],
      events: [],
    },
    {
      date: "2026-10-23",
      homeTeam: "World Mission Frontiers University",
      awayTeam: "Makerere University Business School",
      homeScore: 0,
      awayScore: 1,
      source:
        "https://kawowo.com/2026/10/23/10-man-mubs-edge-debutants-university-of-world-mission-frontier-2026-27-ufl/",
      goals: [
        {
          scorer: "Joe Worrick Mbabazi",
          team: "Makerere University Business School",
          minute: 77,
          type: "NORMAL",
          assist: "Andrew Ssempijja",
        },
      ],
      events: [
        "MUBS player Talib Yokole was sent off; the report does not specify the minute.",
      ],
      cards: [
  {
    id: "repair-2026-10-23-card-1",
    player: "Talib Yokole",
    team: "Makerere University Business School",
    type: "RED",
    minute: null
  }
],
    },
    {
      date: "2026-10-24",
      homeTeam: "Soroti University",
      awayTeam: "King Ceasor University",
      homeScore: 0,
      awayScore: 2,
      source:
        "https://kawowo.com/2026/10/24/2026-27-ufl-king-ceasor-university-register-victory-on-the-road-at-soroti-university/",
      goals: [
        {
          scorer: "Devis Kayondo",
          team: "King Ceasor University",
          minute: 25,
          type: "NORMAL",
        },
        {
          scorer: "Shedrack Mugisha",
          team: "King Ceasor University",
          minute: 59,
          type: "DIRECT_FREE_KICK",
        },
      ],
      events: [],
      cards: [
  {
    id: "repair-2026-10-24-card-1",
    player: "Barigye Willis",
    team: "King Ceasor University",
    type: "RED",
    minute: 83,
  },
],
    },
    {
      date: "2026-10-25",
      homeTeam: "Lira University",
      awayTeam: "Kyambogo University",
      homeScore: 2,
      awayScore: 1,
      source:
        "https://kawowo.com/2026/10/25/2026-27-ufl-lira-university-rallies-from-a-goal-down-to-defeat-kyambogo-university/",
      goals: [
        {
          scorer: "Ramathan Matovu",
          team: "Kyambogo University",
          minute: 18,
          type: "NORMAL",
        },
        {
          scorer: "Emmanuel Ogeng",
          team: "Lira University",
          minute: 20,
          type: "NORMAL",
        },
{
  id: "repair-2026-10-25-goal-3",
  team: "Lira University",
  scorer: "Solomon Okello",
  minute: null,
  type: "GOAL"
},

      ],
      events: [
        "Solomon Okello scored Lira University's late winning goal; the report does not specify the exact minute.",
      ],
    },
    {
      date: "2026-10-26",
      homeTeam: "Ndejje University",
      awayTeam: "Gulu University",
      homeScore: 0,
      awayScore: 1,
      source:
        "https://kawowo.com/2026/10/26/2026-27-ufl-rubagakene-on-target-as-gulu-university-wins-on-the-road-away-at-ndejje-university/",
      goals: [
        {
          scorer: "Atube Rubagakene",
          team: "Gulu University",
          minute: 15,
          type: "NORMAL",
          assist: "Jackson Otim",
        },
      ],
      events: [],
    },
    {
      date: "2026-10-27",
      homeTeam: "YMCA Comprehensive Institute",
      awayTeam: "Seeta University",
      homeScore: 0,
      awayScore: 0,
      source:
        "https://nbssport.co.ug/article/ymca-held-by-seeta-university-in-goalless-ufl-opener",
      goals: [],
      events: [],
    },
    {
      date: "2026-10-28",
      homeTeam: "Kampala International University",
      awayTeam: "ISBAT University",
      homeScore: 0,
      awayScore: 0,
      source:
        "https://gabaroadchronicle.wordpress.com/2026/10/29/kiu-isbat-share-spoils-in-goalless-pepsi-university-football-league-draw/",
      goals: [],
      events: [],
    },
  
    {
  date: "2026-10-29",
  homeTeam: "Africa Renewal University",
  awayTeam: "Muni University",
  homeScore: 2,
  awayScore: 0,
  source: "https://x.com/uflug/status/2115812323289907643",
  goals: [
    {
      scorer: "Bazanye Jimmy",
      team: "Africa Renewal University",
      minute: 34,
      type: "PENALTY",
    },
    {
      scorer: "Kakaire Juma",
      team: "Africa Renewal University",
      minute: 89,
      type: "NORMAL",
      assist: "Mayinja Dirisa",
    },
  ],
  events: [],
},
  
  ]

  const repaired = []
  const removedDuplicates = []

  for (const repair of repairs) {
    const sameDateMatches = matches
      .map((match, index) => ({ match, index }))
      .filter(({ match }) => {
        if (match.date !== repair.date) return false

        const teams = [
          canonical(match.homeTeam),
          canonical(match.awayTeam),
        ].sort()

        const targetTeams = [
          canonical(repair.homeTeam),
          canonical(repair.awayTeam),
        ].sort()

        return (
          teams[0] === targetTeams[0] &&
          teams[1] === targetTeams[1]
        )
      })

    if (sameDateMatches.length === 0) {
      continue
    }

    // Prefer the record that already has an official UFL source.
    sameDateMatches.sort((a, b) => {
      const aOfficial = a.match.sourceType === "OFFICIAL_UFL" ? 1 : 0
      const bOfficial = b.match.sourceType === "OFFICIAL_UFL" ? 1 : 0
      return bOfficial - aOfficial
    })

    const keeper = sameDateMatches[0]
    const original = keeper.match

    const goals = repair.goals.map((goal, index) => ({
      id: `repair-${repair.date}-${index}`,
      ...goal,
    }))

    const updated = {
      ...original,
      homeTeam: repair.homeTeam,
      awayTeam: repair.awayTeam,
      homeScore: repair.homeScore,
      awayScore: repair.awayScore,
      status: "FINISHED",
      minute: 90,
      date: repair.date,
      competition: "Pepsi University Football League",
      goals,
      cards: repair.cards || original.cards || [],
      events: repair.events,
      officialSource: original.officialSource || repair.source,
      reportSource: repair.source,
    }

    matches[keeper.index] = updated
    repaired.push(updated)

    // Remove duplicate records for this same fixture and date.
    const duplicateIndexes = sameDateMatches
      .slice(1)
      .map(({ index }) => index)
      .sort((a, b) => b - a)

    for (const index of duplicateIndexes) {
      removedDuplicates.push(matches[index].id)
      matches.splice(index, 1)
    }
  }

  if (repaired.length > 0 || removedDuplicates.length > 0) {
    saveMatches()
  }

  res.json({
    message: "Pepsi UFL match repair completed.",
    repairedCount: repaired.length,
    removedDuplicatesCount: removedDuplicates.length,
    repaired: repaired.map((match) => ({
      id: match.id,
      date: match.date,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      score: `${match.homeScore}-${match.awayScore}`,
      goalsSaved: match.goals.length,
    })),
    removedDuplicates,
    note:
      "Some reports do not give an exact goal minute. Those events remain in the events list rather than being assigned an invented minute.",
  })
})

app.post("/api/import-ufl-result",requireAdmin, (req, res) => {
  const {
    matchId,
    homeTeam,
    awayTeam,
    homeScore,
    awayScore,
    sourcePost,
  } = req.body

  if (
    !matchId ||
    !homeTeam?.trim() ||
    !awayTeam?.trim() ||
    !Number.isInteger(homeScore) ||
    !Number.isInteger(awayScore) ||
    homeScore < 0 ||
    awayScore < 0 ||
    !sourcePost?.startsWith("https://x.com/uflug/status/")
  ) {
    return res.status(400).json({
      message: "Invalid result or official source post.",
    })
  }

  const matchIndex = matches.findIndex(
    (match) => String(match.id) === String(matchId)
  )

  if (matchIndex === -1) {
    return res.status(404).json({
      message: "Existing fixture not found.",
    })
  }

  const currentMatch = matches[matchIndex]

  const normalize = (team) =>
    team.trim().toLowerCase()

  if (
    normalize(currentMatch.homeTeam) !== normalize(homeTeam) ||
    normalize(currentMatch.awayTeam) !== normalize(awayTeam)
  ) {
    return res.status(409).json({
      message: "The official result teams do not match this fixture.",
    })
  }

  if (currentMatch.status === "FINISHED") {
    return res.status(409).json({
      message: "This fixture is already finished. Review it manually before changing its result.",
    })
  }

  const updatedMatch = {
    ...currentMatch,
    homeScore,
    awayScore,
    status: "FINISHED",
    officialSource: sourcePost,
  }

  matches[matchIndex] = updatedMatch
  saveMatches()

  return res.json({
    message: "Official result imported successfully.",
    match: updatedMatch,
  })
})

app.get("/api/match", (req, res) => {
  res.json(matches)
})

app.get("/api/matches", (req, res) => {
  const liveMatches = matches.map((match) => {
  if (
    match.status !== "LIVE" ||
    !match.clockStartedAt ||
    match.clockPausedAt
  ) {
    return match
  }

  const elapsedMinutes = Math.floor(
    (Date.now() - new Date(match.clockStartedAt).getTime()) / 60000
  )

  const calculatedMinute =
  (match.clockBaseMinute || 0) + Math.max(0, elapsedMinutes)

const clockLimit = match.clockLimitMinute || 100

return {
  ...match,
  minute: Math.min(calculatedMinute, clockLimit),
}
})

res.json(liveMatches)
})

app.get("/api/ufl-team-pairings", (req, res) => {
  try {
    const data = JSON.parse(
      fs.readFileSync(UFL_TEAM_FIXTURES_FILE, "utf8")
    )

    res.json(data)
  } catch (error) {
    console.error("Unable to load UFL team pairings:", error)

    res.status(500).json({
      message: "Unable to load UFL team pairings."
    })
  }
})

app.get("/api/team-aliases", (req, res) => {
  res.json(sharedTeamAliases)
})

app.delete("/api/matches/:id",requireAdmin, (req, res) => {
  const matchIndex = matches.findIndex(
    (match) => match.id === req.params.id
  )

  if (matchIndex === -1) {
    return res.status(404).json({
      message: "Match not found.",
    })
  }

  matches.splice(matchIndex, 1)
  saveMatches()

  res.json({
    message: "Match deleted successfully.",
    matches,
  })
})


app.post("/api/match",requireAdmin, (req, res) => {
  const incomingMatch = req.body

    if (
  !Number.isInteger(updatedMatch.minute) ||
  updatedMatch.minute < 0 ||
  updatedMatch.minute > 130
) {
  return res.status(400).json({
    message: "Match minute must be a whole number between 0 and 130.",
  })
}

  matches[0] = {
    ...matches[0],
    ...incomingMatch,
  }

  saveMatches()

  res.json({
    message: "Match updated successfully",
    matches,
  })
})

app.post("/api/matches",requireAdmin, (req, res) => {
  const incomingMatch = req.body

  if (
    !incomingMatch.homeTeam?.trim() ||
    !incomingMatch.awayTeam?.trim()
  ) {
    return res.status(400).json({
      message: "Both team names are required.",
    })
  }

  const newMatch = {
id: `match-${Date.now()}`,
homeTeam: incomingMatch.homeTeam.trim(),
awayTeam: incomingMatch.awayTeam.trim(),
homeScore: 0,
awayScore: 0,
status: "NOT STARTED",
minute: 0,
date: incomingMatch.date || "",
kickoffTime: incomingMatch.kickoffTime || "",
events: [],
goals: [],
cards: [],
}


  matches.push(newMatch)
  saveMatches()

  res.status(201).json({
    message: "Match created successfully",
    match: newMatch,
    matches,
  })
})

app.put("/api/matches/:id", requireAdmin, async (req, res) => {
  const matchId = req.params.id
  const incomingMatch = req.body

  const matchIndex = matches.findIndex(
    (match) => match.id === matchId
  )

  if (matchIndex === -1) {
    return res.status(404).json({
      message: "Match not found.",
    })
  }

  const currentMatch = matches[matchIndex]

  if (
    incomingMatch.homeTeam !== undefined &&
    (typeof incomingMatch.homeTeam !== "string" ||
      !incomingMatch.homeTeam.trim())
  ) {
    return res.status(400).json({
      message: "Home team name cannot be empty.",
    })
  }

  if (
    incomingMatch.awayTeam !== undefined &&
    (typeof incomingMatch.awayTeam !== "string" ||
      !incomingMatch.awayTeam.trim())
  ) {
    return res.status(400).json({
      message: "Away team name cannot be empty.",
    })
  }

  const updatedMatch = {
    ...currentMatch,
    ...incomingMatch,
    id: currentMatch.id,

        goals: incomingMatch.goals ?? currentMatch.goals ?? [],
    cards: incomingMatch.cards ?? currentMatch.cards ?? [],

    homeTeam:
      incomingMatch.homeTeam?.trim() ?? currentMatch.homeTeam,
    awayTeam:
      incomingMatch.awayTeam?.trim() ?? currentMatch.awayTeam,
    date:
      incomingMatch.date || currentMatch.date,
    kickoffTime:
      incomingMatch.kickoffTime || currentMatch.kickoffTime,
  }

  if (
    !Number.isInteger(updatedMatch.homeScore) ||
    updatedMatch.homeScore < 0 ||
    !Number.isInteger(updatedMatch.awayScore) ||
    updatedMatch.awayScore < 0
  ) {
    return res.status(400).json({
      message: "Scores must be non-negative whole numbers.",
    })
  }

  if (
    !Number.isInteger(updatedMatch.minute) ||
    updatedMatch.minute < 0
  ) {
    return res.status(400).json({
      message: "Match minute must be a non-negative whole number.",
    })
  }

  const allowedStatuses = [
    "NOT STARTED",
    "LIVE",
    "HALF TIME",
    "FINISHED",
  ]

  if (!allowedStatuses.includes(updatedMatch.status)) {
    return res.status(400).json({
      message: "Invalid match status.",
    })
  }

  if (
  !Array.isArray(updatedMatch.events) ||
  !updatedMatch.events.every(
    (event) => typeof event === "string"
  )
) {
  return res.status(400).json({
    message: "Match events must be a list of text entries.",
  })
}

  if (
    !Array.isArray(updatedMatch.goals) ||
    !Array.isArray(updatedMatch.cards)
  ) {
    return res.status(400).json({
      message: "Goals and cards must be lists.",
    })
  }

  const validGoalTypes = [
    "NORMAL",
    "PENALTY",
    "OWN_GOAL",
    "DIRECT_FREE_KICK",
  ]

  const validCardTypes = ["YELLOW", "RED"]

  const invalidGoal = updatedMatch.goals.some((goal) =>
    !goal ||
    typeof goal.id !== "string" ||
    !goal.id.trim() ||
    (
  goal.team !== null &&
  goal.team !== undefined &&
  (
    typeof goal.team !== "string" ||
    !goal.team.trim()
  )
) ||
    typeof goal.scorer !== "string" ||
    !goal.scorer.trim() ||
    (goal.assist !== undefined &&
      typeof goal.assist !== "string") ||
    (
  goal.minute !== null &&
  goal.minute !== undefined &&
  (
    !Number.isInteger(goal.minute) ||
    goal.minute < 0 ||
    goal.minute > 130
  )
) ||
    !validGoalTypes.includes(goal.type)
  )

  if (invalidGoal) {
    return res.status(400).json({
      message: "Each goal must have a valid ID, team, scorer, minute and goal type.",
    })
  }

  const invalidCard = updatedMatch.cards.some((card) =>
    !card ||
    typeof card.id !== "string" ||
    !card.id.trim() ||
    (
  card.team !== null &&
  card.team !== undefined &&
  (
    typeof card.team !== "string" ||
    !card.team.trim()
  )
) ||
    typeof card.player !== "string" ||
    !card.player.trim() ||
    (
  card.minute !== null &&
  card.minute !== undefined &&
  (
    !Number.isInteger(card.minute) ||
    card.minute < 0 ||
    card.minute > 130
  )
) ||
    !validCardTypes.includes(card.type)
  )

  if (invalidCard) {
    return res.status(400).json({
      message: "Each card must have a valid ID, team, player, minute and card type.",
    })
  }

  const allowedTeams = [
    updatedMatch.homeTeam,
    updatedMatch.awayTeam,
  ]

  const goalFromWrongTeam = updatedMatch.goals.some(
  (goal) => goal.team != null && !allowedTeams.includes(goal.team)
)

  if (goalFromWrongTeam) {
    return res.status(400).json({
      message: "A goal must belong to the home or away team.",
    })
  }

  const cardFromWrongTeam = updatedMatch.cards.some(
  (card) => card.team != null && !allowedTeams.includes(card.team)
)

  if (cardFromWrongTeam) {
    return res.status(400).json({
      message: "A card must belong to the home or away team.",
    })
  }

  matches[matchIndex] = updatedMatch

await saveMatches()

res.json({
    message: "Match updated successfully.",
    match: updatedMatch,
  })
})


async function loadMatches() {
  const { data, error } = await supabase
    .from("matches")
    .select("id, record")

  if (error) {
    throw new Error(
      `Unable to load matches from Supabase: ${error.message}`
    )
  }

  console.log(`Loaded ${data.length} matches from Supabase.`)

  return data.map((row) => row.record)
}

let matches = await loadMatches()

let matchesSaveQueue = Promise.resolve()

function saveMatches() {
  const snapshot = structuredClone(matches)

  const saveOperation = matchesSaveQueue
    .catch(() => {
      // Allow a new save attempt even if the previous one failed.
    })
    .then(async () => {
      const rows = snapshot.map((match) => ({
        id: String(match.id),
        home_team: match.homeTeam || "",
        away_team: match.awayTeam || "",
        match_date: match.date || null,
        status: match.status || "",
        record: match,
      }))

      const { data: existingRows, error: readError } =
        await supabase
          .from("matches")
          .select("id")

      if (readError) throw readError

      const currentIds = new Set(rows.map((row) => row.id))

      const staleIds = existingRows
        .map((row) => row.id)
        .filter((id) => !currentIds.has(id))

      if (staleIds.length > 0) {
        const { error: deleteError } = await supabase
          .from("matches")
          .delete()
          .in("id", staleIds)

        if (deleteError) throw deleteError
      }

      if (rows.length > 0) {
        const { error: saveError } = await supabase
          .from("matches")
          .upsert(rows, { onConflict: "id" })

        if (saveError) throw saveError
      }

      console.log(`Saved ${rows.length} matches to Supabase.`)
    })

  matchesSaveQueue = saveOperation.catch((error) => {
    console.error("Supabase matches save failed:", error)
  })

  return saveOperation
}


const newsSources = [
  {
    name: "Kawowo Sports",
    feedUrl: "https://kawowo.com/feed/feed",
    category: "general",
  },
  {
    name: "Sports256media",
    feedUrl: "https://sports256.com/feed/",
    category: "general",
  },
  {
    name: "FUFA / Uganda Cranes",
    feedUrl: "https://fufa.co.ug/feed/",
    category: "general",
  },
  {
    name: "Nim Media UFL",
    feedUrl: "https://nimmedia256.com/category/sport/football/university-league/feed/",
    category: "ufl",
  },
  {
    name: "Voice of Bugerere",
    feedUrl: "https://voiceofbugerere.com/feed/",
    category: "ufl",
  },
]

app.get("/api/news", async (req, res) => {
  try {
    const results = await Promise.allSettled(
      newsSources.map(async (source) => {
        const feed = await parser.parseURL(source.feedUrl)

return feed.items.map((item) => {
  const title = item.title || "Untitled"
  const description = item.contentSnippet || ""
  const text = `${title} ${description}`.toLowerCase()

const uflKeywords = [
  "pepsi university football league",
  "university football league",
  "university football",
  "ufl",
  "bugema university",
  "kumi university",
  "muteesa i royal university",
  "uganda christian university",
  "makerere university",
  "kyambogo university",
  "islamic university in uganda",
  "mbarara university of science and technology",
  "bishop stuart university",
  "st lawrence university",
  "victoria university",
  "team university",
  "kabale university",
  "busitema university",
  "gulu university",
  "lira university",
]

  const category = uflKeywords.some((keyword) =>
    text.includes(keyword)
  )
    ? "ufl"
    : "general"

return {
  title,
  link: item.link || "",
  summary: item.contentSnippet || item.content || "Open the original report to read the full story.",
  publishedAt: item.isoDate || item.pubDate || "",
  source: source.name,
  category,
}

})

      })
    )

const articles = results.flatMap((result, index) => {
  if (result.status === "fulfilled") {
    console.log(
      `${newsSources[index].name}: Retrieved ${result.value.length} articles`
    )

    return result.value
  }

  console.error(
    `${newsSources[index].name} failed:`,
    result.reason?.message || result.reason
  )

  return []
})

const uniqueArticles = Array.from(
  new Map(
    articles.map((article) => [
      (article.link || article.title).trim().toLowerCase(),
      article,
    ])
  ).values()
)

    if (articles.length === 0) {
      return res.status(502).json({
        message: "News feeds are currently unavailable.",
        articles: [],
      })
    }

res.json({
  message: "News retrieved successfully.",
  totalArticles: uniqueArticles.length,
  uflArticles: uniqueArticles.filter(
    (article) => article.category === "ufl"
  ).length,
  generalArticles: uniqueArticles.filter(
    (article) => article.category === "general"
  ).length,
  articles: uniqueArticles,
})
  } catch (error) {
    console.error("News retrieval error:", error)

    res.status(500).json({
      message: "The server could not retrieve news.",
      articles: [],
    })
  }
})

app.get("/api/ufl-fixtures", (req, res) => {
  try {
    const fixtures = readFixtures()

    const now = Date.now()

    const upcomingFixtures = fixtures.filter((fixture) => {
      const date = String(fixture.date || "").slice(0, 10)
      const time = String(fixture.kickoffTime || "").trim()

      // Keep fixtures without a reliable scheduled time visible.
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !/^\d{2}:\d{2}$/.test(time)
      ) {
        return true
      }

      // Uganda uses East Africa Time (UTC+3).
      const kickoff = new Date(
        `${date}T${time}:00+03:00`
      ).getTime()

      // Hide the fixture once its scheduled kickoff time arrives.
      return !Number.isFinite(kickoff) || now < kickoff
    })

    res.json(upcomingFixtures)

  } catch (error) {
    console.error("Error reading UFL fixtures:", error)

    res.status(500).json({
      error: "Unable to load UFL fixtures"
    })
  }
})

app.get("/api/ufl-fixture-updates", requireAdmin, async (req, res) => {
  try {
    const feed = await parser.parseURL(source.feedUrl)

    const updates = feed.items.slice(0, 20).map((item) => ({
      title: item.title || "",
      content: item.contentSnippet || item.content || "",
      publishedAt: item.isoDate || item.pubDate || "",
      link: item.link || "",
      imageUrl:
  item.enclosure?.url ||
  item.mediaContent?.$.url ||
  item.mediaThumbnail?.$.url ||
  "",

imageMetadata: {
  enclosure: item.enclosure,
  mediaContent: item.mediaContent,
  mediaThumbnail: item.mediaThumbnail,
  image: item.image
},

debugKeys: Object.keys(item),

      source: "OFFICIAL UFL",
      sourceStatus: "OFFICIAL"
    }))

    res.json(updates)
  } catch (error) {
    console.error("UFL fixture feed error:", error)
    res.status(500).json({
      error: "Unable to retrieve official UFL updates"
    })
  }
})

app.get("/api/ufl-fixture-ocr", requireAdmin, async (req, res) => {
  try {
    const feed = await fetchUFLFeed()

    const matchDayPost = feed.items.find((item) =>
      /MATCH DAY/i.test(item.title || "")
    )

    if (!matchDayPost) {
      return res.status(404).json({
        error: "No MATCH DAY post was found."
      })
    }

    const statusId = matchDayPost.link.match(/status\/(\d+)/)?.[1]

    if (!statusId) {
      throw new Error("Unable to identify the UFL post.")
    }

    const poster = await readUFLMatchDayPoster(statusId)

    res.json({
      postTitle: matchDayPost.title,
      postDate: matchDayPost.isoDate || matchDayPost.pubDate || "",
      postLink: matchDayPost.link || "",
      imageUrl: poster.imageUrl,

      extractedText: poster.extractedText,
      confidence: poster.confidence,

      leftTeamOCR: poster.leftTeamOCR,
      rightTeamOCR: poster.rightTeamOCR,

     extractedFixture: extractUFLFixtureDetails(
  poster.extractedText,
  matchDayPost.isoDate || matchDayPost.pubDate,
  poster.leftTeamOCR,
  poster.rightTeamOCR
),

      allOCRResults: poster.allOCRResults
    })

  } catch (error) {
    console.error("UFL poster OCR error:", error)

    res.status(500).json({
      error: "Unable to read the UFL poster.",
      details: error.message
    })
  }
})

app.get("/api/check-new-ufl-fixture", requireAdmin, async (req, res) => {
  try {
    const newPost = await findNewUFLMatchDayPost()

    if (!newPost) {
      return res.json({
        found: false,
        message: "No new UFL MATCH DAY announcement found."
      })
    }

    res.json({
      found: true,
      message: "A new official UFL MATCH DAY announcement was found.",
      post: newPost
    })

  } catch (error) {
    console.error("UFL fixture discovery error:", error)

    res.status(500).json({
      error: "Unable to check for new UFL announcements."
    })
  }
})

// Serve the built React frontend in production.
app.use(express.static(path.join(__dirname, "../dist")))

app.get("/{*splat}", (req, res) => {
  res.sendFile(path.join(__dirname, "../dist/index.html"))
})


app.listen(PORT, () => {
  console.log(
    `VarsityScore news server running at http://localhost:${PORT}`
  )

  setTimeout(checkUFLLiveUpdatesAutomatically, 5000)

  setInterval(
    checkUFLLiveUpdatesAutomatically,
    60 * 1000
  )
})

async function checkUFLLiveUpdatesAutomatically() {
  try {
    const response = await fetch(
  `http://localhost:${PORT}/api/ufl-parsed-updates`,
  {
    headers: {
      "x-internal-task-key": INTERNAL_TASK_KEY,
    },
  }
)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const result = await response.json()

    console.log(
      `Automatic UFL live check: ${result.updates?.length || 0} posts checked, ` +
      `${result.savedResultsCount || 0} results processed, ` +
      `${result.savedLiveEventsCount || 0} live events saved.`
    )

  } catch (error) {
    console.error(
      "Automatic UFL live update failed:",
      error.message
    )
  }
}

checkUFLFixturesAutomatically()

setInterval(
  checkUFLFixturesAutomatically,
  UFL_FIXTURE_CHECK_INTERVAL
)