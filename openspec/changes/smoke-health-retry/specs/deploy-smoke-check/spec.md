## Purpose

The post-deploy smoke check that CI runs against staging (full flow) and production (read-only). It decides whether a release is healthy enough to keep.

## ADDED Requirements

### Requirement: Health check waits for a newly deployed Worker
The smoke check SHALL retry `GET /health` until it returns HTTP 200 with a JSON body whose `status` is `"ok"`, or until 30 seconds have passed since the first attempt, whichever comes first.
- A non-200 status, a 200 whose body is not `{"status":"ok"}`, a network error, and an attempt that times out each count as not healthy yet.
- Each attempt SHALL be aborted after 5 seconds, or at the 30-second deadline if that comes sooner. The final attempt, made at the deadline, SHALL get 1 second, so the whole check ends within about 31 seconds plus normal process overhead.
- The waits between attempts SHALL be 500, 1000, 2000, 4000 ms, then 5000 ms each after that. A wait that would pass the deadline is cut short to end at the deadline, and one final attempt is made there.
- Each failed attempt SHALL log one line to stdout: `health attempt <n>: <observation>, retrying in <ms> ms`. `<observation>` is `status <code>` for an HTTP response, or `error <message>` for a network error or timeout.

#### Scenario: Health is ready on the first attempt
- **WHEN** `GET /health` returns 200 `{"status":"ok"}` on the first request
- **THEN** the health check passes after exactly one request, with no wait and no retry lines logged

#### Scenario: New workers.dev address returns 404 at first
- **WHEN** `GET /health` returns 404 on the first two requests and 200 `{"status":"ok"}` on the third
- **THEN** the health check passes after waits of 500 ms and 1000 ms, logging `health attempt 1: status 404, retrying in 500 ms` and `health attempt 2: status 404, retrying in 1000 ms`

#### Scenario: Network error while the address comes up
- **WHEN** the first `GET /health` request fails with a network error whose message is `fetch failed`, and the second returns 200 `{"status":"ok"}`
- **THEN** the health check passes, logging `health attempt 1: error fetch failed, retrying in 500 ms`

#### Scenario: 200 with the wrong body is not healthy
- **WHEN** `GET /health` returns 200 `{}` and then 200 `{"status":"ok"}`
- **THEN** the health check passes after one retry, logging `health attempt 1: status 200, retrying in 500 ms`

#### Scenario: A request that never responds is aborted
- **WHEN** the first `GET /health` request gets no response and the second returns 200 `{"status":"ok"}`
- **THEN** the first request is aborted after 5 seconds, logged as `health attempt 1: error <timeout message>, retrying in 500 ms`, and the health check passes

#### Scenario: Health never becomes ready
- **WHEN** every `GET /health` request returns 503 immediately
- **THEN** exactly 10 attempts are made, at 0, 0.5, 1.5, 3.5, 7.5, 12.5, 17.5, 22.5, 27.5 and 30 seconds. The smoke check writes a line to stderr containing the base URL, `status 503` and the last response body, then exits with code 1.

#### Scenario: Network errors throughout
- **WHEN** every `GET /health` request fails with a network error
- **THEN** after the attempt at 30 seconds the smoke check writes a line to stderr containing the base URL and the last error message, then exits with code 1

#### Scenario: Invalid base URL fails immediately
- **WHEN** the smoke check is given an empty or unparseable base URL
- **THEN** it writes an error naming the bad URL to stderr and exits with code 1 without making any request or waiting

### Requirement: Checks after health are single-shot
Once the health check has passed, the smoke check SHALL make every other request exactly once and fail at once on an unexpected response, in both full-flow and `--read-only` modes.

#### Scenario: Write-path failure is not retried
- **WHEN** health passes and `POST /groups` returns 500
- **THEN** the smoke check exits with code 1 after exactly one `POST /groups` request, and makes no request to the expense or balance endpoints

#### Scenario: Read-only mode stops after health
- **WHEN** the smoke check runs with `--read-only`, and health returns 404 once and then 200 `{"status":"ok"}`
- **THEN** it exits with code 0 after two `GET /health` requests and no other request
