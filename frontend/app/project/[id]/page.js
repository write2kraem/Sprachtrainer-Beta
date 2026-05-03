"use client";
import { apiHeaders, apiUrl } from "@/lib/api";
import { use, useEffect, useRef, useState } from "react";

export default function ProjectPage({ params }) {
  const { id: projectId } = use(params);

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [vocabulary, setVocabulary] = useState([]);
  const [status, setStatus] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [roleplay, setRoleplay] = useState(null);
  const [roleplayHistory, setRoleplayHistory] = useState([]);
  const [roleplayInput, setRoleplayInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [isRoleplaySending, setIsRoleplaySending] = useState(false);
  const [showExampleQuestion, setShowExampleQuestion] = useState(false);
  const [showExampleSentence, setShowExampleSentence] = useState(false);
  const [showSampleAnswer, setShowSampleAnswer] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [showVocabulary, setShowVocabulary] = useState(false);
  const [showLearningMode, setShowLearningMode] = useState(false);
  const [showRoleplaySection, setShowRoleplaySection] = useState(false);
  const [showInterviewSection, setShowInterviewSection] = useState(true);
  const [selectedLevel, setSelectedLevel] = useState("beginner");
  const [projectRawLevel, setProjectRawLevel] = useState("");
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState("");
  const [feedbackProblem, setFeedbackProblem] = useState("");
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState("");
  const [masteredWords, setMasteredWords] = useState({});
  const [wrongAnswerWords, setWrongAnswerWords] = useState({});
  const [learningAnswer, setLearningAnswer] = useState("");
  const [learningFeedback, setLearningFeedback] = useState(null);
  const [lockedLearningWord, setLockedLearningWord] = useState(null);
  const [isRebuildingCard, setIsRebuildingCard] = useState(false);
  const [seenWords, setSeenWords] = useState({});
  const [activeSpeechField, setActiveSpeechField] = useState("interview");
  const [learningDirection, setLearningDirection] = useState("target-first");
  const [learningPhase, setLearningPhase] = useState("learn");
  const [targetLanguage, setTargetLanguage] = useState("Fremdsprache");
  const [sourceLanguage, setSourceLanguage] = useState("Deutsch");
  const [showDiagnosisLogin, setShowDiagnosisLogin] = useState(false);
  const [diagnosisPassword, setDiagnosisPassword] = useState("");
  const [diagnosisUnlocked, setDiagnosisUnlocked] = useState(false);
  const [diagnosisStatus, setDiagnosisStatus] = useState("");
  const [isRebuildingAllCards, setIsRebuildingAllCards] = useState(false);
  const backgroundExpandedWordsRef = useRef(new Set());
  const expandingWordsRef = useRef(new Set());
  const recognitionRef = useRef(null);
  const interviewInputRef = useRef(null);
  const learningInputRef = useRef(null);
  const speechFinalRef = useRef("");
  const speechManualStopRef = useRef(false);
  const speechSynthesisUtteranceRef = useRef(null);
  const activeSpeechFieldRef = useRef("interview");
  const learningDirectionRef = useRef("target-first");
  const sourceLanguageRef = useRef("Deutsch");

  const targetLanguageRef = useRef("Fremdsprache");

function mapProjectLevelToAccessLevel(level) {
  const normalizedLevel = String(level || "").trim().toLowerCase();

  if (normalizedLevel === "grundkenntnisse") return "some";
  if (normalizedLevel === "fortgeschritten") return "advanced";
  if (normalizedLevel === "fließend" || normalizedLevel === "fliessend") return "advanced";

  return "beginner";
}

async function loadProjectLanguages() {
  try {
    const res = await fetch(apiUrl(`/projects`), {
      headers: apiHeaders(),
    });
    if (!res.ok) return;

    const projects = await res.json();
    if (!Array.isArray(projects)) return;

    const currentProject = projects.find(
      (project) => String(project.id) === String(projectId)
    );

    if (!currentProject) return;

    if (currentProject.target_language) {
      setTargetLanguage(currentProject.target_language);
    }

    if (currentProject.source_language) {
      setSourceLanguage(currentProject.source_language);
    }

    const storedProjectLevel =
      typeof window !== "undefined"
        ? window.localStorage.getItem(`trainer-project-level-${projectId}`)
        : null;

    const rawLevel = currentProject.level || storedProjectLevel || "";
    const mappedLevel = mapProjectLevelToAccessLevel(rawLevel);


    setProjectRawLevel(rawLevel);
    setSelectedLevel(mappedLevel);
  } catch (err) {
    // Fallback bleibt bei Deutsch / Fremdsprache
  }
}

async function loadInterview() {
  const res = await fetch(
    apiUrl(`/projects/${projectId}/interview`),
    { headers: apiHeaders() }
  );

  if (res.status === 404) {
    const startRes = await fetch(
      apiUrl(`/projects/${projectId}/interview/start`),
      {
        method: "POST",
        headers: apiHeaders(),
      }
    );

    if (!startRes.ok) {
      setStatus("Interview konnte nicht automatisch gestartet werden.");
      setMessages([]);
      return;
    }

    const restarted = await fetch(
      apiUrl(`/projects/${projectId}/interview`),
      { headers: apiHeaders() }
    );

    if (!restarted.ok) {
      setMessages([]);
      return;
    }

    const restartedData = await restarted.json();
    setMessages(restartedData);
    setStatus("");
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
    }
    return;
  }

  const data = await res.json();
  setMessages(data);
}

async function loadVocabulary() {
  const res = await fetch(
    apiUrl(`/projects/${projectId}/vocabulary`),
    { headers: apiHeaders() }
  );

  const data = await res.json();
  const vocabArray = data.vocabulary || data || [];

  const priorityOrder = {
    verb: 1,
    verb_conjugated: 2,
    adjective: 3,
    noun: 4,
    phrase: 5,
  };

  const sorted = [...vocabArray].sort((a, b) => {
    const aData = masteredWords[a.word];
    const bData = masteredWords[b.word];

    const aMastered = aData ? 1 : 0;
    const bMastered = bData ? 1 : 0;

    // 1. im Lernmodus gesehene Wörter zuerst
    const aSeen = seenWords[a.word] ? 1 : 0;
    const bSeen = seenWords[b.word] ? 1 : 0;

    if (aSeen !== bSeen) return bSeen - aSeen;

    // 2. neue / noch nicht beherrschte Wörter zuerst
    if (aMastered !== bMastered) return aMastered - bMastered;

    // 1b. warning (fast richtig) priorisieren
    const aWarning = aData?.lastWarning ? 1 : 0;
    const bWarning = bData?.lastWarning ? 1 : 0;

    if (aWarning !== bWarning) return bWarning - aWarning;

    // 1c. kürzlich richtig beantwortete nach hinten schieben
    const now = Date.now();
    const recentThreshold = 1000 * 60 * 60 * 6; // 6 Stunden

    const aRecent = aData?.lastCorrect && (now - aData.lastCorrect < recentThreshold) ? 1 : 0;
    const bRecent = bData?.lastCorrect && (now - bData.lastCorrect < recentThreshold) ? 1 : 0;

    if (aRecent !== bRecent) return aRecent - bRecent;

    // 3. Kategorie-Priorität
    const aPriority = priorityOrder[a.category] || 99;
    const bPriority = priorityOrder[b.category] || 99;

    if (aPriority !== bPriority) return aPriority - bPriority;

    // 4. leichte Zufälligkeit
    return Math.random() - 0.5;
  });

  setVocabulary(sorted);

  if (data.target_language) {
    setTargetLanguage(data.target_language);
  }

  if (data.source_language) {
    setSourceLanguage(data.source_language);
  }
}

  async function startInterview() {
    setStatus("");

    const res = await fetch(
      apiUrl(`/projects/${projectId}/interview/start`),
      {
        method: "POST",
        headers: apiHeaders(),
      }
    );

    if (!res.ok) {
      setStatus("Interview konnte nicht gestartet werden.");
      return;
    }

    await loadInterview();
    await loadVocabulary();
    setStatus("Interview wurde neu gestartet.");
  }

async function sendMessage() {
  if (!input.trim() || isSending) return;
    if (isListening && recognitionRef.current) {
    recognitionRef.current.stop();
    }
  setIsSending(true);
  setStatus("Ich analysiere deinen Wortschatz");
  setShowTranslation(false);
  setLearningAnswer("");
  setLearningFeedback(null);
  setActiveSpeechField("interview");
  setLiveTranscript("");

  try {
    const res = await fetch(
      apiUrl(`/projects/${projectId}/interview/message`),
      {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({ text: input }),
      }
    );

    if (!res.ok) {
      setStatus("Nachricht konnte nicht gesendet werden.");
      return;
    }

    const data = await res.json();
    setMessages(data.interview || []);
    setVocabulary(data.vocabulary || []);
    setInput("");
    speechFinalRef.current = "";
    setLiveTranscript("");
    if (interviewInputRef.current) {
      interviewInputRef.current.style.height = "auto";
      interviewInputRef.current.style.overflowY = "hidden";
    }
    setStatus("");
    setCurrentIndex(0);
    setShowExampleQuestion(false);
    setShowExampleSentence(false);
    setShowSampleAnswer(false);
    setShowTranslation(false);
  } finally {
    setIsSending(false);
  }
}
async function startRoleplay() {
  const res = await fetch(
    apiUrl(`/projects/${projectId}/roleplay/start`),
    {
      method: "POST",
      headers: apiHeaders(),
    }
  );

  if (!res.ok) {
    setStatus("Rollenspiel konnte nicht gestartet werden.");
    return;
  }

  const data = await res.json();
  setRoleplay(data.scenario);
  setRoleplayHistory(data.history);
  setRoleplayInput("");
}
async function sendRoleplayMessage() {
  if (!roleplayInput.trim() || isRoleplaySending) return;

  setIsRoleplaySending(true);
  setStatus("wird analysiert");

  try {
    const res = await fetch(
      apiUrl(`/projects/${projectId}/roleplay/message`),
      {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({ text: roleplayInput }),
      }
    );

    if (!res.ok) {
      setStatus("Rollenspiel-Antwort konnte nicht gesendet werden.");
      return;
    }

    const data = await res.json();

    setRoleplayHistory(data.history || []);
    setRoleplayInput("");
    setStatus("");

  } finally {
    setIsRoleplaySending(false);
  }
}

useEffect(() => {
  loadProjectLanguages();
  loadInterview();
  loadVocabulary();

  if (typeof window === "undefined") return;

  try {
    const storedMasteredWords = window.localStorage.getItem(`trainer-mastered-${projectId}`);
    if (storedMasteredWords) {
      const parsed = JSON.parse(storedMasteredWords);
      if (parsed && typeof parsed === "object") {
        setMasteredWords(parsed);
      }
    }
  } catch (err) {
    // Fallback ohne gespeicherten Fortschritt
  }
}, [projectId]);


useEffect(() => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      `trainer-mastered-${projectId}`,
      JSON.stringify(masteredWords)
    );
  } catch (err) {}
}, [projectId, masteredWords]);

