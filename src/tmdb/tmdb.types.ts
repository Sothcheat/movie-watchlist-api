/** A movie as this API exposes it: only the fields we use, with TMDB's quirks normalised. */
export interface Movie {
  tmdbId: number;
  title: string;
  /** null when TMDB has none (it sends ""). */
  overview: string | null;
  /** Path only, e.g. "/abc.jpg"; clients prepend TMDB's image base URL. */
  posterPath: string | null;
  /** YYYY-MM-DD; TMDB sends "" for unreleased or unknown. */
  releaseDate: string | null;
}

export interface MovieSearchPage {
  page: number;
  totalPages: number;
  totalResults: number;
  results: Movie[];
}
