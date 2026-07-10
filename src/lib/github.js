export const WRAPPED_YEAR = 2026

const GITHUB_API_BASE = 'https://api.github.com'
const GITHUB_GRAPHQL_ENDPOINT = 'https://api.github.com/graphql'
const SECURE_WRAPPED_ENDPOINT = '/api/github-wrapped'
const GITHUB_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
}

const WRAPPED_QUERY = `
  query GitHubWrapped($login: String!, $from: DateTime!, $to: DateTime!) {
    rateLimit {
      cost
      remaining
      resetAt
    }
    user(login: $login) {
      login
      name
      avatarUrl
      bio
      url
      createdAt
      followers {
        totalCount
      }
      following {
        totalCount
      }
      repositories(
        first: 100
        ownerAffiliations: OWNER
        orderBy: { field: PUSHED_AT, direction: DESC }
      ) {
        totalCount
        nodes {
          id
          name
          nameWithOwner
          description
          url
          createdAt
          pushedAt
          stargazerCount
          forkCount
          primaryLanguage {
            name
            color
          }
        }
      }
      contributionsCollection(from: $from, to: $to) {
        startedAt
        endedAt
        totalCommitContributions
        totalIssueContributions
        totalPullRequestContributions
        totalPullRequestReviewContributions
        totalRepositoryContributions
        restrictedContributionsCount
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
              color
              weekday
            }
          }
        }
        commitContributionsByRepository(maxRepositories: 10) {
          repository {
            id
            nameWithOwner
            description
            url
            stargazerCount
            forkCount
            primaryLanguage {
              name
              color
            }
          }
          contributions(first: 1) {
            totalCount
          }
        }
      }
    }
  }
`

export class GitHubApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'GitHubApiError'
    this.status = status
  }
}

export const normalizeGitHubUsername = (value) => value.trim().replace(/^@+/, '')

export const isValidGitHubUsername = (username) =>
  /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(username)

export const getYearRange = (year = WRAPPED_YEAR) => ({
  from: `${year}-01-01T00:00:00Z`,
  to: `${year + 1}-01-01T00:00:00Z`,
})

const getAuthHeaders = (token) =>
  token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {}

const requestGitHub = async (path, { token } = {}) => {
  const response = await fetch(`${GITHUB_API_BASE}${path}`, {
    headers: {
      ...GITHUB_HEADERS,
      ...getAuthHeaders(token),
    },
  })

  if (!response.ok) {
    let message = 'GitHub request failed.'

    try {
      const body = await response.json()
      message = body.message || message
    } catch {
      message = response.statusText || message
    }

    if (response.status === 404) {
      message = 'GitHub user not found.'
    }

    if (response.status === 401) {
      message = 'GitHub token is missing, invalid, or expired.'
    }

    if (response.status === 403) {
      message = 'GitHub API rate limit reached or token permissions are too limited.'
    }

    throw new GitHubApiError(message, response.status)
  }

  return response.json()
}

const requestGitHubGraphQL = async ({ query, variables, token }) => {
  if (!token) {
    throw new GitHubApiError('Authenticated GitHub GraphQL requests need a token.', 401)
  }

  const response = await fetch(GITHUB_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      ...GITHUB_HEADERS,
      ...getAuthHeaders(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  })

  let body

  try {
    body = await response.json()
  } catch {
    body = null
  }

  if (!response.ok || body?.errors?.length) {
    const message =
      body?.errors?.map((error) => error.message).join(' ') ||
      body?.message ||
      response.statusText ||
      'GitHub GraphQL request failed.'

    throw new GitHubApiError(message, response.status)
  }

  return body.data
}

export const fetchGitHubUser = async (username, options) =>
  requestGitHub(`/users/${encodeURIComponent(username)}`, options)

export const fetchGitHubRepos = async (username, options) =>
  requestGitHub(`/users/${encodeURIComponent(username)}/repos?per_page=100&sort=pushed`, options)

export const fetchGitHubEvents = async (username, options) =>
  requestGitHub(`/users/${encodeURIComponent(username)}/events/public?per_page=100`, options)

export const fetchGitHubWrappedGraphQL = async ({ username, token, year = WRAPPED_YEAR }) => {
  const { from, to } = getYearRange(year)

  const data = await requestGitHubGraphQL({
    query: WRAPPED_QUERY,
    variables: { login: username, from, to },
    token,
  })

  if (!data.user) {
    throw new GitHubApiError('GitHub user not found.', 404)
  }

  return data
}

