
export interface ExternalNewsArticle {
  title: string
  summary: string
  link: string
  publishedAt: string
  source: string
  category: "ufl" | "general"
}

interface NewsApiResponse {
  message: string
  articles: ExternalNewsArticle[]
}

export async function fetchNewsFeed(): Promise<ExternalNewsArticle[]> {
  const response = await fetch("http://localhost:3001/api/news")

  if (!response.ok) {
    throw new Error("Could not retrieve news from the server.")
  }

  const data: NewsApiResponse = await response.json()

  return data.articles
}