import {
  GitHubApiError,
  WRAPPED_YEAR,
  createWrappedDataFromGraphQL,
  fetchGitHubWrappedGraphQL,
  isValidGitHubUsername,
  normalizeGitHubUsername,
} from '../src/lib/github.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ message: 'Method not allowed.' })
  }

  const username = normalizeGitHubUsername(String(req.query.username || ''))
  const parsedYear = Number.parseInt(String(req.query.year || WRAPPED_YEAR), 10)
  const year = Number.isFinite(parsedYear) ? parsedYear : WRAPPED_YEAR
  const token = globalThis.process?.env?.GITHUB_TOKEN?.trim()

  if (!username || !isValidGitHubUsername(username)) {
    return res.status(422).json({ message: 'Enter a valid GitHub username.' })
  }

  if (!token) {
    return res.status(503).json({ message: 'Secure GitHub token is not configured on the server.' })
  }

  try {
    const graphqlData = await fetchGitHubWrappedGraphQL({
      username,
      token,
      year,
    })

    const wrappedData = createWrappedDataFromGraphQL({ graphqlData, year })
    return res.status(200).json(wrappedData)
  } catch (error) {
    const status = error instanceof GitHubApiError && error.status ? error.status : 500
    const message = error instanceof Error ? error.message : 'Unable to fetch secure GitHub Wrapped data.'
    return res.status(status).json({ message })
  }
}
