const CONTACT_EMAIL = "iemin.ym@gmail.com";

const root = document.documentElement;
const themeToggle = document.getElementById("themeToggle");
const menuToggle = document.getElementById("menuToggle");
const navLinks = document.getElementById("navLinks");
const siteHeader = document.getElementById("siteHeader");

function preferredTheme() {
  const saved = localStorage.getItem("portfolio-theme");
  if (saved === "dark" || saved === "light") return saved;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function setTheme(theme) {
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  localStorage.setItem("portfolio-theme", theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#0b0f14" : "#f6f7f9");
}

setTheme(preferredTheme());

themeToggle?.addEventListener("click", () => {
  setTheme(root.dataset.theme === "dark" ? "light" : "dark");
});

function closeMenu() {
  navLinks?.classList.remove("open");
  document.body.classList.remove("menu-open");
  menuToggle?.setAttribute("aria-expanded", "false");
}

menuToggle?.addEventListener("click", () => {
  const open = navLinks.classList.toggle("open");
  document.body.classList.toggle("menu-open", open);
  menuToggle.setAttribute("aria-expanded", String(open));
});

navLinks?.querySelectorAll("a").forEach(link => link.addEventListener("click", closeMenu));

function updateHeader() {
  siteHeader?.classList.toggle("scrolled", window.scrollY > 12);
}
window.addEventListener("scroll", updateHeader, { passive: true });
updateHeader();

const revealElements = document.querySelectorAll(".reveal");
if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  revealElements.forEach(el => el.classList.add("visible"));
} else {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("visible");
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.1 });
  revealElements.forEach(el => revealObserver.observe(el));
}

const blogSearch = document.getElementById("blogSearch");
const articleCount = document.getElementById("articleCount");
const noResults = document.getElementById("noResults");

blogSearch?.addEventListener("input", () => {
  const query = blogSearch.value.trim().toLowerCase();
  const cards = [...document.querySelectorAll(".article-card")];
  let visible = 0;

  cards.forEach(card => {
    const matches = card.dataset.search.toLowerCase().includes(query);
    card.classList.toggle("hidden", !matches);
    if (matches) visible++;
  });

  if (articleCount) articleCount.textContent = `${visible} article${visible === 1 ? "" : "s"}`;
  noResults?.classList.toggle("hidden", visible !== 0);
});

const copyArticleLink = document.getElementById("copyArticleLink");
const copyText = document.getElementById("copyText");
copyArticleLink?.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(window.location.href);
    if (copyText) copyText.textContent = "Copied!";
    setTimeout(() => { if (copyText) copyText.textContent = "Copy link"; }, 1800);
  } catch {
    if (copyText) copyText.textContent = "Copy failed";
  }
});

const contactForm = document.getElementById("contactForm");
const formStatus = document.getElementById("formStatus");
contactForm?.addEventListener("submit", async event => {
  event.preventDefault();
  const data = new FormData(contactForm);
  const name = String(data.get("name") || "").trim();
  const email = String(data.get("email") || "").trim();
  const subject = String(data.get("subject") || "").trim();
  const message = String(data.get("message") || "").trim();
  const body = `Hello Ye Min,\n\n${message}\n\nBest,\n${name}\n\nEmail:\n${email}`;

  if (CONTACT_EMAIL) {
    window.location.href = `mailto:${encodeURIComponent(CONTACT_EMAIL)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    return;
  }

  try {
    await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
    formStatus.innerHTML = `Your message has been copied. You can now paste it into <a href="https://www.linkedin.com/in/yeminn/" target="_blank" rel="noopener noreferrer">LinkedIn</a>.`;
  } catch {
    formStatus.textContent = "Set CONTACT_EMAIL in assets/js/main.js to enable direct email composition.";
  }
  formStatus.classList.add("visible");
});

document.getElementById("year").textContent = new Date().getFullYear();