useEffect(() => {
  activeSpeechFieldRef.current = activeSpeechField;
}, [activeSpeechField]);

useEffect(() => {
  learningDirectionRef.current = learningDirection;
}, [learningDirection]);

useEffect(() => {
  sourceLanguageRef.current = sourceLanguage;
}, [sourceLanguage]);

useEffect(() => {
  targetLanguageRef.current = targetLanguage;
}, [targetLanguage]);

useEffect(() => {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        setSpeechSupported(false);
        return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "de-DE";
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.continuous = false;

  recognition.onstart = () => {
    setIsListening(true);
    setStatus(`Höre zu... (${getSpeechFieldLabel()})`);
  };

  recognition.onresult = (event) => {
    let newFinalTranscript = "";
    let interimTranscript = "";

    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const text = event.results[i]?.[0]?.transcript || "";
      if (event.results[i].isFinal) {
        newFinalTranscript += text;
      } else {
        interimTranscript += text;
      }
    }

    const normalizedNewFinal = newFinalTranscript.trim();
    const normalizedInterim = interimTranscript.trim();

    if (normalizedNewFinal) {
      speechFinalRef.current = [speechFinalRef.current.trim(), normalizedNewFinal]
        .filter(Boolean)
        .join(" ");
    }

    const combinedTranscript = [speechFinalRef.current.trim(), normalizedInterim]
      .filter(Boolean)
      .join(" ")
      .trim();

    setLiveTranscript(combinedTranscript);

    if (combinedTranscript) {
      if (activeSpeechFieldRef.current === "learning") {
        setLearningAnswer(combinedTranscript);
      } else if (activeSpeechFieldRef.current === "roleplay") {
        setRoleplayInput(combinedTranscript);
      } else {
        setInput(combinedTranscript);
      }
      setStatus("Sprache wird erkannt...");
    }
  };

  recognition.onerror = (event) => {
    const errorCode = event?.error || "unknown";
    const errorMessages = {
        "no-speech": "Keine Sprache erkannt. Bitte sprich etwas deutlicher oder näher am Mikrofon.",
        "audio-capture": "Kein Mikrofon gefunden oder kein Zugriff auf das Mikrofon.",
        "not-allowed": "Mikrofonzugriff wurde nicht erlaubt.",
        "network": "Spracherkennung ist fehlgeschlagen. Bitte erneut versuchen.",
        "aborted": "Spracheingabe wurde abgebrochen.",
    };

    setStatus(errorMessages[errorCode] || "Spracheingabe konnte nicht verarbeitet werden.");
    setIsListening(false);
    };

  recognition.onend = () => {
    setIsListening(false);

    if (speechManualStopRef.current) {
      speechManualStopRef.current = false;

      if (speechFinalRef.current.trim()) {
        const finalText = speechFinalRef.current.trim();
        setStatus(
          activeSpeechFieldRef.current === "learning"
            ? "Sprache erkannt. Du kannst jetzt prüfen."
            : "Sprache erkannt. Du kannst jetzt senden."
        );

        if (activeSpeechFieldRef.current === "learning") {
          setLearningAnswer(finalText);
          setTimeout(() => {
            learningInputRef.current?.focus();
          }, 0);
        } else {
          setInput(finalText);
        }

        setLiveTranscript(finalText);
      } else {
        setStatus("Keine Sprache erkannt. Bitte erneut versuchen.");
      }
      return;
    }

    if (speechFinalRef.current.trim()) {
      const finalText = speechFinalRef.current.trim();
      setStatus(
        activeSpeechFieldRef.current === "learning"
          ? "Sprache erkannt. Du kannst jetzt prüfen."
          : "Sprache erkannt. Du kannst jetzt senden."
      );

      if (activeSpeechFieldRef.current === "learning") {
        setLearningAnswer(finalText);
        setTimeout(() => {
          learningInputRef.current?.focus();
        }, 0);
      } else {
        setInput(finalText);
      }

      setLiveTranscript(finalText);
    } else {
      setStatus("Keine Sprache erkannt. Bitte erneut versuchen.");
    }
  };

  recognitionRef.current = recognition;

    return () => {
    if (recognitionRef.current) {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
    }

    if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }

    speechSynthesisUtteranceRef.current = null;
    };
}, []);

function getSpeechSynthesisLanguage() {
  const normalizedTarget = (targetLanguage || "").trim().toLowerCase();

  if (normalizedTarget.includes("mex")) return "es-MX";
  if (normalizedTarget.includes("span") || normalizedTarget.includes("españ") || normalizedTarget.includes("espan")) return "es-ES";
  if (normalizedTarget.includes("portug") || normalizedTarget.includes("portugu")) return normalizedTarget.includes("brasil") ? "pt-BR" : "pt-PT";
  if (normalizedTarget.includes("franz") || normalizedTarget.includes("french")) return "fr-FR";
  if (normalizedTarget.includes("ital") || normalizedTarget.includes("italian")) return "it-IT";
  if (normalizedTarget.includes("engl") || normalizedTarget.includes("english")) return "en-US";
  if (normalizedTarget.includes("deutsch") || normalizedTarget.includes("german")) return "de-DE";
  if (normalizedTarget.includes("nieder") || normalizedTarget.includes("dutch")) return "nl-NL";
  if (normalizedTarget.includes("finn") || normalizedTarget.includes("finnish")) return "fi-FI";

  const languageMap = {
    deutsch: "de-DE",
    german: "de-DE",
    englisch: "en-US",
    english: "en-US",
    spanisch: "es-ES",
    spanish: "es-ES",
    "spanisch (mexiko)": "es-MX",
    "spanisch mexiko": "es-MX",
    "mexikanisches spanisch": "es-MX",
    französisch: "fr-FR",
    french: "fr-FR",
    italienisch: "it-IT",
    italian: "it-IT",
    portugiesisch: "pt-PT",
    portuguese: "pt-PT",
    niederländisch: "nl-NL",
    dutch: "nl-NL",
    finnisch: "fi-FI",
    finnish: "fi-FI",
  };

  return languageMap[normalizedTarget] || "es-ES";
}

function speakText(text) {
  if (typeof window === "undefined") return;
  if (!text || !text.trim()) return;

  const synth = window.speechSynthesis;
  if (!synth) {
    setStatus("Sprachausgabe wird in diesem Browser nicht unterstützt.");
    return;
  }

  synth.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = getSpeechSynthesisLanguage();
  utterance.rate = 1;
  utterance.onend = () => {
    speechSynthesisUtteranceRef.current = null;
  };
  utterance.onerror = () => {
    speechSynthesisUtteranceRef.current = null;
    setStatus("Sprachausgabe konnte nicht gestartet werden.");
  };

  speechSynthesisUtteranceRef.current = utterance;
  synth.speak(utterance);
}

function getSpeechRecognitionLanguage(field = activeSpeechFieldRef.current) {
  const currentLearningDirection = learningDirectionRef.current;
  const currentSourceLanguage = sourceLanguageRef.current;
  const currentTargetLanguage = targetLanguageRef.current;

  const selectedLanguageName =
    field === "learning"
      ? currentLearningDirection === "target-first"
        ? currentSourceLanguage
        : currentTargetLanguage
      : field === "roleplay"
      ? currentTargetLanguage
      : currentSourceLanguage;

  const normalizedLanguage = (selectedLanguageName || "").trim().toLowerCase();

  const languageMap = {
    deutsch: "de-DE",
    german: "de-DE",
    englisch: "en-US",
    english: "en-US",
    spanisch: "es-ES",
    spanish: "es-ES",
    französisch: "fr-FR",
    french: "fr-FR",
    italienisch: "it-IT",
    italian: "it-IT",
    portugiesisch: "pt-PT",
    portuguese: "pt-PT",
    niederländisch: "nl-NL",
    dutch: "nl-NL",
  };

  return languageMap[normalizedLanguage] || "de-DE";
}

function getSpeechFieldLabel(field = activeSpeechFieldRef.current) {
  const currentLearningDirection = learningDirectionRef.current;
  const currentSourceLanguage = sourceLanguageRef.current;
  const currentTargetLanguage = targetLanguageRef.current;

  if (field === "learning") {
    return currentLearningDirection === "target-first"
      ? currentSourceLanguage || "Deutsch"
      : currentTargetLanguage || "Fremdsprache";
  }

  if (field === "roleplay") {
    return currentTargetLanguage || "Fremdsprache";
  }

  return currentSourceLanguage || "Deutsch";
}

