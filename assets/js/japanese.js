import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// Fill these two values after creating your Supabase project.
// The anon key is designed to be used in browser apps; security is enforced by RLS.
const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

const configured = !SUPABASE_URL.startsWith("YOUR_") && !SUPABASE_ANON_KEY.startsWith("YOUR_");
const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const app = document.querySelector(".jp-app");
const authCard = document.getElementById("jpAuthCard");
const privateApp = document.getElementById("jpPrivateApp");
const loginForm = document.getElementById("jpLoginForm");
const loginStatus = document.getElementById("jpLoginStatus");
const signOut = document.getElementById("jpSignOut");
const userEmail = document.getElementById("jpUserEmail");

let currentUser = null;
let queue = [];
let currentIndex = 0;
let reviewedThisSession = 0;

async function setAuthState(session) {
  currentUser = session?.user || null;

  if (!currentUser) {
    authCard?.classList.remove("hidden");
    privateApp?.classList.add("hidden");
    if (userEmail) userEmail.textContent = "";
    return;
  }

  const { data: accessRow, error: accessError } = await supabase
    .from("japanese_access")
    .select("user_id")
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if (accessError || !accessRow) {
    await supabase.auth.signOut();
    authCard?.classList.remove("hidden");
    privateApp?.classList.add("hidden");
    if (loginStatus) loginStatus.textContent = "This account is not approved for the Japanese study area.";
    return;
  }

  authCard?.classList.add("hidden");
  privateApp?.classList.remove("hidden");
  if (userEmail) userEmail.textContent = currentUser.email || "";
  if (app?.dataset.jpView === "deck") loadDeck();
}

if (!configured) {
  if (loginStatus) {
    loginStatus.textContent = "Setup required: add your Supabase URL and publishable key in assets/js/japanese.js.";
  }
  loginForm?.querySelector("button")?.setAttribute("disabled", "disabled");
} else {
  const { data: { session } } = await supabase.auth.getSession();
  setAuthState(session);

  supabase.auth.onAuthStateChange((_event, session) => {
    setAuthState(session);
  });
}

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase) return;

  loginStatus.textContent = "Signing in…";
  const email = document.getElementById("jpEmail").value.trim();
  const password = document.getElementById("jpPassword").value;

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  loginStatus.textContent = error ? error.message : "";
});

signOut?.addEventListener("click", async () => {
  if (!supabase) return;
  await supabase.auth.signOut();
  window.location.href = "/japanese/";
});

async function loadDeck() {
  const slug = app.dataset.deckSlug;
  if (!slug || !currentUser) return;

  const now = new Date().toISOString();
  const { data: cards, error } = await supabase
    .from("japanese_cards")
    .select("id, deck_slug, sort_order, prompt, reading, meaning, note, group_label, japanese_user_progress!left(due_at, interval_days, ease_factor, repetitions, lapses, last_rating)")
    .eq("deck_slug", slug)
    .eq("is_active", true)
    .order("sort_order");

  if (error) {
    showDeckError(error.message);
    return;
  }

  queue = (cards || []).filter((card) => {
    const progress = Array.isArray(card.japanese_user_progress) ? card.japanese_user_progress[0] : card.japanese_user_progress;
    return !progress?.due_at || progress.due_at <= now;
  }).map((card) => ({
    ...card,
    progress: Array.isArray(card.japanese_user_progress) ? card.japanese_user_progress[0] : card.japanese_user_progress
  }));

  currentIndex = 0;
  reviewedThisSession = 0;
  updateStats(cards || []);
  showCurrentCard();
}

function updateStats(allCards) {
  const due = queue.length;
  const fresh = allCards.filter((card) => {
    const p = Array.isArray(card.japanese_user_progress) ? card.japanese_user_progress[0] : card.japanese_user_progress;
    return !p;
  }).length;

  document.getElementById("jpDueCount").textContent = due;
  document.getElementById("jpNewCount").textContent = fresh;
  document.getElementById("jpReviewedCount").textContent = reviewedThisSession;
}

