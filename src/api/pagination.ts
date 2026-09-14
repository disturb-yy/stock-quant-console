import type {
  PaginatedResponse as GeneratedPaginatedResponse,
  PaginationMeta as GeneratedPaginationMeta,
  PaginationRequest as GeneratedPaginationRequest,
} from './generated'

export type PaginationMeta = GeneratedPaginationMeta
export type PaginatedResponse = GeneratedPaginatedResponse
export type OpenAPIPaginationRequest = GeneratedPaginationRequest

/** 业务列表可以在保留 OpenAPI wire shape 的前提下提供自己的泛型项类型。 */
export type PaginationRequest<TWire extends object = GeneratedPaginationRequest> = Readonly<TWire>

export type PaginationResponse<TWire extends object> = Readonly<TWire>

export type PaginationItem<TItem> = TItem

export interface PaginationTypes<TRequest extends object, TResponse extends object, TItem> {
  readonly request: PaginationRequest<TRequest>
  readonly response: PaginationResponse<TResponse>
  readonly item: PaginationItem<TItem>
}
