

"use client";

import { useEffect, useMemo, useState } from "react";

function getApiBase() {
  return process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";
}

function apiHeaders() {
  return {
    "Content-Type": "application/json",
    "X-User-Id": window.localStorage.getItem("user_id") || "admin@local",
  } as Record<string, string>;
}

type FeedbackEntry = {
  user_id?: string;
  projectId?: string;
  createdAt?: string;
  rating?: number;
  problem?: string;
  comment?: string;
  targetLanguage?: string;
  projectLevel?: string;
  vocabularyCount?: number;
  masteredCount?: number;
};

const problemLabels: Record<string, string> = {
  flow_unclear: "Flow unklar",
  too_hard: "Zu schwer",
  too_easy: "Zu leicht",
  wrong_vocabulary: "Vokabeln/Übersetzungen falsch",
  questions_unclear: "Fragen unklar/unpassend",
  speech_issue: "Sprache/Audio funktioniert nicht",
  other: "Sonstiges",
  unknown: "Unbekannt",
};

function labelProblem(problem?: string) {
  return problemLabels[problem || "unknown"] || problem || "Unbekannt";
}

function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function FeedbackAdminPage() {
  const [data, setData] = useState<FeedbackEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const res = await fetch(`${getApiBase()}/feedback`, {
          method: "GET",
          headers: apiHeaders(),
        });
        if (!res.ok) throw new Error("Failed to load feedback");
        const json = await res.json();
        setData(Array.isArray(json) ? json : []);
      } catch (e: any) {
        setError(e?.message || "Fehler beim Laden");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const stats = useMemo(() => {
    const count = data.length;
    const avg = count
      ? (data.reduce((s, d) => s + (d.rating || 0), 0) / count).toFixed(2)
      : "-";
    const byProblem: Record<string, number> = {};
    data.forEach((d) => {
      const key = d.problem || "unknown";
      byProblem[key] = (byProblem[key] || 0) + 1;
    });
    const problemRanking = Object.entries(byProblem).sort((a, b) => b[1] - a[1]);
    const topProblem = problemRanking[0] || null;
    return { count, avg, byProblem, problemRanking, topProblem };
  }, [data]);

  return (
    <main style={{ maxWidth: 1100, margin: "40px auto", padding: 16 }}>
      <h1 style={{ marginBottom: 16 }}>Feedback Dashboard</h1>

      {loading && <p>Lade Feedback…</p>}
      {error && <p style={{ color: "#a33a3a" }}>{error}</p>}

      {!loading && !error && (
        <>
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
              marginBottom: 24,
            }}
          >
            <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 14 }}>
              <div style={{ color: "#666", fontSize: 14 }}>Einträge</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{stats.count}</div>
            </div>
            <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 14 }}>
              <div style={{ color: "#666", fontSize: 14 }}>Ø Rating</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{stats.avg}</div>
            </div>
            <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 14 }}>
              <div style={{ color: "#666", fontSize: 14 }}>Top-Problem</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>
                {stats.topProblem ? labelProblem(stats.topProblem[0]) : "-"}
              </div>
              {stats.topProblem && (
                <div style={{ color: "#666", fontSize: 14 }}>{stats.topProblem[1]} Meldung(en)</div>
              )}
            </div>
          </section>

          <section style={{ marginBottom: 24 }}>
            <h3>Probleme nach Häufigkeit</h3>
            {stats.problemRanking.length === 0 ? (
              <p>Keine Problemdaten vorhanden.</p>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {stats.problemRanking.map(([k, v], index) => (
                  <div
                    key={k}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      border: index === 0 ? "2px solid #4f8cff" : "1px solid #eee",
                      borderRadius: 10,
                      padding: "10px 12px",
                      background: index === 0 ? "#eef4ff" : "#fff",
                    }}
                  >
                    <span>{labelProblem(k)}</span>
                    <strong>{v}</strong>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h3>Letzte Einträge</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {[
                      "Zeit",
                      "Rating",
                      "Problem",
                      "Kommentar",
                      "Sprache",
                      "Level",
                      "Vokabeln",
                      "Gelernt",
                      "User",
                    ].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: "left",
                          borderBottom: "1px solid #ddd",
                          padding: "8px 6px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data
                    .slice()
                    .reverse()
                    .map((d, i) => (
                      <tr key={i}>
                        <td style={{ padding: "8px 6px", borderBottom: "1px solid #eee" }}>
                          {formatDate(d.createdAt)}
                        </td>
                        <td style={{ padding: "8px 6px", borderBottom: "1px solid #eee" }}>
                          {d.rating ?? "-"}
                        </td>
                        <td style={{ padding: "8px 6px", borderBottom: "1px solid #eee" }}>
                          {labelProblem(d.problem)}
                        </td>
                        <td style={{ padding: "8px 6px", borderBottom: "1px solid #eee" }}>
                          {d.comment || ""}
                        </td>
                        <td style={{ padding: "8px 6px", borderBottom: "1px solid #eee" }}>
                          {d.targetLanguage || "-"}
                        </td>
                        <td style={{ padding: "8px 6px", borderBottom: "1px solid #eee" }}>
                          {d.projectLevel || "-"}
                        </td>
                        <td style={{ padding: "8px 6px", borderBottom: "1px solid #eee" }}>
                          {d.vocabularyCount ?? "-"}
                        </td>
                        <td style={{ padding: "8px 6px", borderBottom: "1px solid #eee" }}>
                          {d.masteredCount ?? "-"}
                        </td>
                        <td style={{ padding: "8px 6px", borderBottom: "1px solid #eee" }}>
                          {d.user_id || "-"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}