export const CP_START = 1000 as const;             // starting CP each matchup
export const CP_PER_VOTE = 1 as const;             // fixed; keep 1
export const MATCH_DURATION_HOURS = Number(process.env.ATOVA_MATCH_DURATION_HOURS ?? 72);
export const EVENT_CUTOFF_SECONDS = Number(process.env.ATOVA_EVENT_CUTOFF_SECONDS ?? 30);
export const VOTE_COOLDOWN_SECONDS = Number(process.env.ATOVA_VOTE_COOLDOWN_SECONDS ?? 30);
export const TIE_BREAK_METHOD = 'RANDOM' as const; // do not change
