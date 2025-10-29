// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Match = any;
type Bracket = { quarterfinals: Match[]; semifinals: Match[]; finals: Match[] };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function side(match: any, s: "A" | "B") {
  const cands = [
    match?.[`vc${s}`],
    match?.[`vc_${s.toLowerCase()}`],
    match?.[`team${s}`],
    match?.[`team_${s.toLowerCase()}`],
    match?.[s.toLowerCase()],
  ];
  const t = cands.find(Boolean) ?? {};
  return {
    name: t?.name ?? "—",
    score: t?.currentCp ?? t?.score ?? 0,
  };
}

export default function TournamentBracket({ data }: { data: Bracket }) {
  const qf = data?.quarterfinals ?? [];
  const sf = data?.semifinals ?? [];
  const f  = data?.finals ?? [];
  const empty = !qf.length && !sf.length && !f.length;

  if (empty) {
    return (
      <div className="mt-8">
        <h2 className="text-center text-lg font-bold">Tournament Bracket</h2>
        <p className="text-center text-sm text-gray-500 mt-2">
          No tournament data available
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <h2 className="text-center text-lg font-bold">Tournament Bracket</h2>
      
      <div className="mt-4 space-y-4">
        {/* Quarterfinals */}
        <div>
          <h3 className="font-semibold mb-2">Quarterfinals</h3>
          <div className="space-y-1">
            {qf.map((match, i) => {
              const a = side(match, "A");
              const b = side(match, "B");
              return (
                <div key={match?.id ?? `qf-${i}`} className="text-sm">
                  {a.name} ({a.score}) vs {b.name} ({b.score})
                </div>
              );
            })}
          </div>
        </div>

        {/* Semifinals */}
        <div>
          <h3 className="font-semibold mb-2">Semifinals</h3>
          <div className="space-y-1">
            {sf.map((match, i) => {
              const a = side(match, "A");
              const b = side(match, "B");
              return (
                <div key={match?.id ?? `sf-${i}`} className="text-sm">
                  {a.name} ({a.score}) vs {b.name} ({b.score})
                </div>
              );
            })}
          </div>
        </div>

        {/* Finals */}
        <div>
          <h3 className="font-semibold mb-2">Finals</h3>
          <div className="space-y-1">
            {f.map((match, i) => {
              const a = side(match, "A");
              const b = side(match, "B");
              return (
                <div key={match?.id ?? `f-${i}`} className="text-sm">
                  {a.name} ({a.score}) vs {b.name} ({b.score})
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
