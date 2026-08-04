/**
 * Read a JSON response that might not be JSON.
 *
 * When a serverless function exceeds its time limit the platform replies with
 * an HTML error page, not our JSON envelope — so `res.json()` threw
 * `Unexpected token '<'` and the uploader showed that to the user instead of
 * saying what actually happened. Everything that talks to our own API goes
 * through here so a gateway-level failure reads like a sentence.
 */
export async function readJsonResponse<T = Record<string, unknown>>(res: Response): Promise<T> {
  const body = await res.text()

  try {
    return (body ? JSON.parse(body) : {}) as T
  } catch {
    const message =
      res.status === 504 || res.status === 408
        ? 'The server ran out of time reading that résumé. Long CVs sometimes need a second attempt.'
        : `The server returned an unexpected ${res.status} response.`

    return { error: message } as T
  }
}