function showCurrentCard() {
  const studyArea = document.getElementById("jpStudyArea");
  const empty = document.getElementById("jpDeckEmpty");
  const answer = document.getElementById("jpCardAnswer");
  const ratingGrid = document.getElementById("jpRatingGrid");
  const revealButton = document.getElementById("jpShowAnswer");

  if (!queue.length || currentIndex >= queue.length) {
    studyArea?.classList.add("hidden");
    empty?.classList.remove("hidden");
    return;
  }

  studyArea?.classList.remove("hidden");
  empty?.classList.add("hidden");
  answer?.classList.add("hidden");
  ratingGrid?.classList.add("hidden");
  revealButton?.classList.remove("hidden");

  const card = queue[currentIndex];
  document.getElementById("jpCardWord").textContent = card.prompt;
  document.getElementById("jpCardReading").textContent = card.reading;
  document.getElementById("jpCardMeaning").textContent = card.meaning;
  document.getElementById("jpCardNote").textContent = card.note || "";
  document.getElementById("jpCardGroup").textContent = card.group_label || "Reading";
  document.getElementById("jpProgressText").textContent = `Card ${currentIndex + 1} of ${queue.length}`;
  document.getElementById("jpProgressBar").style.width = `${((currentIndex + 1) / queue.length) * 100}%`;
}

function revealAnswer() {
  document.getElementById("jpCardAnswer")?.classList.remove("hidden");
  document.getElementById("jpRatingGrid")?.classList.remove("hidden");
  document.getElementById("jpShowAnswer")?.classList.add("hidden");
}

document.getElementById("jpShowAnswer")?.addEventListener("click", revealAnswer);

document.querySelectorAll(".jp-rating").forEach((button) => {
  button.addEventListener("click", () => rateCard(button.dataset.rating));
});

async function rateCard(rating) {
  const card = queue[currentIndex];
  if (!card || !currentUser) return;

  const existing = card.progress || {};
  const repetitions = Number(existing.repetitions || 0);
  const currentInterval = Number(existing.interval_days || 0);
  let ease = Number(existing.ease_factor || 2.5);
  let intervalDays = currentInterval;
  let newRepetitions = repetitions;
  let lapses = Number(existing.lapses || 0);

  if (rating === "again") {
    intervalDays = 10 / 1440;
    newRepetitions = 0;
    lapses += 1;
    ease = Math.max(1.3, ease - 0.2);
  } else if (rating === "hard") {
    intervalDays = repetitions === 0 ? 1 : Math.max(1, currentInterval * 1.2);
    newRepetitions += 1;
    ease = Math.max(1.3, ease - 0.15);
  } else if (rating === "good") {
    intervalDays = repetitions === 0 ? 1 : repetitions === 1 ? 3 : Math.max(1, currentInterval * ease);
    newRepetitions += 1;
  } else if (rating === "easy") {
    intervalDays = repetitions === 0 ? 4 : Math.max(4, currentInterval * ease * 1.3);
    newRepetitions += 1;
    ease += 0.15;
  }

  const dueAt = new Date(Date.now() + intervalDays * 86400000).toISOString();

  const { error } = await supabase.from("japanese_user_progress").upsert({
    user_id: currentUser.id,
    card_id: card.id,
    due_at: dueAt,
    interval_days: intervalDays,
    ease_factor: ease,
    repetitions: newRepetitions,
    lapses,
    last_rating: rating,
    last_reviewed_at: new Date().toISOString()
  }, { onConflict: "user_id,card_id" });

  if (error) {
    showDeckError(error.message);
    return;
  }

  reviewedThisSession += 1;
  document.getElementById("jpReviewedCount").textContent = reviewedThisSession;
  currentIndex += 1;
  showCurrentCard();
}

function showDeckError(message) {
  const empty = document.getElementById("jpDeckEmpty");
  document.getElementById("jpStudyArea")?.classList.add("hidden");
  if (empty) {
    empty.classList.remove("hidden");
    empty.innerHTML = `<h2>Could not load this deck.</h2><p class="jp-muted">${escapeHtml(message)}</p>`;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);
}

document.addEventListener("keydown", (event) => {
  if (app?.dataset.jpView !== "deck" || !currentUser) return;
  const answerVisible = !document.getElementById("jpCardAnswer")?.classList.contains("hidden");

  if (event.code === "Space" && !answerVisible) {
    event.preventDefault();
    revealAnswer();
  } else if (answerVisible && ["1", "2", "3", "4"].includes(event.key)) {
    const rating = { "1": "again", "2": "hard", "3": "good", "4": "easy" }[event.key];
    rateCard(rating);
  }
});