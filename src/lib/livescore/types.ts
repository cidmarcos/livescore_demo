export type Phase = "live" | "ended" | "upcoming";

export type Score = {
  home: number | null;
  away: number | null;
  htHome: number | null;
  htAway: number | null;
};

export type MatchCard = {
  fixtureId: string;
  homeName: string;
  awayName: string;
  homeImageId: string | null;
  awayImageId: string | null;
  leagueId: string | null;
  leagueName: string;
  country: string | null;
  status: string | null;
  elapsed: number | null;
  kickoff: string | null;
  kickoffMidnight: boolean;
  score: Score | null;
  idBetfair: string | null;
  phase: Phase;
};

export type StatLine = {
  key: string;
  label: string;
  home: number;
  away: number;
};

export type DetailPayload = {
  phase: Phase;
  match: MatchCard;
  stats: StatLine[];
  odds: { home: number; draw: number; away: number } | null;
};

export type TrendPoint = {
  val: string;
  time_str: string;
};

export type Trend = Record<string, { home?: TrendPoint[]; away?: TrendPoint[] }>;

export type EventsPayload = {
  events: { text: string }[];
  timeline: Trend | null;
};

export type LineupPlayer = {
  name: string;
  shirtNumber: number | null;
  position: string | null;
  imageUrl: string | null;
};

export type LineupSide = {
  name: string;
  formation: string | null;
  coach: string | null;
  lineupStatus: string | null;
  starters: LineupPlayer[];
  substitutes: LineupPlayer[];
  unconfirmed: LineupPlayer[];
  topPlayers: LineupPlayer[];
  missing: { name: string; reason: string | null }[];
};

export type LineupsPayload = {
  fixtureId: string;
  home: LineupSide | null;
  away: LineupSide | null;
};

export type StandingRow = {
  pos: number;
  teamName: string;
  teamImageId: string | null;
  played: number;
  win: number;
  draw: number;
  loss: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
};

export type StandingGroup = {
  groupName: string;
  standings: StandingRow[];
};

export type TablePayload = {
  leagueId: string;
  seasonName: string | null;
  tables: {
    overall: StandingGroup[];
    home: StandingGroup[];
    away: StandingGroup[];
  };
};

export type ListPayload = {
  bucket: Phase;
  date: string;
  matches: MatchCard[];
};

export type RadarPayload = {
  radars: { fixtureId: string; url: string }[];
};

export type LivescoreSearch = {
  data: string;
  filtro: Phase;
  aba: "todos" | "favoritos" | "competicoes";
  q: string;
  liga: string;
};
