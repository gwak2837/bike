import { beforeAll, describe, expect, setSystemTime, spyOn, test } from 'bun:test'

import type { POSTAuthBBatonResponse200 } from '../bbaton/post'
import type { DELETEAuthLogoutResponse200 } from '../logout/delete'
import type { POSTAuthAccessTokenResponse200 } from './post'

import { app } from '../../..'
import { validBBatonTokenResponse, validBBatonUserResponse } from '../../../../test/mock'
import { sql } from '../../../../test/postgres'
import { UserSuspendedType } from '../../../model/User'
import { TokenType, signJWT } from '../../../util/jwt'

describe('POST /auth/access-token', async () => {
  const invalidUserId = '0'
  let newUserId = ''
  let accessToken = ''
  let refreshToken = ''

  beforeAll(async () => {
    await sql`DELETE FROM "OAuth"`
    await sql`DELETE FROM "User"`

    setSystemTime(new Date('2024-01-01T00:00:00.000Z'))
  })

  test('422: 요청 헤더에 `Authorization`가 없는 경우', async () => {
    const response = await app.handle(
      new Request('http://localhost/auth/access-token', { method: 'POST' }),
    )

    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({
      summary: "Property 'authorization' is missing",
    })
  })

  test('401: 요청 헤더 `Authorization`이 빈 문자열인 경우', async () => {
    const response = await app.handle(
      new Request('http://localhost/auth/access-token', {
        method: 'POST',
        headers: { Authorization: '' },
      }),
    )

    expect(response.status).toBe(401)
    expect(await response.text()).toBe('Unauthorized')
  })

  test('401: 토큰 서명이 유효하지 않은 경우', async () => {
    const invalidRefreshToken = await signJWT({ sub: invalidUserId }, TokenType.ACCESS)

    const response = await app.handle(
      new Request('http://localhost/auth/access-token', {
        method: 'POST',
        headers: { Authorization: `Bearer ${invalidRefreshToken}` },
      }),
    )

    expect(response.status).toBe(401)
    expect(await response.text()).toBe('Unauthorized')
  })

  test('422: 토큰 payload에 `sub`가 없는 경우', async () => {
    const invalidRefreshToken = await signJWT({}, TokenType.REFRESH)

    const response = await app.handle(
      new Request('http://localhost/auth/access-token', {
        method: 'POST',
        headers: { Authorization: `Bearer ${invalidRefreshToken}` },
      }),
    )

    expect(response.status).toBe(422)
    expect(await response.text()).toBe('Unprocessable Content')
  })

  test('422: 토큰 payload의 `sub` 형식이 유효하지 않은 경우', async () => {
    const invalidRefreshToken = await signJWT({ sub: 'invalid format' }, TokenType.REFRESH)

    const response = await app.handle(
      new Request('http://localhost/auth/access-token', {
        method: 'POST',
        headers: { Authorization: `Bearer ${invalidRefreshToken}` },
      }),
    )

    expect(response.status).toBe(422)
    expect(await response.text()).toBe('Unprocessable Content')
  })

  test('회원가입 후 하루 뒤 토큰을 갱신하는 경우', async () => {
    // 회원가입
    spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(validBBatonTokenResponse)),
    )

    spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(validBBatonUserResponse)),
    )

    const register = (await app
      .handle(new Request('http://localhost/auth/bbaton?code=123', { method: 'POST' }))
      .then((response) => response.json())) as POSTAuthBBatonResponse200

    expect(register).toHaveProperty('accessToken')
    expect(register).toHaveProperty('refreshToken')
    expect(typeof register.accessToken).toBe('string')
    expect(typeof register.refreshToken).toBe('string')

    newUserId = JSON.parse(atob(register.accessToken.split('.')[1])).sub
    accessToken = register.accessToken
    refreshToken = register.refreshToken

    // 하루 뒤
    setSystemTime(new Date('2024-01-02T00:00:00.000Z'))

    // 토큰 갱신
    const refreshing = (await app
      .handle(
        new Request('http://localhost/auth/access-token', {
          method: 'POST',
          headers: { Authorization: `Bearer ${register.refreshToken}` },
        }),
      )
      .then((response) => response.json())) as POSTAuthAccessTokenResponse200

    const userId = JSON.parse(atob(refreshing.accessToken.split('.')[1])).sub

    expect(refreshing).toHaveProperty('accessToken')
    expect(typeof refreshing.accessToken).toBe('string')
    expect(refreshing.accessToken).not.toBe(register.accessToken)
    expect(userId).toBe(newUserId)

    // 복원
    setSystemTime(new Date('2024-01-01T00:00:00.000Z'))
  })

  test('401: refresh 토큰 유효기간이 만료된 경우', async () => {
    // 31일 후
    setSystemTime(new Date('2024-01-31T00:00:00.000Z'))

    const response = await app.handle(
      new Request('http://localhost/auth/access-token', {
        method: 'POST',
        headers: { Authorization: `Bearer ${refreshToken}` },
      }),
    )

    expect(response.status).toBe(401)
    expect(await response.text()).toBe('Unauthorized')

    // 복원
    setSystemTime(new Date('2024-01-01T00:00:00.000Z'))
  })

  test('403: 로그아웃한 사용자가 로그아웃 전 refresh 토큰으로 갱신을 요청한 경우', async () => {
    const result = (await app
      .handle(
        new Request('http://localhost/auth/logout', {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      )
      .then((response) => response.json())) as DELETEAuthLogoutResponse200

    expect(result.id).toBe(newUserId)
    expect(new Date(result.logoutAt).getTime()).not.toBeNaN()

    const response = await app.handle(
      new Request('http://localhost/auth/access-token', {
        method: 'POST',
        headers: { Authorization: `Bearer ${refreshToken}` },
      }),
    )

    expect(response.status).toBe(403)
    expect(await response.text()).toBe('Forbidden')

    accessToken = ''
    refreshToken = ''
  })

  test('403: 정지된 사용자가 로그인한 경우', async () => {
    // 로그인
    spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(validBBatonTokenResponse)),
    )

    spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(validBBatonUserResponse)),
    )

    const loginResult = (await app
      .handle(new Request('http://localhost/auth/bbaton?code=123', { method: 'POST' }))
      .then((response) => response.json())) as POSTAuthBBatonResponse200

    expect(loginResult).toHaveProperty('accessToken')
    expect(loginResult).toHaveProperty('refreshToken')
    expect(typeof loginResult.accessToken).toBe('string')
    expect(typeof loginResult.refreshToken).toBe('string')

    // 사용자 정지
    const [result] = await sql`
      UPDATE "User"
      SET "updatedAt" = CURRENT_TIMESTAMP,
        "suspendedType" = ${UserSuspendedType.BLOCK},
        "suspendedReason" = '계정 정지 테스트',
        "unsuspendAt" = '2025-01-01T00:00:00.000Z'
      WHERE id = ${newUserId}
      RETURNING id, "updatedAt"`

    expect(result.id).toBe(newUserId)
    expect(new Date(result.updatedAt).getTime()).not.toBeNaN()

    // 토큰 갱신
    const response = await app.handle(
      new Request('http://localhost/auth/access-token', {
        method: 'POST',
        headers: { Authorization: `Bearer ${loginResult.refreshToken}` },
      }),
    )

    expect(response.status).toBe(403)
    expect(await response.text()).toBe('Forbidden')
  })

  test('정지 기간이 지난 후 사용자가 로그인한 경우', async () => {
    // 정지일(2024-01-01)로부터 2년 후
    setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(validBBatonTokenResponse)),
    )

    spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(validBBatonUserResponse)),
    )

    const result = (await app
      .handle(new Request('http://localhost/auth/bbaton?code=123', { method: 'POST' }))
      .then((response) => response.json())) as POSTAuthBBatonResponse200

    expect(result).toHaveProperty('accessToken')
    expect(result).toHaveProperty('refreshToken')
    expect(typeof result.accessToken).toBe('string')
    expect(typeof result.refreshToken).toBe('string')

    const result2 = (await app
      .handle(
        new Request('http://localhost/auth/access-token', {
          method: 'POST',
          headers: { Authorization: `Bearer ${result.refreshToken}` },
        }),
      )
      .then((response) => response.json())) as POSTAuthAccessTokenResponse200

    expect(result2).toHaveProperty('accessToken')
    expect(typeof result2.accessToken).toBe('string')
  })
})