export const fetchSecureWrappedData = async ({ username, year = WRAPPED_YEAR }) => {
  const response = await fetch(
    `${SECURE_WRAPPED_ENDPOINT}?username=${encodeURIComponent(username)}&year=${encodeURIComponent(year)}`,
    {
      headers: {
        Accept: 'application/json',
      },
    },
  )

  const body = await response.json().catch(() => null)

  if (!response.ok) {
    const message = body?.message || 'Secure GitHub Wrapped request failed.'
    throw new GitHubApiError(message, response.status)
  }

  return body
}

const getEventYear = (event) => new Date(event.created_at).getFullYear()

const getRepoStars = (repo) => repo.stargazers_count ?? repo.stargazerCount ?? repo.stars ?? 0

const getRepoForks = (repo) => repo.forks_count ?? repo.forkCount ?? repo.forks ?? 0

const getRepoLanguage = (repo) => repo.language ?? repo.primaryLanguage?.name ?? null

const getRepoLanguageColor = (repo) => repo.primaryLanguage?.color ?? null

const sumRepoValue = (repos, getValue) =>
  repos.reduce((total, repo) => total + (Number(getValue(repo)) || 0), 0)

const buildTopLanguages = (repos) => {
  const languageCounts = repos.reduce((counts, repo) => {
    const language = getRepoLanguage(repo)

    if (!language) return counts

    counts[language] = (counts[language] || 0) + 1
    return counts
  }, {})

  const totalLanguageRepos = Object.values(languageCounts).reduce((total, count) => total + count, 0)

  return Object.entries(languageCounts)
    .map(([name, count]) => ({
      name,
      count,
      percentage: totalLanguageRepos ? Math.round((count / totalLanguageRepos) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 5)
}

const buildTopRepositories = (repos) =>
  [...repos]
    .sort((a, b) => {
      const aScore = getRepoStars(a) * 2 + getRepoForks(a)
      const bScore = getRepoStars(b) * 2 + getRepoForks(b)
      return bScore - aScore || new Date(b.pushed_at ?? b.pushedAt) - new Date(a.pushed_at ?? a.pushedAt)
    })
    .slice(0, 3)
    .map((repo) => ({
      id: repo.id,
      name: repo.full_name ?? repo.nameWithOwner ?? repo.fullName,
      description: repo.description,
      language: getRepoLanguage(repo),
      languageColor: getRepoLanguageColor(repo),
      stars: getRepoStars(repo),
      forks: getRepoForks(repo),
      pushedAt: repo.pushed_at ?? repo.pushedAt,
      url: repo.html_url ?? repo.url,
      contributions: repo.contributions?.totalCount ?? repo.contributionCount ?? null,
    }))

const countRecentCommits = (events) =>
  events
    .filter((event) => event.type === 'PushEvent')
    .reduce((total, event) => total + (event.payload?.commits?.length || 0), 0)

const mapGraphQLRepos = (repos) =>
  repos.map((repo) => ({
    id: repo.id,
    name: repo.name,
    fullName: repo.nameWithOwner,
    description: repo.description,
    language: repo.primaryLanguage?.name ?? null,
    languageColor: repo.primaryLanguage?.color ?? null,
    stars: repo.stargazerCount || 0,
    forks: repo.forkCount || 0,
    createdAt: repo.createdAt,
    pushedAt: repo.pushedAt,
    url: repo.url,
  }))

const mapCalendarDays = (calendar) =>
  calendar?.weeks?.flatMap((week) => week.contributionDays).filter(Boolean) ?? []

export const createWrappedDataFromGraphQL = ({ graphqlData, year = WRAPPED_YEAR }) => {
  const user = graphqlData.user
  const repos = user.repositories.nodes.filter(Boolean)
  const mappedRepos = mapGraphQLRepos(repos)
  const contributions = user.contributionsCollection
  const calendarDays = mapCalendarDays(contributions.contributionCalendar)
  const activeDays = calendarDays.filter((day) => day.contributionCount > 0).length
  const topContributionRepos = contributions.commitContributionsByRepository.map((item) => ({
    ...item.repository,
    contributionCount: item.contributions.totalCount,
  }))

  return {
    year,
    fetchedAt: new Date().toISOString(),
    dataMode: 'authenticated',
    profile: {
      login: user.login,
      name: user.name,
      avatarUrl: user.avatarUrl,
      profileUrl: user.url,
      bio: user.bio,
      publicRepos: user.repositories.totalCount || 0,
      followers: user.followers.totalCount || 0,
      following: user.following.totalCount || 0,
      createdAt: user.createdAt,
    },
    repos: mappedRepos,
    events: [],
    rateLimit: graphqlData.rateLimit,
    metrics: {
      totalContributions: contributions.contributionCalendar.totalContributions || 0,
      totalCommitContributions: contributions.totalCommitContributions || 0,
      totalIssueContributions: contributions.totalIssueContributions || 0,
      totalPullRequestContributions: contributions.totalPullRequestContributions || 0,
      totalPullRequestReviewContributions: contributions.totalPullRequestReviewContributions || 0,
      totalRepositoryContributions: contributions.totalRepositoryContributions || 0,
      restrictedContributions: contributions.restrictedContributionsCount || 0,
      publicRepos: user.repositories.totalCount || mappedRepos.length,
      fetchedRepos: mappedRepos.length,
      reposCreatedThisYear: mappedRepos.filter(
        (repo) => new Date(repo.createdAt).getFullYear() === year,
      ).length,
      starsEarned: sumRepoValue(mappedRepos, (repo) => repo.stars),
      forksEarned: sumRepoValue(mappedRepos, (repo) => repo.forks),
      recentPublicEvents: null,
      yearPublicEvents: contributions.contributionCalendar.totalContributions || 0,
      recentCommits: contributions.totalCommitContributions || 0,
      activeDays,
      languagesUsed: buildTopLanguages(mappedRepos).length,
      topLanguages: buildTopLanguages(mappedRepos),
      topRepositories: buildTopRepositories(topContributionRepos.length ? topContributionRepos : mappedRepos),
      contributionCalendar: calendarDays,
    },
    coverage:
      'Authenticated GraphQL data includes full-year contribution totals and contribution calendar data.',
  }
}

export const createWrappedData = ({ profile, repos, events, year = WRAPPED_YEAR }) => {
  const yearEvents = events.filter((event) => getEventYear(event) === year)
  const activeDays = new Set(yearEvents.map((event) => event.created_at.slice(0, 10))).size
  const mappedRepos = repos.map((repo) => ({
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    description: repo.description,
    language: repo.language,
    stars: repo.stargazers_count || 0,
    forks: repo.forks_count || 0,
    openIssues: repo.open_issues_count || 0,
    createdAt: repo.created_at,
    pushedAt: repo.pushed_at,
    url: repo.html_url,
  }))

  return {
    year,
    fetchedAt: new Date().toISOString(),
    dataMode: 'public',
    profile: {
      login: profile.login,
      name: profile.name,
      avatarUrl: profile.avatar_url,
      profileUrl: profile.html_url,
      bio: profile.bio,
      publicRepos: profile.public_repos || 0,
      followers: profile.followers || 0,
      following: profile.following || 0,
      createdAt: profile.created_at,
    },
    repos: mappedRepos,
    events: yearEvents.map((event) => ({
      id: event.id,
      type: event.type,
      repo: event.repo?.name,
      createdAt: event.created_at,
    })),
    metrics: {
      totalContributions: yearEvents.length,
      totalCommitContributions: countRecentCommits(yearEvents),
      totalIssueContributions: yearEvents.filter((event) => event.type === 'IssuesEvent').length,
      totalPullRequestContributions: yearEvents.filter((event) => event.type === 'PullRequestEvent').length,
      totalPullRequestReviewContributions: 0,
      totalRepositoryContributions: mappedRepos.filter(
        (repo) => new Date(repo.createdAt).getFullYear() === year,
      ).length,
      restrictedContributions: 0,
      publicRepos: profile.public_repos || mappedRepos.length,
      fetchedRepos: mappedRepos.length,
      reposCreatedThisYear: mappedRepos.filter(
        (repo) => new Date(repo.createdAt).getFullYear() === year,
      ).length,
      starsEarned: sumRepoValue(mappedRepos, (repo) => repo.stars),
      forksEarned: sumRepoValue(mappedRepos, (repo) => repo.forks),
      recentPublicEvents: events.length,
      yearPublicEvents: yearEvents.length,
      recentCommits: countRecentCommits(yearEvents),
      activeDays,
      languagesUsed: buildTopLanguages(mappedRepos).length,
      topLanguages: buildTopLanguages(mappedRepos),
      topRepositories: buildTopRepositories(mappedRepos),
      contributionCalendar: [],
    },
    coverage:
      'Public REST data includes profile, public repos, and recent public events. Full-year Wrapped needs authenticated GraphQL.',
  }
}