function toggleSpeechInput(field = "interview") {
  if (!speechSupported || !recognitionRef.current || isSending) return;

  if (isListening) {
    speechManualStopRef.current = true;
    recognitionRef.current.stop();
    setStatus("Spracheingabe wird beendet...");
    return;
  }

  speechFinalRef.current = "";
  setLiveTranscript("");
  activeSpeechFieldRef.current = field;
  setActiveSpeechField(field);
  speechManualStopRef.current = false;
  recognitionRef.current.lang = getSpeechRecognitionLanguage(field);
  recognitionRef.current.start();
}

  function normalizeAnswer(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.,!?;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getExpectedLearningAnswer(item) {
  if (!item) return "";
  return learningDirection === "target-first"
    ? getSourceText(item)
    : getTargetText(item);
}

function isAnswerCorrect(answer, expected) {
  const normalizedAnswer = normalizeAnswer(answer);
  const normalizedExpected = normalizeAnswer(expected);

  if (!normalizedAnswer || !normalizedExpected) return false;
  if (normalizedAnswer === normalizedExpected) return true;

  return (
    normalizedAnswer.includes(normalizedExpected) ||
    normalizedExpected.includes(normalizedAnswer)
  );
}

async function persistLearningState(word, result) {
  if (!word || !result) return;

  try {
    const res = await fetch(
      apiUrl(`/projects/${projectId}/vocabulary/${encodeURIComponent(word)}/learning-state`),
      {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({
          result,
          timestamp: Date.now(),
        }),
      }
    );

    if (!res.ok) {
      throw new Error("Learning state update failed");
    }

    const updatedState = await res.json();

    setVocabulary((prev) =>
      prev.map((item) =>
        item.word === updatedState.word
          ? {
              ...item,
              mastered: updatedState.mastered,
              wrong_count: updatedState.wrong_count,
              last_correct: updatedState.last_correct,
              last_wrong: updatedState.last_wrong,
            }
          : item
      )
    );
  } catch (err) {
    console.error("Learning-State konnte nicht gespeichert werden", err);
  }
}

async function submitLearningAnswer() {
  if (!currentWord) return;

  const expected = getExpectedLearningAnswer(currentWord);
  const answer = learningAnswer.trim();
  setLockedLearningWord(currentWord);

  if (!answer) {
    setLearningFeedback({
      type: "warning",
      text: "Bitte gib zuerst eine Antwort ein.",
    });
    return;
  }

  if (!expected || expected === "Wortschatz wird generiert") {
    setLearningFeedback({
      type: "warning",
      text: "Für diese Karte ist noch keine prüfbare Übersetzung verfügbar.",
    });
    return;
  }

  if (isAnswerCorrect(answer, expected)) {
    setMasteredWords((prev) => ({
      ...prev,
      [currentWord.word]: {
        mastered: true,
        lastCorrect: Date.now(),
      },
    }));
    setWrongAnswerWords((prev) => {
      const next = { ...prev };
      delete next[currentWord.word];
      return next;
    });
    persistLearningState(currentWord.word, "correct");
    const retryStore = window.__retryCounts || (window.__retryCounts = {});
    const queue = window.__reinsertQueue || (window.__reinsertQueue = []);
    retryStore[currentWord.word] = 0;
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (queue[i].word === currentWord.word) {
        queue.splice(i, 1);
      }
    }

    setLearningFeedback({
      type: "success",
      text: "Richtig, sehr gut",
    });
    setShowTranslation(true);
    speechFinalRef.current = answer;
    return;
  }

  try {
    const res = await fetch(
      apiUrl(`/projects/${projectId}/learning/evaluate`),
      {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({
          answer,
          expected,
          word: currentWord.word,
          category: currentWord.category,
          direction: learningDirection,
        }),
      }
    );

    if (!res.ok) {
      throw new Error("LLM-Bewertung fehlgeschlagen");
    }

    const evaluation = await res.json();

    if (evaluation.rating === "correct" || evaluation.rating === "acceptable") {
      if (evaluation.rating === "correct") {
        setMasteredWords((prev) => ({
          ...prev,
          [currentWord.word]: {
            mastered: true,
            lastCorrect: Date.now(),
          },
        }));
        setWrongAnswerWords((prev) => {
          const next = { ...prev };
          delete next[currentWord.word];
          return next;
        });
        persistLearningState(currentWord.word, "correct");
      } else {
        setMasteredWords((prev) => ({
          ...prev,
          [currentWord.word]: {
            ...(prev[currentWord.word] || {}),
            lastWarning: Date.now(),
          },
        }));
      }
      setLearningFeedback({
        type: evaluation.rating === "correct" ? "success" : "warning",
        text:
          evaluation.feedback ||
          (evaluation.rating === "correct"
            ? "Perfekt – genau richtig."
            : `Inhaltlich richtig. Üblicher wäre hier: ${evaluation.preferred || expected}`),
      });
    } else {
      setWrongAnswerWords((prev) => ({
        ...prev,
        [currentWord.word]: Date.now(),
      }));
      persistLearningState(currentWord.word, "incorrect");
      setLearningFeedback({
        type: "error",
        text: evaluation.feedback || `Noch nicht richtig. Erwartet war: ${evaluation.preferred || expected}`,
      });
    }
  } catch (err) {
    setWrongAnswerWords((prev) => ({
      ...prev,
      [currentWord.word]: Date.now(),
    }));
    persistLearningState(currentWord.word, "incorrect");
    setLearningFeedback({
      type: "error",
      text: `Noch nicht richtig. Erwartet war: ${expected}`,
    });
  }

  setShowTranslation(true);
  speechFinalRef.current = answer;
}

    function resetLearningCardState() {
      setLearningAnswer("");
      setLearningFeedback(null);
      setLockedLearningWord(null);
      setShowTranslation(false);
      setShowExampleSentence(false);
      setLiveTranscript("");
      speechFinalRef.current = "";
    }

    function getLearningPriority(item) {
      let score = 0;
      const isVerb = item.category === "verb" || item.category === "verb_conjugated";

      // Lernmodus-Priorität:
      // 1. falsch beantwortete Wörter
      // 2. Verben
      // 3. persönliche Interview-/Kontextwörter
      // 4. Review-relevante Karten
      // 5. Grundwortschatz zuletzt, aber Verben bleiben trotzdem weit oben
      if (wrongAnswerWords[item.word] || item.last_wrong || (item.wrong_count || 0) > 0) score += 100;
      if (isVerb) score += 80;
      if (item.source === "description") score += 60;
      if (item.source === "situation_core") score += 50;
      if (item.review_status === "edited") score += 30;
      if (item.review_status === "new") score += 10;
      if (item.source === "base_core" && !isVerb) score -= 20;
      if (item.mastered && item.last_correct) score -= 40;
      return score;
    }

    const learningVocabulary = Array.isArray(vocabulary)
      ? [...vocabulary].sort((a, b) => {
          const priorityDifference = getLearningPriority(b) - getLearningPriority(a);
          if (priorityDifference !== 0) return priorityDifference;
          const aIsVerb = a.category === "verb" || a.category === "verb_conjugated";
          const bIsVerb = b.category === "verb" || b.category === "verb_conjugated";
          if (aIsVerb !== bIsVerb) return aIsVerb ? -1 : 1;
          return String(a.word || "").localeCompare(String(b.word || ""));
        })
      : [];

    const activeVocabulary = showLearningMode ? learningVocabulary : vocabulary;

    const currentWordFromList =
      Array.isArray(activeVocabulary) && activeVocabulary.length > 0
        ? activeVocabulary[currentIndex % activeVocabulary.length]
        : null;

    const currentWord = lockedLearningWord || currentWordFromList;

    function nextWord() {
      if (activeVocabulary.length === 0) return;
      setLockedLearningWord(null);

      if (learningPhase === "learn" && currentWord?.word) {
        setSeenWords((prev) => ({
          ...prev,
          [currentWord.word]: true,
        }));
      }

      const retryStore = window.__retryCounts || (window.__retryCounts = {});
      const queue = window.__reinsertQueue || (window.__reinsertQueue = []);
      const key = currentWord?.word || "";

      // if last answer was not fully correct
      if (learningFeedback && learningFeedback.type !== "success") {
        retryStore[key] = (retryStore[key] || 0) + 1;

        // allow skipping up to 3 times and schedule reinsert after 3–5 words
        if (retryStore[key] <= 3) {
          queue.push({
            word: key,
            remaining: Math.floor(Math.random() * 3) + 3, // 3–5
          });

          setCurrentIndex((prev) => (prev + 1) % activeVocabulary.length);
          setShowExampleQuestion(false);
          setShowExampleSentence(false);
          setShowSampleAnswer(false);
          setShowTranslation(false);
          setLearningAnswer("");
          setLearningFeedback(null);
          setLiveTranscript("");
          speechFinalRef.current = "";
          return;
        }

        // after 3 skips → force repeat
        retryStore[key] = 0;
        setLearningAnswer("");
        setLearningFeedback(null);
        setShowTranslation(false);
        setShowExampleSentence(false);
        setLiveTranscript("");
        speechFinalRef.current = "";
        return;
      }

      // decrement queue counters
      for (let i = 0; i < queue.length; i++) {
        queue[i].remaining -= 1;
      }

      // check if any word should be reinserted now
      const readyIndex = queue.findIndex((item) => item.remaining <= 0);

      if (readyIndex !== -1) {
        const wordToReinsert = queue[readyIndex].word;
        queue.splice(readyIndex, 1);

        const newIndex = activeVocabulary.findIndex((v) => v.word === wordToReinsert);
        if (newIndex !== -1) {
          setCurrentIndex(newIndex);
        } else {
          setCurrentIndex((prev) => (prev + 1) % activeVocabulary.length);
        }
      } else {
        setCurrentIndex((prev) => {
          let next = (prev + 1) % activeVocabulary.length;
          const now = Date.now();
          const threshold = 1000 * 60 * 60 * 6; // 6h

          // skip recently correct words
          for (let i = 0; i < activeVocabulary.length; i++) {
            const candidate = activeVocabulary[next];
            const data = masteredWords[candidate?.word];
            const isRecent = data?.lastCorrect && (now - data.lastCorrect < threshold);

            if (!isRecent) break;
            next = (next + 1) % activeVocabulary.length;
          }

          return next;
        });
      }

      setShowExampleQuestion(false);
      setShowExampleSentence(false);
      setShowSampleAnswer(false);
      setShowTranslation(false);
      setLearningAnswer("");
      setLearningFeedback(null);
      setLiveTranscript("");
      speechFinalRef.current = "";
    }

    function toggleExclusiveSection(section) {
      const isInterviewTarget = section === "interview";
      const isLearningTarget = section === "learning";
      const isRoleplayTarget = section === "roleplay";
      const isVocabularyTarget = section === "vocabulary";

      if (isLearningTarget && !showLearningMode) {
        setCurrentIndex(0);
        resetLearningCardState();
      }

      const nextInterview = isInterviewTarget ? !showInterviewSection : false;
      const nextLearning = isLearningTarget ? !showLearningMode : false;
      const nextRoleplay = isRoleplayTarget ? !showRoleplaySection : false;
      const nextVocabulary = isVocabularyTarget ? !showVocabulary : false;

      setShowInterviewSection(nextInterview);
      setShowLearningMode(nextLearning);
      setShowRoleplaySection(nextRoleplay);
      setShowVocabulary(nextVocabulary);
    }

    async function submitFeedback() {
      if (!feedbackRating || !feedbackProblem) {
        setFeedbackStatus("Bitte Bewertung und Hauptproblem auswählen.");
        return;
      }

      const feedbackEntry = {
        projectId,
        createdAt: new Date().toISOString(),
        rating: Number(feedbackRating),
        problem: feedbackProblem,
        comment: feedbackText.trim(),
        targetLanguage,
        projectLevel: projectRawLevel || "Anfänger",
        vocabularyCount: coreCount,
        masteredCount,
      };

      try {
        setFeedbackStatus("Feedback wird ans Backend gesendet...");
        const storageKey = "sprachtrainer_feedback";
        const existingFeedback = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
        window.localStorage.setItem(
          storageKey,
          JSON.stringify([...existingFeedback, feedbackEntry])
        );

        console.log("Submitting feedback to backend", apiUrl("/feedback"), feedbackEntry);
        const feedbackResponse = await fetch(apiUrl("/feedback"), {
          method: "POST",
          headers: apiHeaders(),
          body: JSON.stringify(feedbackEntry),
        });

        if (!feedbackResponse.ok) {
          throw new Error("Backend feedback request failed");
        }

        setFeedbackStatus("Danke – dein Feedback wurde gespeichert.");
        setFeedbackRating("");
        setFeedbackProblem("");
        setFeedbackText("");
        setTimeout(() => {
          setShowFeedbackForm(false);
          setFeedbackStatus("");
        }, 1200);
      } catch (err) {
        setFeedbackStatus("Feedback wurde lokal gespeichert, konnte aber nicht ans Backend gesendet werden.");
      }
    }
    const coreTarget = 200;
    const learningTarget = 100;
    const roleplayTarget = 30;
    const coreCount = Array.isArray(vocabulary) ? vocabulary.length : 0;
    const masteredCount = Array.isArray(vocabulary)
      ? vocabulary.filter((item) => item.mastered || masteredWords[item.word]?.mastered).length
      : Object.keys(masteredWords).length;

    const effectiveLevel = projectRawLevel || "Anfänger";
    const isBasicOrHigher =
      effectiveLevel === "Grundkenntnisse" ||
      effectiveLevel === "Fortgeschritten" ||
      effectiveLevel === "Fließend";
    const isAdvancedOrHigher =
      effectiveLevel === "Fortgeschritten" ||
      effectiveLevel === "Fließend";

    const learningUnlocked = isBasicOrHigher || coreCount >= learningTarget;

    const roleplayUnlocked =
      isAdvancedOrHigher ||
      (learningUnlocked && masteredCount >= roleplayTarget);

    const progressPercent = Math.min(100, Math.round((coreCount / coreTarget) * 100));
    const sectionStyle = {
      border: "1px solid #e7e7e7",
      borderRadius: 18,
      padding: 24,
      marginTop: 24,
      background: "#ffffff",
      boxShadow: "0 8px 24px rgba(0, 0, 0, 0.05)",
    };

    const accordionHeaderStyle = {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      width: "100%",
      padding: 0,
      border: "none",
      background: "transparent",
      cursor: "pointer",
      textAlign: "left",
      marginBottom: 12,
    };

    const primaryButtonStyle = {
      padding: "10px 16px",
      borderRadius: 10,
      border: "1px solid #4f8cff",
      background: "linear-gradient(180deg, #5b95ff 0%, #4f8cff 100%)",
      color: "#ffffff",
      cursor: "pointer",
      fontWeight: 600,
      boxShadow: "0 6px 18px rgba(79, 140, 255, 0.22)",
    };

    const secondaryButtonStyle = {
      padding: "10px 16px",
      borderRadius: 10,
      border: "1px solid #d7deea",
      background: "#ffffff",
      color: "#2b2f36",
      cursor: "pointer",
      fontWeight: 500,
    };

    const disabledPrimaryButtonStyle = {
      ...primaryButtonStyle,
      border: "1px solid #cfd8ea",
      background: "#e8edf7",
      color: "#7d8798",
      cursor: "not-allowed",
      boxShadow: "none",
    };

    function getSectionArrow(isOpen) {
      return isOpen ? "▾" : "▸";
    }

  function getTargetText(item) {
    if (!item) return "";
    return item.translation && item.translation.trim().toLowerCase() !== item.word.trim().toLowerCase()
      ? item.translation
      : "Wortschatz wird generiert";
  }

  function getSourceText(item) {
    if (!item) return "";

    const rawWord = String(item.word || "").trim();
    if (!rawWord) return "";

    return rawWord;
  }

  function getPrimaryLanguageLabel() {
    return learningDirection === "target-first"
      ? targetLanguage || "Fremdsprache"
      : sourceLanguage || "Deutsch";
  }

  function getSecondaryLanguageLabel() {
    return learningDirection === "target-first"
      ? sourceLanguage || "Deutsch"
      : targetLanguage || "Fremdsprache";
  }

  function getExampleSentenceText(item) {
    if (!item) return "";

    if (learningDirection === "target-first") {
      return item.example_sentence_target || item.example_sentence || "";
    }

    return item.example_sentence_source || item.example_sentence || "";
  }

  useEffect(() => {
    async function expandCurrentWord() {
      if (!currentWord) return;

      const needsExpansion =
        !currentWord.translation ||
        !currentWord.example_sentence_source ||
        !currentWord.example_sentence_target;

      if (!needsExpansion) return;
      if (expandingWordsRef.current.has(currentWord.word)) return;

      expandingWordsRef.current.add(currentWord.word);
      const encodedWord = encodeURIComponent(currentWord.word);

      try {
        const res = await fetch(
          apiUrl(`/projects/${projectId}/vocabulary/${encodedWord}/expand`),
          {
            method: "POST",
            headers: apiHeaders(),
          }
        );

        if (!res.ok) return;

        const expandedItem = await res.json();

        setVocabulary((prev) =>
          prev.map((item) =>
            item.word === expandedItem.word ? expandedItem : item
          )
        );
      } finally {
        expandingWordsRef.current.delete(currentWord.word);
      }
    }

    expandCurrentWord();
  }, [projectId, currentWord?.word]);

  useEffect(() => {
    if (!showLearningMode) return;
    if (!currentWord) return;
    if (learningDirection !== "target-first") return;

    const spokenText = getTargetText(currentWord);
    if (!spokenText || spokenText === "Wortschatz wird generiert") return;

    const timeoutId = setTimeout(() => {
      speakText(spokenText);
    }, 250);

    return () => clearTimeout(timeoutId);
  }, [showLearningMode, currentWord?.word, learningDirection]);

  useEffect(() => {
    if (!showLearningMode) return;
    if (!currentWord) return;

    setShowTranslation(false);
  }, [showLearningMode, currentWord?.word, learningPhase, learningDirection]);

  useEffect(() => {
    if (!showRoleplaySection) return;
    if (!Array.isArray(roleplayHistory) || roleplayHistory.length === 0) return;

    const visibleMessages = roleplayHistory.filter((msg) => msg.role !== "system");
    const lastMessage = visibleMessages[visibleMessages.length - 1];

    if (!lastMessage || lastMessage.role !== "trainer" || !lastMessage.text) return;

    const lastSpokenKey = window.__lastSpokenRoleplay;
    const currentKey = `${visibleMessages.length}-${lastMessage.text}`;

    if (lastSpokenKey === currentKey) return;
    window.__lastSpokenRoleplay = currentKey;

    const timeoutId = setTimeout(() => {
      speakText(lastMessage.text);
    }, 250);

    return () => clearTimeout(timeoutId);
  }, [showRoleplaySection, roleplayHistory]);

  useEffect(() => {
    async function warmUpVocabulary() {
      if (!projectId || !Array.isArray(vocabulary) || vocabulary.length === 0) return;

      const pendingItems = vocabulary.filter((item) => {
        const needsExpansion =
          !item.translation ||
          !item.example_sentence_source ||
          !item.example_sentence_target;

        return (
          needsExpansion &&
          !backgroundExpandedWordsRef.current.has(item.word) &&
          !expandingWordsRef.current.has(item.word)
        );
      });

      const itemsToWarmUp = pendingItems.slice(0, 1);

      for (const item of itemsToWarmUp) {
        backgroundExpandedWordsRef.current.add(item.word);
        expandingWordsRef.current.add(item.word);

        try {
          const encodedWord = encodeURIComponent(item.word);
          const res = await fetch(
            apiUrl(`/projects/${projectId}/vocabulary/${encodedWord}/expand`),
            {
              method: "POST",
              headers: apiHeaders(),
            }
          );

          if (!res.ok) {
            backgroundExpandedWordsRef.current.delete(item.word);
            expandingWordsRef.current.delete(item.word);
            continue;
          }

          const expandedItem = await res.json();

          setVocabulary((prev) =>
            prev.map((existingItem) =>
              existingItem.word === expandedItem.word ? expandedItem : existingItem
            )
          );
          expandingWordsRef.current.delete(item.word);
        } catch (err) {
          backgroundExpandedWordsRef.current.delete(item.word);
          expandingWordsRef.current.delete(item.word);
        }
      }
    }

    warmUpVocabulary();
  }, [projectId, vocabulary]);

    useEffect(() => {
      const el = interviewInputRef.current;
      if (!el) return;

      const maxHeight = 240;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
      el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
    }, [input]);

  // --- Review status helpers ---
  function getReviewStatusLabel(status) {
    if (status === "approved") return "geprüft";
    if (status === "edited") return "korrigiert";
    if (status === "rejected") return "verworfen";
    return "neu";
  }

  function getReviewBadgeStyle(status) {
    const base = {
      display: "inline-flex",
      alignItems: "center",
      padding: "4px 8px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 600,
      border: "1px solid #d7deea",
    };

    if (status === "approved") {
      return { ...base, background: "#edf9f1", color: "#1f7a3d", border: "1px solid #b9e6c7" };
    }

    if (status === "edited") {
      return { ...base, background: "#fff7e8", color: "#8a5a00", border: "1px solid #ffd98a" };
    }

    if (status === "rejected") {
      return { ...base, background: "#fff1f1", color: "#a33a3a", border: "1px solid #f0b6b6" };
    }

    return { ...base, background: "#eef4ff", color: "#245fd1", border: "1px solid #c8dafd" };
  }

  function getLearningStatusLabel(item) {
    if (!item) return "neu";
    if (item.mastered || masteredWords[item.word]?.mastered) return "gekonnt";
    if (masteredWords[item.word]?.lastWarning) return "fast richtig";
    if (item.last_wrong || (item.wrong_count || 0) > 0 || wrongAnswerWords[item.word]) return "zuletzt falsch";
    return "neu";
  }

  function getLearningStatusText(item) {
    const status = getLearningStatusLabel(item);
    if (status === "gekonnt") return "🟢 gekonnt";
    if (status === "fast richtig") return "🟡 fast";
    if (status === "zuletzt falsch") return "🔴 falsch";
    return "⚪ neu";
  }

  async function markVocabularyItemReviewed(word, reviewStatus = "approved") {
    setVocabulary((prev) =>
      prev.map((item) =>
        item.word === word ? { ...item, review_status: reviewStatus } : item
      )
    );

    try {
      const res = await fetch(
        apiUrl(`/projects/${projectId}/vocabulary/${encodeURIComponent(word)}/update`),
        {
          method: "POST",
          headers: apiHeaders(),
          body: JSON.stringify({ review_status: reviewStatus }),
        }
      );

      if (!res.ok) {
        throw new Error("Review status update failed");
      }
    } catch (err) {
      console.error("Review konnte nicht gespeichert werden", err);
    }
  }

  async function rebuildAllVocabularyCards() {
    if (isRebuildingAllCards) return;

    const confirmed = window.confirm(
      "Alle generierten Karteninhalte zurücksetzen? Übersetzungen und Beispielsätze werden anschließend beim Anzeigen neu erzeugt."
    );

    if (!confirmed) return;

    setIsRebuildingAllCards(true);
    setDiagnosisStatus("Karten werden zurückgesetzt...");

    try {
      const res = await fetch(apiUrl(`/projects/${projectId}/vocabulary/rebuild-all`), {
        method: "POST",
        headers: apiHeaders(),
      });

      if (!res.ok) {
        throw new Error("Rebuild all failed");
      }

      const data = await res.json();
      await loadVocabulary();
      resetLearningCardState();
      setCurrentIndex(0);
      backgroundExpandedWordsRef.current = new Set();
      expandingWordsRef.current = new Set();
      setDiagnosisStatus(`Alle Karten zurückgesetzt (${data.reset_count || 0}).`);
    } catch (err) {
      console.error("Alle Karten konnten nicht zurückgesetzt werden", err);
      setDiagnosisStatus("Alle Karten konnten nicht zurückgesetzt werden.");
    } finally {
      setIsRebuildingAllCards(false);
    }
  }

  function unlockDiagnosis() {
    if (diagnosisPassword === "0000") {
      setDiagnosisUnlocked(true);
      setDiagnosisPassword("");
      setDiagnosisStatus("");
      return;
    }

    setDiagnosisStatus("Falsches Passwort.");
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 32, background: "#fafafa", minHeight: "100vh" }}>
      <a
        href="/"
        style={{
          display: "inline-block",
          marginBottom: 20,
          textDecoration: "none",
          color: "#333",
        }}
      >
        ← Zurück zur Projektübersicht
      </a>

      <h1 style={{ fontSize: 32, fontWeight: "bold", marginBottom: 8 }}>
        Sprachtrainer 5
      </h1>


      {status && (
        <p style={{ marginBottom: 20, color: "#0a7" }}>
          {status}
        </p>
      )}


      <section
        style={{ ...sectionStyle, marginBottom: 24 }}
      >
        <button
          onClick={() => toggleExclusiveSection("interview")}
          style={accordionHeaderStyle}
        >
          <h2 style={{ fontSize: 24, fontWeight: "bold", margin: 0 }}>
            Interview
          </h2>
          <span style={{ fontSize: 24, color: "#4f8cff" }}>
            {getSectionArrow(showInterviewSection)}
          </span>
        </button>

        <p style={{ marginBottom: 16, color: "#555", lineHeight: 1.6 }}>
         Hier bauen wir deinen persönlichen Sprachkern auf. Ein Grundwortschatz, insbesondere 
         zu den im Projekt genannten Themen, ist bereits geladen.
         Je mehr du mir mit deinen Worten erzählst, umso 
          individueller wird dein Sprachtraining.   
          Ziel sind mindestens {coreTarget} Wörter.
        </p>

        {showInterviewSection && (
        <>
            {messages.length === 0 ? (
            <p>Hallo, ich bin dein persönlicher Sprachtrainer. Gleich beginnt das Interview.</p>
            ) : (
            <div style={{ marginTop: 20 }}>
                {messages.map((msg, i) => (
                <div key={i} style={{ marginBottom: 16 }}>
                    <b>{msg.role === "assistant" ? "Interview" : "Du"}:</b>{" "}
                    {msg.text}
                </div>
                ))}
            </div>
            )}

            <div style={{ marginTop: 20 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                <textarea
                    ref={interviewInputRef}
                    value={input}
                    onChange={(e) => {
                        const value = e.target.value;
                        setInput(value);
                        setLiveTranscript(value);
                        speechFinalRef.current = value;
                    }}
                    disabled={isSending}
                    placeholder="Antwort per Tastatur oder Sprache eingeben"
                    rows={1}
                    style={{
                        padding: 12,
                        borderRadius: 10,
                        border: "1px solid #d7deea",
                        width: "70%",
                        minWidth: 260,
                        background: isSending ? "#f5f7fb" : "#ffffff",
                        resize: "none",
                        lineHeight: 1.5,
                        font: "inherit",
                    }}
                />

                <button
                  onClick={() => toggleSpeechInput("interview")}
                disabled={!speechSupported || isSending}
                style={
                    !speechSupported || isSending
                    ? disabledPrimaryButtonStyle
                    : isListening
                    ? {
                        ...primaryButtonStyle,
                        background: "linear-gradient(180deg, #ff8a8a 0%, #ff6b6b 100%)",
                        border: "1px solid #ff6b6b",
                        boxShadow: "0 6px 18px rgba(255, 107, 107, 0.22)",
                        }
                    : secondaryButtonStyle
                }
                >
                {isListening ? `⏺ Aufnahme läuft (${sourceLanguage || "Deutsch"})` : `🎤 Spracheingabe (${sourceLanguage || "Deutsch"})`}
                </button>

                <button
                onClick={sendMessage}
                disabled={isSending}
                style={isSending ? disabledPrimaryButtonStyle : primaryButtonStyle}
                >
                {isSending ? "Analysiere..." : "Senden"}
                </button>
            </div>
                {isListening && (
                   <p style={{ marginTop: 10, color: "#245fd1" }}>
                     Sprich jetzt in {sourceLanguage || "Deutsch"}. Erkannter Text erscheint direkt im Eingabefeld.
                   </p>
                )}
            {!speechSupported && (
                <p style={{ marginTop: 10, color: "#8a4b00" }}>
                Spracheingabe wird in diesem Browser nicht unterstützt.
                </p>
            )}
            </div>
        </>
        )}
      </section>

        <section
            style={sectionStyle}
            >
            <button
                onClick={() => toggleExclusiveSection("learning")}
                style={accordionHeaderStyle}
            >
                <h2 style={{ fontSize: 24, fontWeight: "bold", margin: 0 }}>
                    Lernmodus
                </h2>
                <span style={{ fontSize: 24, color: "#4f8cff" }}>
                    {getSectionArrow(showLearningMode)}
                </span>
            </button>

            {showLearningMode && !learningUnlocked && (
              <div
                style={{
                  padding: 16,
                  borderRadius: 12,
                  background: "#f8f8f8",
                  color: "#444",
                }}
              >
                <p style={{ marginTop: 0 }}>
                  Der Lernmodus wird freigeschaltet, sobald du mindestens {learningTarget} Wörter erkannt hast.
                </p>
                <p style={{ marginBottom: 0, color: "#666" }}>
                  Aktueller Stand: {coreCount} / {learningTarget} Wörter.
                </p>
              </div>
            )}

            {showLearningMode && learningUnlocked && (
              <>
                <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                  <button
                     onClick={() => {
                      setLearningDirection("target-first");
                      resetLearningCardState();
                     }}
                      style={{
                      ...secondaryButtonStyle,
                      background: learningDirection === "target-first" ? "#eef4ff" : "#ffffff",
                      border: learningDirection === "target-first" ? "1px solid #4f8cff" : secondaryButtonStyle.border,
                      color: learningDirection === "target-first" ? "#245fd1" : secondaryButtonStyle.color,
                      }}
                  >
                      {targetLanguage || "Fremdsprache"} zuerst
                  </button>

                  <button
                    onClick={() => {
                      setLearningDirection("source-first");
                      resetLearningCardState();
                    }}
                      style={{
                      ...secondaryButtonStyle,
                      background: learningDirection === "source-first" ? "#eef4ff" : "#ffffff",
                      border: learningDirection === "source-first" ? "1px solid #4f8cff" : secondaryButtonStyle.border,
                      color: learningDirection === "source-first" ? "#245fd1" : secondaryButtonStyle.color,
                      }}
                  >
                      {sourceLanguage || "Deutsch"} zuerst
                  </button>
                </div>

                <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                  <button
                    onClick={() => setLearningPhase("learn")}
                    style={{
                      ...secondaryButtonStyle,
                      background: learningPhase === "learn" ? "#eef4ff" : "#ffffff",
                      border: learningPhase === "learn" ? "1px solid #4f8cff" : secondaryButtonStyle.border,
                      color: learningPhase === "learn" ? "#245fd1" : secondaryButtonStyle.color,
                    }}
                  >
                    Lernen
                  </button>

                  <button
                    onClick={() => setLearningPhase("practice")}
                    style={{
                      ...secondaryButtonStyle,
                      background: learningPhase === "practice" ? "#eef4ff" : "#ffffff",
                      border: learningPhase === "practice" ? "1px solid #4f8cff" : secondaryButtonStyle.border,
                      color: learningPhase === "practice" ? "#245fd1" : secondaryButtonStyle.color,
                    }}
                  >
                    Üben
                  </button>
                </div>

                {!currentWord ? (
                  <p>Noch keine Vokabeln zum Lernen vorhanden.</p>
                ) : (
                  <div
                    style={{
                      border: "1px solid #edf0f3",
                      borderRadius: 14,
                      padding: 20,
                      background: "#fcfcfd",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ fontWeight: "bold", fontSize: 28 }}>
                        {learningDirection === "target-first"
                          ? getTargetText(currentWord)
                          : getSourceText(currentWord)}
                      </div>

                      <span style={getReviewBadgeStyle(
                        getLearningStatusLabel(currentWord) === "gekonnt"
                          ? "approved"
                          : getLearningStatusLabel(currentWord) === "fast richtig"
                          ? "edited"
                          : getLearningStatusLabel(currentWord) === "zuletzt falsch"
                          ? "rejected"
                          : "new"
                      )}>
                        {getLearningStatusText(currentWord)}
                      </span>
                      {diagnosisUnlocked && (
                        <span style={getReviewBadgeStyle(currentWord.review_status)}>
                          {getReviewStatusLabel(currentWord.review_status)}
                        </span>
                      )}

                      {learningDirection === "target-first" && (
                        <button
                          onClick={() => speakText(getTargetText(currentWord))}
                          type="button"
                          aria-label="Wort vorlesen"
                          title="Wort vorlesen"
                          style={{
                            ...secondaryButtonStyle,
                            padding: "6px 10px",
                            minWidth: "auto",
                            lineHeight: 1,
                          }}
                        >
                          🔊
                        </button>
                      )}
                    </div>

                    {diagnosisUnlocked && (
                      <>
                        <div style={{ color: "#666", marginTop: 6 }}>
                          Typ: {currentWord.category === "noun" ? "Nomen" : currentWord.category}
                        </div>

                        <div style={{ color: "#666", marginTop: 4 }}>
                          Quelle: {
                            currentWord.source === "base_core"
                              ? "Grundwortschatz"
                              : currentWord.source === "situation_core"
                              ? "Intelligent ergänzt"
                              : "Aus deinem Interview"
                          }
                        </div>
                      </>
                    )}
                    {learningPhase === "practice" ? (
                      <>
                        {getExampleSentenceText(currentWord) && (
                          <div
                            style={{
                              marginTop: 18,
                              padding: 14,
                              background: "#f8f8f8",
                              borderRadius: 10,
                              color: "#444",
                              lineHeight: 1.5,
                            }}
                          >
                            <strong>Bsp:</strong> {getExampleSentenceText(currentWord)}
                          </div>
                        )}
                        <div style={{ marginTop: 20 }}>
                          <div style={{ fontWeight: 600, marginBottom: 8 }}>
                            Deine Übersetzung
                          </div>
                          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                            <input
                              ref={learningInputRef}
                              value={learningAnswer}
                              onChange={(e) => {
                                const value = e.target.value;
                                setLearningAnswer(value);
                                setLiveTranscript(value);
                                speechFinalRef.current = value;
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  e.stopPropagation();

                                  if (learningFeedback) {
                                    nextWord();
                                  } else if (learningAnswer.trim()) {
                                    submitLearningAnswer();
                                  }

                                  setTimeout(() => {
                                    learningInputRef.current?.focus();
                                  }, 0);
                                }
                              }}
                              placeholder={`Übersetze in ${getSecondaryLanguageLabel()}`}
                              style={{
                                padding: 12,
                                borderRadius: 10,
                                border: "1px solid #d7deea",
                                width: "100%",
                                maxWidth: 420,
                                background: "#ffffff",
                              }}
                            />

                            <button
                              onClick={() => toggleSpeechInput("learning")}
                              onMouseDown={(e) => e.preventDefault()}
                              tabIndex={-1}
                              disabled={!speechSupported || isSending}
                              style={
                                !speechSupported || isSending
                                  ? disabledPrimaryButtonStyle
                                  : isListening && activeSpeechField === "learning"
                                  ? {
                                      ...primaryButtonStyle,
                                      background: "linear-gradient(180deg, #ff8a8a 0%, #ff6b6b 100%)",
                                      border: "1px solid #ff6b6b",
                                      boxShadow: "0 6px 18px rgba(255, 107, 107, 0.22)",
                                    }
                                  : secondaryButtonStyle
                              }
                            >
                              {isListening && activeSpeechField === "learning"
                                ? `⏺ Aufnahme läuft (${getSecondaryLanguageLabel()})`
                                : `🎤 Spracheingabe (${getSecondaryLanguageLabel()})`}
                            </button>
                          </div>
                        </div>

                        {isListening && activeSpeechField === "learning" && (
                          <p style={{ marginTop: 10, marginBottom: 0, color: "#245fd1" }}>
                            Sprich jetzt in {getSecondaryLanguageLabel()}. Erkannter Text erscheint direkt im Eingabefeld.
                          </p>
                        )}

                        <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
                          <button
                            onClick={submitLearningAnswer}
                            style={
                              learningFeedback
                                ? secondaryButtonStyle
                                : learningAnswer.trim()
                                ? primaryButtonStyle
                                : secondaryButtonStyle
                            }
                          >
                            Prüfen
                          </button>
                          <button
                            onClick={nextWord}
                            style={learningFeedback ? primaryButtonStyle : secondaryButtonStyle}
                          >
                            Nächstes Wort
                          </button>
                          {diagnosisUnlocked && (
                            <>
                              <button
                                onClick={() => markVocabularyItemReviewed(currentWord.word, "approved")}
                                style={secondaryButtonStyle}
                              >
                                ✅ Karte passt
                              </button>
                              <button
                                onClick={() => markVocabularyItemReviewed(currentWord.word, "edited")}
                                style={secondaryButtonStyle}
                              >
                                ✏️ Korrektur nötig
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => setShowTranslation((prev) => !prev)}
                            style={secondaryButtonStyle}
                          >
                            {showTranslation ? "Zurück zur Vorderseite" : "Übersetzung anzeigen"}
                          </button>

                        </div>

                        {learningFeedback && (
                          <div
                            style={{
                              marginTop: 16,
                              padding: 14,
                              borderRadius: 10,
                              background:
                                learningFeedback.type === "success"
                                  ? "#edf9f1"
                                  : learningFeedback.type === "warning"
                                  ? "#fff7e8"
                                  : "#fff1f1",
                              color:
                                learningFeedback.type === "success"
                                  ? "#1f7a3d"
                                  : learningFeedback.type === "warning"
                                  ? "#8a5a00"
                                  : "#a33a3a",
                            }}
                          >
                            {(learningFeedback.type === "success" ? "✅ " : learningFeedback.type === "warning" ? "🟡 " : "❌ ") + learningFeedback.text}
                            {learningFeedback.type === "error" && (
                              <div style={{ marginTop: 10 }}>
                                <button
                                  disabled={isRebuildingCard}
                                  onClick={async () => {
                                    if (isRebuildingCard) return;
                                    setIsRebuildingCard(true);

                                    try {
                                      const res = await fetch(apiUrl(`/projects/${projectId}/vocabulary/${encodeURIComponent(currentWord.word)}/rebuild`), {
                                        method: "POST",
                                        headers: apiHeaders(),
                                      });

                                      if (!res.ok) return;

                                      const rebuiltItem = await res.json();

                                      await fetch(apiUrl(`/projects/${projectId}/vocabulary/${encodeURIComponent(currentWord.word)}/expand`), {
                                        method: "POST",
                                        headers: apiHeaders(),
                                      });

                                      setVocabulary((prev) =>
                                        prev.map((item) =>
                                          item.word === rebuiltItem.word ? rebuiltItem : item
                                        )
                                      );

                                      setLearningFeedback({
                                        type: "success",
                                        text: "Karte neu aufgebaut. Bitte kurz prüfen, ob die Übersetzung jetzt passt.",
                                      });
                                      setShowTranslation(true);
                                    } finally {
                                      setIsRebuildingCard(false);
                                    }
                                  }}
                                  style={secondaryButtonStyle}
                                >
                                  {isRebuildingCard ? "Baue neu..." : "Fehler melden"}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div style={{ marginTop: 20, color: "#555", lineHeight: 1.6 }}>
                          Höre dir das Wort an, blende die Übersetzung ein und schau dir den Beispielsatz an. Im Modus „Üben“ kannst du dann selbst antworten.
                        </div>
                        {getExampleSentenceText(currentWord) && (
                          <div
                            style={{
                              marginTop: 18,
                              padding: 14,
                              background: "#f8f8f8",
                              borderRadius: 10,
                              color: "#444",
                              lineHeight: 1.5,
                            }}
                          >
                            <strong>Bsp:</strong> {getExampleSentenceText(currentWord)}
                          </div>
                        )}

                        <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
                          <button
                            onClick={nextWord}
                            style={primaryButtonStyle}
                          >
                            Nächstes Wort
                          </button>
                          {diagnosisUnlocked && (
                            <>
                              <button
                                onClick={() => markVocabularyItemReviewed(currentWord.word, "approved")}
                                style={secondaryButtonStyle}
                              >
                                ✅ Karte passt
                              </button>
                              <button
                                onClick={() => markVocabularyItemReviewed(currentWord.word, "edited")}
                                style={secondaryButtonStyle}
                              >
                                ✏️ Korrektur nötig
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => setShowTranslation((prev) => !prev)}
                            style={secondaryButtonStyle}
                          >
                            {showTranslation ? "Zurück zur Vorderseite" : "Übersetzung anzeigen"}
                          </button>

                        </div>
                      </>
                    )}

                  {showExampleSentence && getExampleSentenceText(currentWord) && !showTranslation && (
                      <div
                        style={{
                          marginTop: 20,
                          padding: 16,
                          background: "#f8f8f8",
                          borderRadius: 8,
                        }}
                      >
                        <div style={{ fontWeight: "bold", marginBottom: 6 }}>
                          Beispielsatz
                        </div>
                        <div>{getExampleSentenceText(currentWord)}</div>
                      </div>
                    )}

                    {showTranslation && (
                      <div
                        style={{
                          marginTop: 20,
                          padding: 16,
                          background: "#f8f8f8",
                          borderRadius: 8,
                        }}
                      >
                        <div style={{ fontWeight: "bold", marginBottom: 4 }}>
                          {getSecondaryLanguageLabel()}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            flexWrap: "wrap",
                            marginBottom: 16,
                          }}
                        >
                          <div style={{ fontSize: 20 }}>
                            {learningDirection === "target-first"
                              ? getSourceText(currentWord)
                              : getTargetText(currentWord)}
                          </div>

                          {learningDirection !== "target-first" && (
                            <button
                              onClick={() => speakText(getTargetText(currentWord))}
                              type="button"
                              aria-label="Wort vorlesen"
                              title="Wort vorlesen"
                              style={{
                                ...secondaryButtonStyle,
                                padding: "6px 10px",
                                minWidth: "auto",
                                lineHeight: 1,
                              }}
                            >
                              🔊
                            </button>
                          )}
                        </div>

                        {currentWord.example_sentence_source && (
                          <div style={{ marginTop: 16 }}>
                            <div style={{ fontWeight: "bold", marginBottom: 6 }}>
                              Beispielsatz auf {getSecondaryLanguageLabel()}
                            </div>
                            <div>{currentWord.example_sentence_source}</div>
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                )}
              </>
            )}
            </section>
            <section
                style={sectionStyle}
                >
                <button
                    onClick={() => toggleExclusiveSection("roleplay")}
                    style={accordionHeaderStyle}
                >
                    <h2 style={{ fontSize: 24, fontWeight: "bold", margin: 0 }}>
                        Rollenspiel
                    </h2>
                    <span style={{ fontSize: 24, color: "#4f8cff" }}>
                        {getSectionArrow(showRoleplaySection)}
                    </span>
                </button>

                {showRoleplaySection && !roleplayUnlocked && (
                  <div
                    style={{
                      padding: 16,
                      borderRadius: 12,
                      background: "#f8f8f8",
                      color: "#444",
                    }}
                  >
                    <p style={{ marginTop: 0 }}>
                      Das Rollenspiel wird freigeschaltet, sobald du mindestens {roleplayTarget} Vokabeln im Lernmodus beherrschst.
                    </p>
                    <p style={{ marginBottom: 0, color: "#666" }}>
                      Aktueller Stand: {masteredCount} / {roleplayTarget} beherrschte Vokabeln.
                    </p>
                  </div>
                )}

                {showRoleplaySection && roleplayUnlocked && (
                  <>
                    {!roleplay ? (
                        <div>
                        <p>Noch kein Rollenspiel gestartet.</p>
                        <button
                            onClick={startRoleplay}
                            style={primaryButtonStyle}
                        >
                            Rollenspiel starten
                        </button>
                        </div>
                    ) : (
                        <div
                        style={{
                            border: "1px solid #edf0f3",
                            borderRadius: 14,
                            padding: 20,
                            background: "#fcfcfd",
                        }}
                        >
                        <div style={{ marginBottom: 12 }}>
                            <b>Situation:</b> {roleplay}
                        </div>

                        <div style={{ display: "grid", gap: 10 }}>
                            {Array.isArray(roleplayHistory) &&
                                roleplayHistory
                                    .filter((msg) => msg.role !== "system")
                                    .map((msg, i) => (
                            <div
                                key={i}
                                style={{
                                padding: 10,
                                borderRadius: 8,
                                background:
                                    msg.role === "trainer"
                                    ? "#f8f8f8"
                                    : msg.role === "learner"
                                    ? "#eef6ff"
                                    : "#fff",
                                display: "flex",
                                alignItems: "flex-start",
                                gap: 10,
                                flexWrap: "wrap",
                                }}
                            >
                                <div style={{ flex: 1, minWidth: 220 }}>
                                <b>
                                {msg.role === "trainer"
                                    ? "Trainer"
                                    : msg.role === "learner"
                                    ? "Du"
                                    : "Situation"}
                                :
                                </b>{" "}
                                {msg.text}
                                </div>

                                {msg.role === "trainer" && (
                                <button
                                    onClick={() => speakText(msg.text)}
                                    type="button"
                                    aria-label="Nachricht vorlesen"
                                    title="Nachricht vorlesen"
                                    style={{
                                    ...secondaryButtonStyle,
                                    padding: "6px 10px",
                                    minWidth: "auto",
                                    lineHeight: 1,
                                    }}
                                >
                                    🔊
                                </button>
                                )}
                            </div>
                            ))}
                        </div>

                        <div style={{ marginTop: 16 }}>
                            <input
                              value={roleplayInput}
                              onChange={(e) => setRoleplayInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  sendRoleplayMessage();
                                }
                              }}
                              disabled={isRoleplaySending}
                              style={{
                                  padding: 12,
                                  borderRadius: 8,
                                  border: "1px solid #ccc",
                                  width: "70%",
                              }}
                            />

                            <button
                              onClick={() => toggleSpeechInput("roleplay")}
                              disabled={!speechSupported || isRoleplaySending}
                              style={
                                !speechSupported || isRoleplaySending
                                  ? disabledPrimaryButtonStyle
                                  : isListening && activeSpeechField === "roleplay"
                                  ? {
                                      ...primaryButtonStyle,
                                      background: "linear-gradient(180deg, #ff8a8a 0%, #ff6b6b 100%)",
                                      border: "1px solid #ff6b6b",
                                      boxShadow: "0 6px 18px rgba(255, 107, 107, 0.22)",
                                    }
                                  : secondaryButtonStyle
                              }
                            >
                              {isListening && activeSpeechField === "roleplay"
                                ? `⏺ Aufnahme läuft (${targetLanguage || "Fremdsprache"})`
                                : `🎤 Spracheingabe (${targetLanguage || "Fremdsprache"})`}
                            </button>

                            <button
                                onClick={sendRoleplayMessage}
                                disabled={isRoleplaySending}
                                style={{
                                    ...(isRoleplaySending ? disabledPrimaryButtonStyle : primaryButtonStyle),
                                    marginLeft: 10,
                                }}
                            >
                            {isRoleplaySending ? "Analysiere..." : "Antworten"}
                            </button>
                        </div>
                        </div>
                    )}
                  </>
                )}
                </section>
        <div
            style={{
                marginBottom: 24,
                marginTop: 24,
                padding: 18,
                borderRadius: 16,
                background: "#ffffff",
                border: "1px solid #e7e7e7",
                boxShadow: "0 8px 24px rgba(0, 0, 0, 0.05)",
            }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 12 }}>
            <b>Sprachkern-Fortschritt</b>
            <span>{coreCount} / {coreTarget} Wörter</span>
          </div>
          <div
            style={{
              height: 10,
              borderRadius: 999,
              background: "#edf2f7",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${progressPercent}%`,
                height: "100%",
                background: "linear-gradient(90deg, #4f8cff 0%, #6aa8ff 100%)",
                borderRadius: 999,
              }}
            />
          </div>


          <div style={{ marginTop: 18, display: "grid", gap: 8, color: "#555" }}>
            <div>Startniveau: {effectiveLevel}</div>
            <div>Beherrschte Vokabeln im Lernmodus: {masteredCount} / {roleplayTarget}</div>
            <div>
              Lernmodus: {learningUnlocked ? "freigeschaltet" : `gesperrt bis ${learningTarget} Wörter`}
            </div>
            <div>
              Rollenspiel: {roleplayUnlocked ? "freigeschaltet" : `gesperrt bis ${roleplayTarget} beherrschte Vokabeln`}
            </div>
          </div>
        </div>
        <section style={{ ...sectionStyle, marginBottom: 24 }}>
          <button
            onClick={() => setShowDiagnosisLogin((prev) => !prev)}
            style={accordionHeaderStyle}
          >
            <h2 style={{ fontSize: 24, fontWeight: "bold", margin: 0 }}>
              Diagnose
            </h2>
            <span style={{ fontSize: 24, color: "#4f8cff" }}>
              {getSectionArrow(showDiagnosisLogin)}
            </span>
          </button>

          {!diagnosisUnlocked ? (
            showDiagnosisLogin && (
              <div style={{ display: "grid", gap: 10, maxWidth: 360 }}>
                <p style={{ margin: 0, color: "#555" }}>
                  Diagnosefunktionen sind ausgeblendet. Passwort eingeben, um Kartenprüfung und Rohdaten anzuzeigen.
                </p>
                <input
                  type="password"
                  value={diagnosisPassword}
                  onChange={(e) => setDiagnosisPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      unlockDiagnosis();
                    }
                  }}
                  placeholder="Passwort"
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    border: "1px solid #d7deea",
                    background: "#ffffff",
                  }}
                />
                {diagnosisStatus && (
                  <p style={{ margin: 0, color: "#a33a3a" }}>{diagnosisStatus}</p>
                )}
                <button onClick={unlockDiagnosis} style={primaryButtonStyle}>
                  Diagnose freischalten
                </button>
              </div>
            )
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              <p style={{ margin: 0, color: "#1f7a3d" }}>
                Diagnose ist aktiv. Review-Badges, Typen, Quellen und Kartenprüfungen werden angezeigt.
              </p>
              {diagnosisStatus && (
                <p style={{ margin: 0, color: diagnosisStatus.includes("nicht") ? "#a33a3a" : "#1f7a3d" }}>
                  {diagnosisStatus}
                </p>
              )}
              <button
                onClick={rebuildAllVocabularyCards}
                disabled={isRebuildingAllCards}
                style={isRebuildingAllCards ? disabledPrimaryButtonStyle : secondaryButtonStyle}
              >
                {isRebuildingAllCards ? "Setze Karten zurück..." : "🔄 Alle Karten neu aufbauen"}
              </button>
              <button
                onClick={() => {
                  setDiagnosisUnlocked(false);
                  setShowDiagnosisLogin(false);
                }}
                style={secondaryButtonStyle}
              >
                Diagnose ausblenden
              </button>
            </div>
          )}
        </section>
        <section
        style={sectionStyle}
        >
        <button
            onClick={() => toggleExclusiveSection("vocabulary")}
            style={accordionHeaderStyle}
        >
          <h2 style={{ fontSize: 24, fontWeight: "bold", margin: 0 }}>
            Karteikarten
          </h2>
          <span style={{ fontSize: 24, color: "#4f8cff" }}>
            {getSectionArrow(showVocabulary)}
          </span>
        </button>

        {showVocabulary && (
            <>
            {vocabulary.length === 0 ? (
                <p>Noch keine Vokabeln vorhanden.</p>
            ) : (
                <div style={{ display: "grid", gap: 12 }}>
                {vocabulary.map((item, i) => (
                    <div
                    key={i}
                    style={{
                        border: "1px solid #edf0f3",
                        borderRadius: 14,
                        padding: 18,
                        background: "#fcfcfd",
                    }}
                    >
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ color: "#666", fontSize: 14 }}>
                        {getPrimaryLanguageLabel()}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          flexWrap: "wrap",
                        }}
                      >
                        <div style={{ fontSize: 18, fontWeight: "bold", color: "#444" }}>
                          {learningDirection === "target-first"
                            ? getTargetText(item)
                            : getSourceText(item)}
                        </div>

                        <span style={getReviewBadgeStyle(
                          getLearningStatusLabel(item) === "gekonnt"
                            ? "approved"
                            : getLearningStatusLabel(item) === "fast richtig"
                            ? "edited"
                            : getLearningStatusLabel(item) === "zuletzt falsch"
                            ? "rejected"
                            : "new"
                        )}>
                          {getLearningStatusText(item)}
                        </span>
                        {diagnosisUnlocked && (
                          <span style={getReviewBadgeStyle(item.review_status)}>
                            {getReviewStatusLabel(item.review_status)}
                          </span>
                        )}

                        {learningDirection === "target-first" && (
                          <button
                            onClick={() => speakText(getTargetText(item))}
                            type="button"
                            aria-label="Wort vorlesen"
                            title="Wort vorlesen"
                            style={{
                              ...secondaryButtonStyle,
                              padding: "6px 10px",
                              minWidth: "auto",
                              lineHeight: 1,
                            }}
                          >
                            🔊
                          </button>
                        )}
                      </div>
                    </div>

                    <div style={{ marginBottom: 8 }}>
                      <div style={{ color: "#666", fontSize: 14 }}>
                        {getSecondaryLanguageLabel()}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          flexWrap: "wrap",
                        }}
                      >
                        <div style={{ fontWeight: "bold", fontSize: 18 }}>
                          {learningDirection === "target-first"
                            ? getSourceText(item)
                            : getTargetText(item)}
                        </div>

                        {learningDirection !== "target-first" && (
                          <button
                            onClick={() => speakText(getTargetText(item))}
                            type="button"
                            aria-label="Wort vorlesen"
                            title="Wort vorlesen"
                            style={{
                              ...secondaryButtonStyle,
                              padding: "6px 10px",
                              minWidth: "auto",
                              lineHeight: 1,
                            }}
                          >
                            🔊
                          </button>
                        )}
                      </div>
                    </div>

                    {diagnosisUnlocked && (
                      <>
                        <div style={{ color: "#666", marginTop: 6 }}>
                            Typ: {item.category === "noun" ? "Nomen" : item.category}
                        </div>

                        <div style={{ color: "#666", marginTop: 4 }}>
                            Quelle: {
                            item.source === "base_core"
                                ? "Grundwortschatz"
                                : item.source === "situation_core"
                                ? "Aus Kontext ergänzt"
                                : "Aus deinem Interview"
                            }
                        </div>
                        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                          <button
                            onClick={() => markVocabularyItemReviewed(item.word, "approved")}
                            style={secondaryButtonStyle}
                          >
                            ✅ Karte passt
                          </button>
                          <button
                            onClick={() => markVocabularyItemReviewed(item.word, "edited")}
                            style={secondaryButtonStyle}
                          >
                            ✏️ Korrektur nötig
                          </button>
                        </div>
                      </>
                    )}
 
    
                    {item.example_sentence_target ? (
                      <div style={{ marginTop: 8 }}>
                       <strong>Beispielsatz ({targetLanguage || "Fremdsprache"}):</strong> {item.example_sentence_target}
                      </div>
                    ) : (
                      <div style={{ marginTop: 8 }}>
                        Beispiel wird generiert
                      </div>
                    )}

                    {item.example_sentence_source && (
                      <div style={{ marginTop: 6, color: "#555" }}>
                        <strong>Übersetzung ({sourceLanguage || "Deutsch"}):</strong> {item.example_sentence_source}
                      </div>
                    )}
                    </div>
                ))}
                </div>
            )}
            </>
        )}
        </section>

        <section style={{ ...sectionStyle, marginBottom: 24 }}>
          <button
            onClick={() => setShowFeedbackForm((prev) => !prev)}
            style={accordionHeaderStyle}
          >
            <h2 style={{ fontSize: 24, fontWeight: "bold", margin: 0 }}>
              Feedback
            </h2>
            <span style={{ fontSize: 24, color: "#4f8cff" }}>
              {getSectionArrow(showFeedbackForm)}
            </span>
          </button>

          {!showFeedbackForm ? (
            <p style={{ margin: 0, color: "#555", lineHeight: 1.6 }}>
              Hilf uns, den Sprachtrainer schneller besser zu machen.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>
                  Wie hilfreich war diese Session?
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <button
                      key={rating}
                      type="button"
                      onClick={() => setFeedbackRating(String(rating))}
                      style={{
                        ...secondaryButtonStyle,
                        background: feedbackRating === String(rating) ? "#eef4ff" : "#ffffff",
                        border: feedbackRating === String(rating) ? "1px solid #4f8cff" : secondaryButtonStyle.border,
                        color: feedbackRating === String(rating) ? "#245fd1" : secondaryButtonStyle.color,
                      }}
                    >
                      {rating} ★
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>
                  Was war das Hauptproblem?
                </div>
                <select
                  value={feedbackProblem}
                  onChange={(e) => setFeedbackProblem(e.target.value)}
                  style={{
                    width: "100%",
                    padding: 12,
                    borderRadius: 10,
                    border: "1px solid #d7deea",
                    background: "#ffffff",
                  }}
                >
                  <option value="">Bitte auswählen</option>
                  <option value="flow_unclear">Ich wusste nicht, was ich tun soll</option>
                  <option value="too_hard">Zu schwer</option>
                  <option value="too_easy">Zu leicht</option>
                  <option value="wrong_vocabulary">Vokabeln oder Übersetzungen waren falsch</option>
                  <option value="questions_unclear">Fragen waren unklar oder unpassend</option>
                  <option value="speech_issue">Spracheingabe oder Audio hat nicht funktioniert</option>
                  <option value="other">Etwas anderes</option>
                </select>
              </div>

              <div>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>
                  Was sollte als Nächstes besser werden?
                </div>
                <textarea
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="Optional: kurze Beschreibung"
                  rows={4}
                  style={{
                    width: "100%",
                    padding: 12,
                    borderRadius: 10,
                    border: "1px solid #d7deea",
                    resize: "vertical",
                    font: "inherit",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {feedbackStatus && (
                <p style={{ margin: 0, color: feedbackStatus.startsWith("Danke") ? "#0a7" : "#a33a3a" }}>
                  {feedbackStatus}
                </p>
              )}

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button onClick={submitFeedback} style={primaryButtonStyle}>
                  Feedback absenden
                </button>
                <button
                  onClick={() => {
                    setShowFeedbackForm(false);
                    setFeedbackStatus("");
                  }}
                  style={secondaryButtonStyle}
                >
                  Abbrechen
                </button>
              </div>
            </div>
          )}
        </section>
    </main>
  );
}