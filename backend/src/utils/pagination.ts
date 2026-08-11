import { PaginatedResult } from '../types'

export function buildPagination(page: number, limit: number) {
  const safePage  = Math.max(1, page)
  const safeLimit = Math.min(100, Math.max(1, limit))
  return {
    skip: (safePage - 1) * safeLimit,
    take: safeLimit,
    page: safePage,
    limit: safeLimit,
  }
}

export function paginate<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResult<T> {
  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  }
}
