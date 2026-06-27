import type {
  MessageSchema,
  SchemaCatalogEntry,
} from "../catalog";

export type SchemaCatalogPair<
  TAction extends string = string,
  TRequestSchema extends MessageSchema = MessageSchema,
  TResponseSchema extends MessageSchema = MessageSchema,
> = readonly [TAction, TRequestSchema, TResponseSchema];

type SchemaCatalogFromPairs<TPairs extends readonly SchemaCatalogPair[]> = {
  readonly [TPair in TPairs[number] as TPair[0]]: SchemaCatalogEntry<
    TPair[1],
    TPair[2]
  >;
};

export function defineSchemaCatalog<TPairs extends readonly SchemaCatalogPair[]>(
  pairs: TPairs,
): SchemaCatalogFromPairs<TPairs> {
  const catalogEntries: Record<string, SchemaCatalogEntry> = {};

  for (const [action, request, response] of pairs) {
    catalogEntries[action] = { request, response };
  }

  return catalogEntries as SchemaCatalogFromPairs<TPairs>;
}
