const whatsappNumber = "2348039248231";

const menuToggle = document.querySelector(".menu-toggle");
const navActions = document.querySelector(".nav-actions");

if (menuToggle && navActions) {
  menuToggle.addEventListener("click", () => {
    const isOpen = navActions.classList.toggle("open");
    menuToggle.classList.toggle("open", isOpen);
    menuToggle.setAttribute("aria-expanded", String(isOpen));
  });

  navActions.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      navActions.classList.remove("open");
      menuToggle.classList.remove("open");
      menuToggle.setAttribute("aria-expanded", "false");
    });
  });
}

const revealItems = document.querySelectorAll(".reveal");

if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12 });

  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}

const seriesSelect = document.querySelector("#iphoneSeries");
const priceInput = document.querySelector("#phonePrice");
const frequencySelect = document.querySelector("#repaymentFrequency");
const durationSelect = document.querySelector("#planDuration");
const depositRate = document.querySelector("#depositRate");
const downPayment = document.querySelector("#downPayment");
const remainingBalance = document.querySelector("#remainingBalance");
const repaymentAmount = document.querySelector("#repaymentAmount");
const paymentLabel = document.querySelector("#paymentLabel");
const paymentCount = document.querySelector("#paymentCount");
const calculatorWhatsapp = document.querySelector("#calculatorWhatsapp");

const naira = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0
});

function numericPrice() {
  return Number(priceInput.value.replace(/[^0-9]/g, "")) || 0;
}

function formatInputPrice() {
  const price = numericPrice();
  priceInput.value = price ? new Intl.NumberFormat("en-NG").format(price) : "";
}

function updateCalculator() {
  const selectedSeries = seriesSelect.options[seriesSelect.selectedIndex];
  const selectedFrequency = frequencySelect.options[frequencySelect.selectedIndex];
  const rate = Number(selectedSeries.dataset.rate);
  const price = numericPrice();
  const duration = Number(durationSelect.value);
  const paymentsPerMonth = Number(selectedFrequency.dataset.perMonth);
  const repayments = Math.max(1, duration * paymentsPerMonth);
  const deposit = price * rate;
  const balance = Math.max(0, price - deposit);
  const repayment = balance / repayments;
  const frequencyName = selectedFrequency.textContent.trim().toLowerCase();

  depositRate.textContent = `${Math.round(rate * 100)}% down`;
  downPayment.textContent = naira.format(deposit);
  remainingBalance.textContent = naira.format(balance);
  repaymentAmount.textContent = naira.format(repayment);
  paymentLabel.textContent = `Estimated ${frequencyName} repayment`;
  paymentCount.textContent = `${repayments} payment${repayments === 1 ? "" : "s"}`;

  const message = [
    "Hello Formex Communication, I want to apply for Easy Buy.",
    `iPhone: ${selectedSeries.textContent.split(" — ")[0]}`,
    `Phone price used for estimate: ${naira.format(price)}`,
    `Down payment estimate: ${naira.format(deposit)} (${Math.round(rate * 100)}%)`,
    `Preferred repayment: ${selectedFrequency.textContent.trim()} for ${duration} month${duration === 1 ? "" : "s"}`,
    `Estimated installment: ${naira.format(repayment)} across ${repayments} payments.`,
    "Please confirm the current phone price, eligibility, any fees, exact repayment schedule, and next steps."
  ].join("\n");

  calculatorWhatsapp.href = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
}

if (seriesSelect && priceInput && frequencySelect && durationSelect) {
  [seriesSelect, frequencySelect, durationSelect].forEach((field) => field.addEventListener("change", updateCalculator));
  priceInput.addEventListener("input", updateCalculator);
  priceInput.addEventListener("blur", () => {
    formatInputPrice();
    updateCalculator();
  });
  updateCalculator();
}
