/* eslint-disable @typescript-eslint/no-explicit-any */

import { POSTGRES_MAX_BIGINT } from '../plugin/postgres'

export function isValidPostgresBigInt(value: string) {
  return !isNaN(+value) && isFinite(+value) && BigInt(value) <= POSTGRES_MAX_BIGINT
}

type ReplaceNullWithUndefined<T> = {
  [K in keyof T]: T[K] extends null ? undefined : T[K]
}

export function removeNull<T extends object>(obj: T): ReplaceNullWithUndefined<T> {
  const result = {} as Record<keyof T, unknown>

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      result[key] = obj[key] === null ? undefined : obj[key]
    }
  }

  return result as ReplaceNullWithUndefined<T>
}

type NullToUndefined<T> = T extends null ? undefined : T

type RecursivelyRemoveNull<T> = T extends Date
  ? T
  : T extends object
    ? { [K in keyof T]: RecursivelyRemoveNull<NullToUndefined<T[K]>> }
    : NullToUndefined<T>

export function deeplyRemoveNull<T>(obj: T): RecursivelyRemoveNull<T> {
  if (obj === null) {
    return undefined as any
  }
  if (typeof obj !== 'object' || obj instanceof Date) {
    return obj as any
  }

  const result: any = Array.isArray(obj) ? [] : {}

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      result[key] = deeplyRemoveNull(obj[key])
    }
  }

  return result
}

export function removeUndefinedKeys<T>(obj: T) {
  for (const key in obj) {
    if (obj[key] === undefined) {
      delete obj[key]
    }
  }
  return obj
}
