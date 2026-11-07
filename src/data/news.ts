
export interface NewsArticle {
  id: number
  title: string
  summary: string
  source: string
  publishedAt: string
  url: string
}

export const newsArticles: NewsArticle[] = [
  {
    id: 1,
    title: "The Pepsi University Football League Season Is Underway",
    summary:
      "Follow university football updates, match reports, fixtures, and results throughout the Pepsi University Football League season.",
    source: "VarsityScore Uganda",
    publishedAt: "2026-10-23",
    url: ""
  }
]
