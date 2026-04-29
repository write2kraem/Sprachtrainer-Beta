"use client";

import { apiUrl } from "@/lib/api";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Project = {
  id: number;
  title: string;
  target_language: string;
  level?: string;
  context?: string;
  focus_topics?: string[];
};

const USER_ID_STORAGE_KEY = "sprachtrainer_user_id";
const USER_EMAIL_STORAGE_KEY = "sprachtrainer_user_email";
const USER_NAME_STORAGE_KEY = "sprachtrainer_user_name";

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [title, setTitle] = useState<string>("");
  const [targetLanguage, setTargetLanguage] = useState<string>("");
  const [selectedLanguage, setSelectedLanguage] = useState<string>("");
  const [newLanguageName, setNewLanguageName] = useState<string>("");
  const [level, setLevel] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [currentUserName, setCurrentUserName] = useState<string>("");
  const [nameInput, setNameInput] = useState<string>("");
  const [focusTopicsInput, setFocusTopicsInput] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string>("");
  const [emailInput, setEmailInput] = useState<string>("");
  const [identityError, setIdentityError] = useState<string>("");
  const router = useRouter();

  function userHeaders() {
    return {
      "Content-Type": "application/json",
      "X-User-Id": currentUserId || "",
    };
  }

  async function loadProjects() {
    if (!currentUserId) return;
    try {
      const response = await fetch(apiUrl("/projects"), {
        headers: userHeaders(),
      });
      const data: Project[] = await response.json();
      setProjects(data);
    } catch (err) {
      setError("Backend nicht erreichbar.");
    }
  }

  const languageOptions = Array.from(
    new Set(
      projects
        .map((project) => project.target_language)
        .filter(Boolean)
    )
  );

  const selectedLanguageProjects = selectedLanguage
    ? projects.filter((project) => project.target_language === selectedLanguage)
    : [];

  const selectedLanguageLevel =
    selectedLanguageProjects.find((project) => project.level)?.level || "";

  function createLanguageContext() {
    const languageName = (newLanguageName || selectedLanguage).trim();

    if (!languageName || !level) {
      setError("Bitte Sprache und Startniveau ausfüllen.");
      return;
    }

    setTargetLanguage(languageName);
    setSelectedLanguage(languageName);
    setNewLanguageName(languageName);
    setError("");
  }

  function selectExistingLanguage(languageName: string) {
    setSelectedLanguage(languageName);
    setTargetLanguage(languageName);
    const projectWithLevel = projects.find((project) => project.target_language === languageName && project.level);
    setLevel(projectWithLevel?.level || "");
    setError("");
  }

  useEffect(() => {
    const storedUserId = window.localStorage.getItem(USER_ID_STORAGE_KEY);
    const storedEmail = window.localStorage.getItem(USER_EMAIL_STORAGE_KEY);
    const storedName = window.localStorage.getItem(USER_NAME_STORAGE_KEY);
    const candidateEmail = storedEmail || storedUserId || "";

    if (candidateEmail && isValidEmail(candidateEmail)) {
      const normalizedEmail = normalizeEmail(candidateEmail);
      window.localStorage.setItem(USER_ID_STORAGE_KEY, normalizedEmail);
      window.localStorage.setItem(USER_EMAIL_STORAGE_KEY, normalizedEmail);
      setCurrentUserId(normalizedEmail);
      setCurrentUserEmail(normalizedEmail);
      setEmailInput(normalizedEmail);
      setCurrentUserName(storedName || "");
      setNameInput(storedName || "");
      return;
    }

    if (storedUserId) {
      setCurrentUserId(storedUserId);
      setCurrentUserEmail(storedUserId);
      setCurrentUserName(storedName || "");
      setNameInput(storedName || "");
      return;
    }

    window.localStorage.removeItem(USER_ID_STORAGE_KEY);
    window.localStorage.removeItem(USER_EMAIL_STORAGE_KEY);
    window.localStorage.removeItem(USER_NAME_STORAGE_KEY);
    setCurrentUserId(null);
    setCurrentUserEmail("");
    setCurrentUserName("");
    setEmailInput("");
    setNameInput("");
  }, []);

  useEffect(() => {
    if (currentUserId) {
      loadProjects();
    }
  }, [currentUserId]);

  useEffect(() => {
    if (!selectedLanguage && !newLanguageName.trim() && projects.length > 0) {
      const firstLanguage = projects.find((project) => project.target_language)?.target_language || "";
      if (firstLanguage) {
        selectExistingLanguage(firstLanguage);
      }
    }
  }, [projects, selectedLanguage, newLanguageName]);

  function loginOrRegister() {
    setIdentityError("");

    const normalizedEmail = normalizeEmail(emailInput);
    const normalizedName = nameInput.trim();

    if (!normalizedName) {
      setIdentityError("Bitte gib deinen Namen ein.");
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      setIdentityError("Bitte gib eine gültige E-Mail-Adresse ein.");
      return;
    }

    window.localStorage.setItem(USER_ID_STORAGE_KEY, normalizedEmail);
    window.localStorage.setItem(USER_EMAIL_STORAGE_KEY, normalizedEmail);
    window.localStorage.setItem(USER_NAME_STORAGE_KEY, normalizedName);
    setCurrentUserId(normalizedEmail);
    setCurrentUserEmail(normalizedEmail);
    setCurrentUserName(normalizedName);
    setProjects([]);
    setSelectedLanguage("");
    setNewLanguageName("");
    setTargetLanguage("");
    setLevel("");
    setTitle("");
    setFocusTopicsInput("");
    setError("");
  }

  function logoutUser() {
    window.localStorage.removeItem(USER_ID_STORAGE_KEY);
    window.localStorage.removeItem(USER_EMAIL_STORAGE_KEY);
    window.localStorage.removeItem(USER_NAME_STORAGE_KEY);
    setCurrentUserId(null);
    setCurrentUserEmail("");
    setCurrentUserName("");
    setEmailInput("");
    setNameInput("");
    setProjects([]);
    setSelectedLanguage("");
    setNewLanguageName("");
    setTargetLanguage("");
    setLevel("");
    setTitle("");
    setFocusTopicsInput("");
    setError("");
    setIdentityError("");
  }

  async function createProject() {
    setError("");
    if (!currentUserId) {
      setError("Bitte melde dich zuerst mit deiner E-Mail-Adresse an.");
      return;
    }
    const languageName =
      selectedLanguage?.trim() || newLanguageName?.trim();
    const focusTopics = focusTopicsInput
      .split(",")
      .map((topic) => topic.trim())
      .filter(Boolean)
      .slice(0, 3);

    if (!languageName || !level || !title) {
      setError("Bitte Sprache und Startniveau auswählen und einen Anlass ausfüllen.");
      return;
    }

    if (focusTopics.length === 0) {
      setError("Bitte nenne mindestens ein Thema, das du meistern möchtest.");
      return;
    }

    const newProject = {
      id: Date.now(),
      title,
      target_language: languageName,
      level,
      user_name: currentUserName || currentUserEmail,
      focus_topics: focusTopics,
    };

    try {
      const response = await fetch(apiUrl("/projects"), {
        method: "POST",
        headers: userHeaders(),
        body: JSON.stringify(newProject),
      });

      if (!response.ok) {
        throw new Error("Projekt konnte nicht angelegt werden.");
      }

      window.localStorage.setItem(`trainer-project-level-${newProject.id}`, level);

      void fetch(
        apiUrl(`/projects/${newProject.id}/interview/start`),
        {
          method: "POST",
          headers: userHeaders(),
        }
      ).catch(() => {
        // Fallback: the project page can try to initialize the interview if needed.
      });

      setTitle("");
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
          borderRadius: 16,
          padding: 20,
          marginBottom: 24,
          background: currentUserId ? "#f7fff7" : "#fffaf0",
        }}
      >
        {currentUserId ? (
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <p style={{ margin: "0 0 4px", color: "#666", fontSize: 14 }}>
                Angemeldet als
              </p>
              <strong>{currentUserName || currentUserEmail}</strong>
              {currentUserName && (
                <p style={{ margin: "4px 0 0", color: "#666", fontSize: 14 }}>
                  {currentUserEmail}
                </p>
              )}
            </div>
            <button
              onClick={logoutUser}
              style={{
                padding: "9px 12px",
                borderRadius: 8,
                border: "1px solid #999",
                background: "white",
                cursor: "pointer",
              }}
            >
              Anderen Nutzer verwenden
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: "bold", margin: "0 0 8px" }}>
                Anmelden oder registrieren
              </h2>
              <p style={{ margin: 0, color: "#555", lineHeight: 1.5 }}>
                Gib deine E-Mail-Adresse ein. Für die Beta nutzen wir sie als einfache Nutzerkennung,
                damit deine Projekte und Lerndaten getrennt gespeichert werden.
              </p>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                style={{ flex: "1 1 220px", padding: 12, borderRadius: 8, border: "1px solid #ccc" }}
                placeholder="Dein Name"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    loginOrRegister();
                  }
                }}
              />
              <input
                style={{ flex: "1 1 260px", padding: 12, borderRadius: 8, border: "1px solid #ccc" }}
                placeholder="deine.email@beispiel.de"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    loginOrRegister();
                  }
                }}
              />
              <button
                onClick={loginOrRegister}
                style={{
                  padding: "12px 16px",
                  borderRadius: 8,
                  border: "1px solid #333",
                  background: "white",
                  cursor: "pointer",
                }}
              >
                Weiter
              </button>
            </div>

            {identityError && (
              <p style={{ color: "red", margin: 0 }}>{identityError}</p>
            )}
          </div>
        )}
      </section>

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
          Beta-Version-XL
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
          1. Sprache und Niveau festlegen
        </h2>

        {languageOptions.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <p style={{ margin: "0 0 8px", color: "#666", fontSize: 14 }}>
              Bestehende Sprache auswählen:
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {languageOptions.map((languageName) => (
                <button
                  key={languageName}
                  onClick={() => selectExistingLanguage(languageName)}
                  style={{
                    padding: "9px 12px",
                    borderRadius: 999,
                    border: selectedLanguage === languageName ? "2px solid #111" : "1px solid #ddd",
                    background: selectedLanguage === languageName ? "#f0f0f0" : "white",
                    cursor: "pointer",
                  }}
                >
                  {languageName}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "grid", gap: 12 }}>
          <p style={{ margin: 0, color: "#666", fontSize: 14 }}>
            Neue Sprache anlegen oder bestehende oben auswählen:
          </p>

          <input
            style={{
              width: "100%",
              height: 50,
              padding: "0 12px",
              borderRadius: 8,
              border: "1px solid #ccc",
              fontSize: 16,
              boxSizing: "border-box",
            }}
            placeholder="Sprache, z. B. Spanisch"
            value={newLanguageName}
            onChange={(e) => {
              setNewLanguageName(e.target.value);
              setSelectedLanguage("");
            }}
          />

          <p style={{ margin: 0, color: "#666", fontSize: 14 }}>
            Startniveau für diese Sprache:
          </p>

          <select
            style={{
              width: "100%",
              height: 50,
              padding: "0 12px",
              borderRadius: 8,
              border: "1px solid #ccc",
              fontSize: 16,
              background: "white",
              boxSizing: "border-box",
            }}
            value={level}
            onChange={(e) => setLevel(e.target.value)}
          >
            <option value="">Startniveau wählen</option>
            <option value="Anfänger">Startniveau: Anfänger</option>
            <option value="Grundkenntnisse">Startniveau: Grundkenntnisse</option>
            <option value="Fortgeschritten">Startniveau: Fortgeschritten</option>
            <option value="Fließend">Startniveau: Fließend</option>
          </select>

          <button
            onClick={createLanguageContext}
            disabled={!currentUserId}
            style={{
              padding: 12,
              borderRadius: 8,
              border: "1px solid #333",
              cursor: currentUserId ? "pointer" : "not-allowed",
              opacity: currentUserId ? 1 : 0.5,
              background: "white",
            }}
          >
            Sprache auswählen / anlegen
          </button>
        </div>

        {selectedLanguage && (
          <div
            style={{
              margin: "18px 0 0",
              padding: 14,
              borderRadius: 12,
              border: "1px solid #d6ead6",
              background: "#f7fff7",
            }}
          >
            <p style={{ margin: 0, color: "#666", fontSize: 14 }}>
              Aktiver Sprachrahmen
            </p>
            <p style={{ margin: "4px 0 0", color: "#222" }}>
              Sprache: <strong>{selectedLanguage}</strong>
              {level && <> · Startniveau: <strong>{level}</strong></>}
            </p>
          </div>
        )}
      </section>

      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: 16,
          padding: 24,
          marginBottom: 24,
          opacity: selectedLanguage ? 1 : 0.55,
        }}
      >
        <h2 style={{ fontSize: 22, fontWeight: "bold", marginBottom: 16 }}>
          2. Was ist der Anlass für deinen Sprachkurs?
        </h2>

        {!selectedLanguage ? (
          <p style={{ color: "#666", margin: 0 }}>
            Bitte zuerst eine Sprache mit Startniveau auswählen oder anlegen.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            <p style={{ margin: 0, color: "#666", fontSize: 14 }}>
              Für welches Projekt benötigst du diesesmal {selectedLanguage}:
            </p>

            <input
              style={{ padding: 12, borderRadius: 8, border: "1px solid #ccc" }}
              placeholder="Anlass, z. B. Spanien Wandern, Teneriffa Surfen, Madrid Geschäftsreise"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            <p style={{ margin: 0, color: "#666", fontSize: 14 }}>
              Welche konkreten Situationen willst du bei diesem Anlass meistern?
            </p>

            <input
              style={{ padding: 12, borderRadius: 8, border: "1px solid #ccc" }}
              placeholder="1–3 konkrete Situationen, kommagetrennt, z. B. Surfschule, Restaurant, Smalltalk"
              value={focusTopicsInput}
              onChange={(e) => setFocusTopicsInput(e.target.value)}
            />

            <button
              onClick={createProject}
              disabled={!currentUserId || !selectedLanguage}
              style={{
                padding: 12,
                borderRadius: 8,
                border: "1px solid #333",
                cursor: currentUserId && selectedLanguage ? "pointer" : "not-allowed",
                opacity: currentUserId && selectedLanguage ? 1 : 0.5,
                background: "white",
              }}
            >
              Neues Projekt anlegen
            </button>
          </div>
        )}

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
          Projekte {selectedLanguage ? `für ${selectedLanguage}` : ""}
        </h2>

        {!selectedLanguage ? (
          <p>Bitte zuerst eine Sprache auswählen.</p>
        ) : selectedLanguageProjects.length === 0 ? (
          <p>Noch keine Projekte für diese Sprache vorhanden.</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {selectedLanguageProjects.map((project) => (
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
                {project.level && <p>Startniveau: {project.level}</p>}
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