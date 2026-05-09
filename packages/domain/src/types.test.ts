import type { ContentType, Profile, Visibility } from "./types";

type IsExact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

type _VisibilityIsFourTier = Assert<
  IsExact<Visibility, "public" | "followers" | "mutuals" | "private">
>;

type _ContentTypeCoversAllItems = Assert<
  IsExact<
    ContentType,
    | "identity"
    | "follower_list"
    | "review"
    | "score"
    | "finished_shelf"
    | "custom_shelf"
    | "want_to_read_shelf"
    | "reading_shelf"
    | "dropped_shelf"
    | "reading_status"
    | "activity_stream"
  >
>;

type _ProfileDefaultVisibilityIsVisibility = Assert<
  IsExact<Profile["defaultVisibility"], Visibility>
>;

export type {
  _VisibilityIsFourTier,
  _ContentTypeCoversAllItems,
  _ProfileDefaultVisibilityIsVisibility,
};
