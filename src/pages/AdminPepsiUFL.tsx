import { useEffect, useState } from "react"
import type { FormEvent } from "react"
import PepsiUFL from "./PepsiUFL"
import "./AdminPepsiUFL.css"

const API = ""

function AdminPepsiUFL() {
  const [checking, setChecking] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // Check whether an administrator session already exists.
  useEffect(() => {
    let active = true

    async function checkSession() {
      try {
        const response = await fetch(`${API}/api/admin/session`, {
          credentials: "include",
        })

        if (!response.ok) {
          throw new Error("Unable to verify administrator session.")
        }

        const data = await response.json()

        if (active) {
          setAuthenticated(data.authenticated === true)
        }
      } catch {
        if (active) {
          setError("Unable to connect to the VarsityScore server.")
        }
      } finally {
        if (active) {
          setChecking(false)
        }
      }
    }

    checkSession()

    return () => {
      active = false
    }
  }, [])

  // Verify the administrator password.
  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setError("")
    setSubmitting(true)

    try {
      const response = await fetch(`${API}/api/admin/login`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || "Login failed.")
      }

      setAuthenticated(true)
      setPassword("")
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to log in."
      )
    } finally {
      setSubmitting(false)
    }
  }

  // End the administrator session.
  async function handleLogout() {
    try {
      await fetch(`${API}/api/admin/logout`, {
        method: "POST",
        credentials: "include",
      })
    } catch {
      setError("Could not contact the server to log out.")
    }

    setAuthenticated(false)
    setPassword("")
  }

  if (checking) {
    return (
      <div className="admin-auth-page">
        <div className="admin-auth-card">
          Checking administrator access...
        </div>
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="admin-auth-page">
        <div className="admin-auth-card">

          <div className="admin-auth-brand">
            <span className="admin-auth-icon">V</span>
            VARSITY<span>SCORE</span>
          </div>

          <p className="admin-auth-label">
            PRIVATE ADMINISTRATION
          </p>

          <h1>Pepsi UFL</h1>

          <p className="admin-auth-description">
            This area is restricted to the VarsityScore administrator.
          </p>

          <form onSubmit={handleLogin}>
            <label htmlFor="admin-password">
              Administrator password
            </label>

            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              required
            />

            {error && (
              <p className="admin-auth-error">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || !password}
            >
              {submitting ? "Verifying..." : "Access Admin Dashboard"}
            </button>
          </form>

          <p className="admin-auth-footer">
            PRIVATE ACCESS · VARSITYSCORE UGANDA
          </p>

        </div>
      </div>
    )
  }

  return (
    <div className="admin-ufl-page">
      <div className="admin-ufl-toolbar">
        <div>
          <span className="admin-online-dot"></span>
          PRIVATE ADMIN SESSION
        </div>

        <button onClick={handleLogout}>
          Log Out
        </button>
      </div>

      <PepsiUFL />
    </div>
  )
}

export default AdminPepsiUFL