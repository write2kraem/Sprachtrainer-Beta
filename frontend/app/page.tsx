"use client";

import { apiUrl } from "@/lib/api";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Project = {
  id: number;
  title: string;
  target_language: string;
  context?: string;
  focus_topics?: string[];
};

export default function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [title, setTitle] = useState<string>("");
  const [targetLanguage, setTargetLanguage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [userName, setUserName] = useState("");
  const [focusTopicsInput, setFocusTopicsInput] = useState("");
  const router = useRouter();

  async function loadProjects() {
    try {
      const response = await fetch(apiUrl("/projects"));
      const data: Project[] = await response.json();
      setProjects(data);
    } catch (err) {
      setError("Backend nicht erreichbar.");
    }
  }

  useEffect(() => {
    loadProjects();
  }, []);

  async function createProject() {
    setError("");

    const focusTopics = focusTopicsInput
      .split(",")
      .map((topic) => topic.trim())
      .filter(Boolean)
      .slice(0, 3);

    if (!title || !targetLanguage || !userName) {
      setError("Bitte alle Pflichtfelder ausfüllen.");
      return;
    }

    if (focusTopics.length === 0) {
      setError("Bitte nenne mindestens ein Thema, das du meistern möchtest.");
      return;
    }

    const newProject = {
      id: Date.now(),
      title,
      target_language: targetLanguage,
      user_name: userName,
      focus_topics: focusTopics,
    };

    try {
      const response = await fetch(apiUrl("/projects"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newProject),
      });

      if (!response.ok) {
        throw new Error("Projekt konnte nicht angelegt werden.");
      }

      void fetch(
        apiUrl(`/projects/${newProject.id}/interview/start`),
        {
          method: "POST",
        }
      ).catch(() => {
        // Fallback: the project page can try to initialize the interview if needed.
      });

      setTitle("");
      setTargetLanguage("");
      setUserName("");
      setFocusTopicsInput("");

      router.push(`/project/${newProject.id}`);
    } catch (err) {
      setError("Fehler beim Anlegen des Projekts.");
    }
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 32 }}>
      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: 20,
          padding: 28,
          marginBottom: 24,
          background: "#fafafa",
        }}
      >
        <p style={{ margin: "0 0 8px", color: "#666", fontSize: 14 }}>
          Beta-Version
        </p>
        <h1 style={{ fontSize: 34, fontWeight: "bold", margin: "0 0 12px" }}>
          Lerne Sprache für dein echtes Leben.
        </h1>
        <p style={{ fontSize: 17, lineHeight: 1.6, margin: "0 0 12px", color: "#333" }}>
          Dieser Sprachtrainer funktioniert anders als klassische Apps.
          Du lernst nicht allgemeine Vokabeln, sondern genau die Sprache,
          die du in deinen eigenen Situationen wirklich brauchst.
        </p>
        <p style={{ fontSize: 16, lineHeight: 1.6, margin: "0 0 12px", color: "#333" }}>
          Dafür erstellen wir gemeinsam dein persönliches Sprachprojekt.
          Du beschreibst kurz, was du vorhast – und daraus entstehen automatisch
          deine Vokabeln, Fragen und Dialoge.
        </p>
        <p style={{ fontSize: 16, lineHeight: 1.6, margin: "0 0 16px", color: "#333" }}>
          Je konkreter du bist, desto besser wird dein Ergebnis.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {["Urlaub in Portugal", "Segeltörn in Kroatien", "Restaurant & Smalltalk auf Spanisch", "Französisch für den Tauchkurs"].map((example) => (
            <span
              key={example}
              style={{
                border: "1px solid #ddd",
                borderRadius: 999,
                padding: "7px 11px",
                background: "white",
                color: "#333",
                fontSize: 14,
              }}
            >
              {example}
            </span>
          ))}
        </div>
      </section>

      <h1 style={{ fontSize: 32, fontWeight: "bold", marginBottom: 24 }}>
        Sprachtrainer
      </h1>

      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: 16,
          padding: 24,
          marginBottom: 24,
        }}
      >
        <h2 style={{ fontSize: 22, fontWeight: "bold", marginBottom: 16 }}>
          Neues Projekt
        </h2>

        <div style={{ display: "grid", gap: 12 }}>
          <input
            style={{ padding: 12, borderRadius: 8, border: "1px solid #ccc" }}
            placeholder="Titel, z. B. Fuerteventura"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <input
            style={{ padding: 12, borderRadius: 8, border: "1px solid #ccc" }}
            placeholder="Zielsprache, z. B. Spanisch"
            value={targetLanguage}
            onChange={(e) => setTargetLanguage(e.target.value)}
          />

          <input
            style={{ padding: 12, borderRadius: 8, border: "1px solid #ccc" }}
            placeholder="Dein Name (wie darf ich dich ansprechen?)"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
          />

          <p style={{ margin: 0, color: "#666", fontSize: 14 }}>
            Nenne jetzt 1 bis 3 Situationen, die du in diesem Projekt gezielt meistern willst:
          </p>

          <input
            style={{ padding: 12, borderRadius: 8, border: "1px solid #ccc" }}
            placeholder="1–3 Situationen, kommagetrennt, z. B. Surfschule, Restaurant, Smalltalk"
            value={focusTopicsInput}
            onChange={(e) => setFocusTopicsInput(e.target.value)}
          />

          <button
            onClick={createProject}
            style={{
              padding: 12,
              borderRadius: 8,
              border: "1px solid #333",
              cursor: "pointer",
              background: "white",
            }}
          >
            Projekt anlegen
          </button>
        </div>

        {error && (
          <p style={{ color: "red", marginTop: 12 }}>
            {error}
          </p>
        )}
      </section>

      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: 16,
          padding: 24,
        }}
      >
        <h2 style={{ fontSize: 22, fontWeight: "bold", marginBottom: 16 }}>
          Projekte
        </h2>

        {projects.length === 0 ? (
          <p>Noch keine Projekte vorhanden.</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {projects.map((project) => (
              <a
                key={project.id}
                href={`/project/${project.id}`}
                style={{
                  display: "block",
                  border: "1px solid #eee",
                  borderRadius: 12,
                  padding: 16,
                  textDecoration: "none",
                  color: "black",
                }}
              >
                <h3 style={{ fontSize: 18, fontWeight: "bold" }}>
                  {project.title}
                </h3>
                <p>Zielsprache: {project.target_language}</p>
                {project.focus_topics && project.focus_topics.length > 0 ? (
                  <p>Themen: {project.focus_topics.join(", ")}</p>
                ) : project.context ? (
                  <p>Kontext: {project.context}</p>
                ) : null}
              </a>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}