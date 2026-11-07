import { useEffect, useState } from "react"
import {
  fetchNewsFeed,
  type ExternalNewsArticle,
} from "../services/newsService"
import OfficialUFLUpdates from "../components/OfficialUFLUpdates"

function News() {
  const [externalArticles, setExternalArticles] = useState<
    ExternalNewsArticle[]
  >([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")
const [searchQuery, setSearchQuery] = useState("")

useEffect(() => {
  loadNews()
}, [])

async function loadNews() {
  setLoading(true)
  setRefreshing(true)
  setError("")

  try {
    const articles = await fetchNewsFeed()
    setExternalArticles(articles)

    if (articles.length === 0) {
      setError("No news articles are currently available.")
    }
  } catch (error) {
    console.error("News loading error:", error)
    setError("External news is temporarily unavailable. Please try again later.")
  } finally {
    setLoading(false)
    setRefreshing(false)
  }
}

const filteredArticles = externalArticles
  .filter((article) => {
    const matchesCategory =
      selectedCategory === "all" ||
      article.category === selectedCategory

    const searchText = searchQuery.toLowerCase()

const matchesSearch =
  article.title.toLowerCase().includes(searchText) ||
  article.source.toLowerCase().includes(searchText) ||
  article.summary.toLowerCase().includes(searchText)

    return matchesCategory && matchesSearch
  })
  .sort((a, b) => {
    const dateA = Date.parse(a.publishedAt) || 0
    const dateB = Date.parse(b.publishedAt) || 0

    return dateB - dateA
  })

  return (
    <div className="page-container">

      <main className="news-page">
        <section className="news-header">
          <p className="section-label">VARSITYSCORE UGANDA</p>
          <h1>UFL News</h1>
          <OfficialUFLUpdates />
          <p>
            News, updates, and stories from the Pepsi University
            Football League.
          </p>
        </section>

        <section className="news-content">
          <div className="news-heading-row">
  <h2>Latest News</h2>

  <button
    className="news-refresh-button"
    onClick={loadNews}
    disabled={refreshing}
  >
    {refreshing ? "Refreshing..." : "Refresh News"}
  </button>
</div>
          <input
  type="search"
  className="news-search"
  placeholder="Search news or reporter..."
  value={searchQuery}
  onChange={(event) => setSearchQuery(event.target.value)}
  aria-label="Search news or reporter"
/>

<div className="news-filters">
  <button
    className={selectedCategory === "all" ? "selected" : ""}
    onClick={() => setSelectedCategory("all")}
  >
    All News
  </button>

  <button
    className={selectedCategory === "ufl" ? "selected" : ""}
    onClick={() => setSelectedCategory("ufl")}
  >
    UFL News
  </button>

  <button
    className={selectedCategory === "general" ? "selected" : ""}
    onClick={() => setSelectedCategory("general")}
  >
    Other Sports News
  </button>
</div>

          {loading && <p>Checking news sources...</p>}

          {!loading && error && (
            <p role="status">{error}</p>
          )}

          <div className="news-grid">
            {filteredArticles.length > 0 ? (
  filteredArticles.map((article, index) => (
    <article
  className="news-card"
  key={`${article.link}-${index}`}
>
  <div className="news-card-content">
    <div className="news-card-meta">
      <span className="news-source">{article.source}</span>

      <span
        className={`news-category ${
          article.category === "ufl"
            ? "ufl-category"
            : "general-category"
        }`}
      >
        {article.category === "ufl" ? "UFL News" : "General Sports"}
      </span>
    </div>

    <h3>
      <a
        href={article.link}
        target="_blank"
        rel="noopener noreferrer"
      >
        {article.title}
      </a>
    </h3>

    <p className="news-date">
      {article.publishedAt
        ? new Date(article.publishedAt).toLocaleDateString("en-UG", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
        : "Publication date unavailable"}
    </p>
  </div>
</article>
  ))
) : (
  <p className="news-empty">
    No articles found in this category. Check again later.
  </p>
)}
          </div>
        </section>
      </main>
    </div>
  )
}

export default News