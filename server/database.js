import fs from "node:fs"
import { createClient } from "@supabase/supabase-js"

// Load the root .env file before reading credentials.
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

const supabaseUrl = process.env.SUPABASE_URL
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY

if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error("Missing Supabase environment variables")
}

export const supabase = createClient(
  supabaseUrl,
  supabaseSecretKey
)