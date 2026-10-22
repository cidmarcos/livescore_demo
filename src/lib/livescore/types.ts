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

export type BookPrice = {
  name: string;
  home: number;
  draw: number;
  away: number;
};

export type ScoreChance = {
  score: string;
  probability: number;
};

export type ChanceLine = {
  key: string;
  label: string;
  value: number;
};

export type ChanceGroup = {
  title: string;
  lines: ChanceLine[];
};

export type FactLine = {
  key: string;
  label: string;
  value: number;
};

export type FactGroup = {
  title: string;
  lines: FactLine[];
};

export type StatGroup = {
  title: string;
  stats: StatLine[];
};

export type UpcomingPreview = {
  competition: {
    type: string | null;
    seasonProgress: number | null;
    isFriendly: boolean | null;
    isCup: boolean | null;
    predictability: string | null;
  } | null;
  venue?: string | null;
  season?: string | null;
  standings: {
    homePosition: number | null;
    awayPosition: number | null;
    homePlayed: number | null;
    awayPlayed: number | null;
  } | null;
  probability: {
    home: number;
    draw: number;
    away: number;
    btts: number | null;
    over25: number | null;
    under25: number | null;
    groups?: ChanceGroup[];
  } | null;
  books: BookPrice[];
  markets: BookmakerMarket[];
  teamStats: StatLine[];
  extraStats: StatLine[];
  statGroups?: StatGroup[];
  facts?: FactGroup[];
  correctScores: ScoreChance[];
  matchLeg: "single" | "first" | "second" | null;
  firstLeg: { home: number; away: number } | null;
  otherNames: { home: string | null; away: string | null };
};

export type LiveWindow = {
  minutes: 5 | 10 | 15 | 20;
  stats: StatLine[];
};

export type OptaRow = {
  label: string;
  home: string;
  away: string;
  homeValue: number | null;
  awayValue: number | null;
};

export type OptaGroup = {
  title: string;
  rows: OptaRow[];
};

export type LiveExtra = {
  pressure: StatLine[];
  windows: LiveWindow[];
  opta: OptaGroup[];
  books: BookPrice[];
};

export type BookmakerPrice = {
  key: string;
  opening: number | null;
  closing: number | null;
  peak: number | null;
};

export type BookmakerMarket = {
  key: string;
  outcomes: BookmakerPrice[];
};

export type BookmakerBook = {
  name: string;
  markets: BookmakerMarket[];
};

export type BookmakerOddsPayload = {
  books: BookmakerBook[];
};

export type DetailPayload = {
  phase: Phase;
  match: MatchCard;
  stats: StatLine[];
  odds: { home: number; draw: number; away: number } | null;
  preview?: UpcomingPreview;
  live?: LiveExtra;
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
