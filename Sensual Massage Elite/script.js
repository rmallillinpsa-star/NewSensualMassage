const siteConfig = window.SITE_CONFIG || {};
const apiBaseUrl = siteConfig.apiBaseUrl || "";
const bookingEndpoint = siteConfig.bookingEndpoint || apiBaseUrl;
const siteAutoRefreshMs = Number(siteConfig.autoRefreshMs || 30000);

const fallbackConfig = {
  businessName: siteConfig.businessName || "Sensual Massage Diamond",
  brandLogoUrl: siteConfig.brandLogoUrl || "assets/logo.png",
  whatsappNumber: siteConfig.whatsappNumber || "639000000000",
  whatsappDisplay: siteConfig.whatsappDisplay || "+63 900 000 0000",
  viberNumber: siteConfig.viberNumber || "639000000000",
  viberDisplay: siteConfig.viberDisplay || "+63 900 000 0000",
  defaultFemaleRate: siteConfig.defaultFemaleRate || "5000",
  defaultMaleRate: siteConfig.defaultMaleRate || "3000",
  defaultTaxiFare: siteConfig.defaultTaxiFare || "0",
  femaleTaxiFare: siteConfig.femaleTaxiFare || siteConfig.defaultTaxiFare || "0",
  maleTaxiFare: siteConfig.maleTaxiFare || siteConfig.defaultTaxiFare || "0",
  facebookUrl: siteConfig.facebookUrl || "",
  xUrl: siteConfig.xUrl || "",
  instagramUrl: siteConfig.instagramUrl || ""
};

let runtimeConfig = { ...fallbackConfig };

const defaultSiteData = {
  branches: [],
  services: [],
  staff: [],
  promos: [],
  slides: [],
  home_sections: [],
  rates: [],
  settings: {}
};

const selectedBranchName = String(document.body?.dataset.selectedBranch || "").trim();
const selectedBranchSlug = String(document.body?.dataset.selectedBranchSlug || "").trim().toLowerCase();
let lastSiteDataSignature = "";
let siteAutoRefreshTimer = null;

document.addEventListener("DOMContentLoaded", async () => {
  applyGlobalConfig(runtimeConfig);
  initGoogleTranslate();
  initStaticSlider();

  let siteData = defaultSiteData;

  if (apiBaseUrl) {
    try {
      const rawSiteData = await fetchSiteData();
      lastSiteDataSignature = getSiteDataSignature(rawSiteData);
      applySettings(rawSiteData.settings || {});
      siteData = applyBranchScopedSiteData(rawSiteData, selectedBranchName);
      applyBranchBranding(siteData.branches || [], selectedBranchName);
      renderHeaderBranchPhones(siteData.branches || []);
      renderHomePage(siteData);
      renderServicesPage(siteData);
      renderTherapistsPage(siteData);
      renderRatesPage(siteData);
      renderBookingPage(siteData);
      renderContactPage(siteData);
      renderTherapistDetailPage(siteData);
    } catch (error) {
      console.warn("Failed to load Google Sheets data.", error);
      renderPublicDataError(error);
      renderBookingPage(defaultSiteData);
    }
  } else {
    renderPublicDataError(new Error("API base URL is missing."));
    renderBookingPage(defaultSiteData);
  }

  initBookingForm(siteData);

  if (shouldEnableSiteAutoRefresh()) {
    startSiteAutoRefresh();
  }
});

function renderPublicDataError(error) {
  const message = String(error?.message || "Failed to load website data.").trim();
  const therapistGrid = document.querySelector("[data-therapist-grid]");

  if (therapistGrid) {
    therapistGrid.innerHTML = `<div class="service-note"><p>${escapeHtml(message)}</p></div>`;
  }
}

async function fetchSiteData() {
  const response = await fetch(`${apiBaseUrl}?action=siteData`);

  if (!response.ok) {
    throw new Error("Failed to fetch site data.");
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.message || "Invalid site data response.");
  }

  return result.data || defaultSiteData;
}

function shouldEnableSiteAutoRefresh() {
  if (!apiBaseUrl || !siteAutoRefreshMs || siteAutoRefreshMs < 5000) {
    return false;
  }

  return !document.querySelector("[data-admin-app]");
}

function startSiteAutoRefresh() {
  if (siteAutoRefreshTimer) {
    window.clearInterval(siteAutoRefreshTimer);
  }

  siteAutoRefreshTimer = window.setInterval(async () => {
    if (document.hidden) {
      return;
    }

    try {
      const latestSiteData = await fetchSiteData();
      const latestSignature = getSiteDataSignature(latestSiteData);

      if (lastSiteDataSignature && latestSignature && latestSignature !== lastSiteDataSignature) {
        window.location.reload();
        return;
      }

      lastSiteDataSignature = latestSignature;
    } catch (error) {
      console.warn("Auto-refresh check failed.", error);
    }
  }, siteAutoRefreshMs);
}

function getSiteDataSignature(siteData) {
  try {
    return JSON.stringify(siteData || defaultSiteData);
  } catch (error) {
    return "";
  }
}

function applySettings(settings) {
  runtimeConfig = {
    businessName: settings.business_name || fallbackConfig.businessName,
    whatsappNumber: settings.main_whatsapp_number || fallbackConfig.whatsappNumber,
    whatsappDisplay: settings.main_whatsapp_display || fallbackConfig.whatsappDisplay,
    viberNumber: settings.main_viber_number || fallbackConfig.viberNumber,
    viberDisplay: settings.main_viber_display || fallbackConfig.viberDisplay,
    facebookUrl: settings.facebook_url || fallbackConfig.facebookUrl,
    xUrl: settings.x_url || fallbackConfig.xUrl,
    instagramUrl: settings.instagram_url || fallbackConfig.instagramUrl,
    address: settings.main_address || "",
    siteTagline: settings.site_tagline || "",
    bookingNote: settings.booking_note || "",
    defaultFemaleRate: settings.default_female_rate || fallbackConfig.defaultFemaleRate,
    defaultMaleRate: settings.default_male_rate || fallbackConfig.defaultMaleRate,
    defaultTaxiFare: settings.default_taxi_fare || fallbackConfig.defaultTaxiFare,
    femaleTaxiFare: settings.female_taxi_fare || settings.default_female_taxi_fare || settings.default_taxi_fare || fallbackConfig.femaleTaxiFare,
    maleTaxiFare: settings.male_taxi_fare || settings.default_male_taxi_fare || settings.default_taxi_fare || fallbackConfig.maleTaxiFare,
    usdExchangeRate: settings.usd_exchange_rate || settings.php_to_usd_rate || "56"
  };

  applyGlobalConfig(runtimeConfig);
  applyTextSetting("[data-setting='hero_title']", settings.hero_title);
  applyTextSetting("[data-setting='hero_description']", settings.hero_description);
  applyTextSetting("[data-setting='site_tagline']", settings.site_tagline);
  applyTextSetting("[data-setting='contact_heading']", settings.contact_heading);
  applyTextSetting("[data-setting='booking_note']", settings.booking_note);
  applyTextSetting("[data-setting='main_address']", settings.main_address);
}

function applyBranchBranding(branches, branchName) {
  if (!branchName) {
    return;
  }

  const branch = getActiveRows(branches || []).find((item) => isSameBranch(item.name, branchName));

  runtimeConfig = {
    ...runtimeConfig,
    businessName: branchName,
    brandLogoUrl: branch
      ? String(branch.logo_url || "").trim() || buildDriveThumbnailUrl(branch.logo_file_id)
      : runtimeConfig.brandLogoUrl,
    whatsappNumber: branch && branch.whatsapp_number ? String(branch.whatsapp_number).trim() : runtimeConfig.whatsappNumber,
    whatsappDisplay: branch && (branch.whatsapp_number || branch.phone) ? String(branch.whatsapp_number || branch.phone).trim() : runtimeConfig.whatsappDisplay,
    viberNumber: branch && branch.viber_number ? String(branch.viber_number).trim() : runtimeConfig.viberNumber,
    viberDisplay: branch && (branch.viber_number || branch.phone) ? String(branch.viber_number || branch.phone).trim() : runtimeConfig.viberDisplay
  };

  applyGlobalConfig(runtimeConfig);
}

function applyBranchScopedSiteData(siteData, branchName) {
  if (!branchName) {
    return siteData || defaultSiteData;
  }

  const scopedData = siteData || defaultSiteData;

  return {
    branches: getActiveRows(scopedData.branches || []).filter((row) => isSameBranch(row.name, branchName)),
    services: filterRowsByBranch(scopedData.services || [], branchName, true),
    staff: filterRowsByBranch(scopedData.staff || [], branchName, true),
    promos: filterRowsByBranch(scopedData.promos || [], branchName, true),
    slides: filterRowsByBranch(scopedData.slides || [], branchName, true),
    home_sections: filterRowsByBranch(scopedData.home_sections || [], branchName, true),
    rates: filterRowsByBranch(scopedData.rates || [], branchName, true),
    settings: scopedData.settings || {}
  };
}

function filterRowsByBranch(rows, branchName, includeBlankBranch) {
  return getActiveRows(rows || []).filter((row) => {
    const rowBranch = String(row.branch || "").trim();

    if (!rowBranch) {
      return !!includeBlankBranch;
    }

    return isSameBranch(rowBranch, branchName);
  });
}

function getBranchPagePath(baseName) {
  if (!selectedBranchSlug) {
    return `${baseName}.html`;
  }

  return `${baseName}_${selectedBranchSlug}.html`;
}

function getCurrentPagePath() {
  const pathname = String(window.location.pathname || "").split("/").pop().trim();
  return pathname || getBranchPagePath("index");
}

function applyGlobalConfig(config) {
  document.querySelectorAll("[data-business-name]").forEach((node) => {
    node.classList.add("notranslate");
    node.setAttribute("translate", "no");
    node.textContent = config.businessName;
  });

  document.querySelectorAll(".brand-logo").forEach((image) => {
    if (config.brandLogoUrl) {
      image.src = config.brandLogoUrl;
    }
    image.alt = `${config.businessName} logo`;
  });

  document.querySelectorAll("[data-whatsapp-link]").forEach((link) => {
    link.href = buildWhatsappUrl(config.whatsappNumber);
  });

  document.querySelectorAll("[data-whatsapp-display]").forEach((node) => {
    node.textContent = config.whatsappDisplay;
  });

  document.querySelectorAll("[data-viber-link]").forEach((link) => {
    link.href = buildViberUrl(config.viberNumber);
  });

  document.querySelectorAll("[data-viber-display]").forEach((node) => {
    node.textContent = config.viberDisplay;
  });
}

function applyTextSetting(selector, value) {
  if (!value) {
    return;
  }

  document.querySelectorAll(selector).forEach((node) => {
    node.textContent = value;
  });
}

function renderHomePage(siteData) {
  renderSlides(siteData.slides || []);
  renderPromos(siteData.promos || []);
  renderBranchCards(siteData.branches || [], "[data-home-branch-list]");
  renderSocialLinks();
  populateSelect(
    document.querySelector("[data-booking-service-options]"),
    getActiveRows(siteData.services).map((service) => ({
      value: service.name,
      label: service.name
    })),
    "Select a service"
  );
}

function renderServicesPage(siteData) {
  renderServiceCards(siteData.services || []);
  renderRateCards(siteData.rates || []);
  renderSocialLinks();
}

function renderRatesPage(siteData) {
  renderRateCards(siteData.rates || []);
  renderSocialLinks();
}

function renderTherapistsPage(siteData) {
  renderStaffGroups(siteData.staff || [], siteData.branches || []);
  renderSocialLinks();
}

function getTherapistPageGenderFilter() {
  const normalizedGender = String(document.body?.dataset.therapistGender || "").trim().toLowerCase();
  return normalizedGender === "female" || normalizedGender === "male" ? normalizedGender : "";
}

function renderBookingPage(siteData) {
  const branchSelect = document.querySelector("[data-booking-branch-options]");
  const branchOptions = getActiveRows(siteData.branches || []);
  const selectedBranchOption = selectedBranchName
    ? branchOptions.find((branch) => isSameBranch(branch.name, selectedBranchName))
    : null;
  const scopedBranchOptions = selectedBranchName
    ? [{
        name: selectedBranchName,
        label: selectedBranchOption && selectedBranchOption.name
          ? String(selectedBranchOption.name).trim()
          : selectedBranchName
      }]
    : branchOptions;

  populateSelect(
    branchSelect,
    scopedBranchOptions.map((branch) => ({
      value: branch.name,
      label: branch.label || branch.name
    })),
    selectedBranchName ? "" : "Select a branch"
  );

  if (branchSelect) {
    const autoSelectedBranch = selectedBranchName && scopedBranchOptions.some((branch) => isSameBranch(branch.name, selectedBranchName))
      ? scopedBranchOptions.find((branch) => isSameBranch(branch.name, selectedBranchName))
      : (scopedBranchOptions.length === 1 ? scopedBranchOptions[0] : null);

    if (autoSelectedBranch) {
      branchSelect.value = String(autoSelectedBranch.name || "");
    }

    lockBookingBranchSelection(branchSelect);
  }

  populateSelect(
    document.querySelector("[data-booking-service-options]"),
    getActiveRows(siteData.services).map((service) => ({
      value: service.name,
      label: formatBookingServiceOption(service)
    })),
    "Select a service"
  );

  syncBookingEstimate(siteData);
  renderSocialLinks();
}

function lockBookingBranchSelection(branchSelect) {
  if (!branchSelect || !selectedBranchName) {
    return;
  }

  const selectedValue = String(branchSelect.value || selectedBranchName).trim();
  const form = branchSelect.form || document.querySelector("[data-booking-form]");

  branchSelect.disabled = true;
  branchSelect.dataset.lockedBranch = "true";
  branchSelect.style.pointerEvents = "none";
  branchSelect.style.opacity = "1";

  let hiddenInput = form ? form.querySelector("[data-booking-branch-hidden]") : null;

  if (!hiddenInput && form) {
    hiddenInput = document.createElement("input");
    hiddenInput.type = "hidden";
    hiddenInput.name = "branch";
    hiddenInput.setAttribute("data-booking-branch-hidden", "true");
    form.appendChild(hiddenInput);
  }

  if (hiddenInput) {
    hiddenInput.value = selectedValue;
  }

  Array.from(branchSelect.options).forEach((option) => {
    option.hidden = String(option.value || "").trim() !== selectedValue && String(option.value || "").trim() !== "";
  });
}

function renderContactPage(siteData) {
  renderContactChannels();
  renderBranchCards(siteData.branches || [], "[data-branch-list]");
  renderSocialLinks();
}

function renderTherapistDetailPage(siteData) {
  const root = document.querySelector("[data-therapist-detail-page]");

  if (!root) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const requestedName = String(params.get("name") || "").trim().toLowerCase();
  const detailSection = document.querySelector("[data-therapist-detail-section]");
  const listSection = document.querySelector("[data-therapist-list-section]");
  const staffRows = getActiveRows(siteData.staff || []);
  const staff = getActiveRows(siteData.staff || []).find((item) => String(item.name || "").trim().toLowerCase() === requestedName);

  const titleNode = document.querySelector("[data-therapist-detail-title]");
  const subtitleNode = document.querySelector("[data-therapist-detail-subtitle]");
  const galleryNode = document.querySelector("[data-therapist-detail-gallery]");
  const statsNode = document.querySelector("[data-therapist-detail-stats]");
  const metaNode = document.querySelector("[data-therapist-detail-meta]");
  const bioNode = document.querySelector("[data-therapist-detail-bio]");

  if (!requestedName) {
    if (detailSection) {
      detailSection.classList.add("hidden");
    }
    if (listSection) {
      listSection.classList.remove("hidden");
    }
    renderStaffGroups(staffRows, siteData.branches || []);
    if (titleNode) {
      titleNode.textContent = "Browse our available massage therapists.";
    }
    if (subtitleNode) {
      subtitleNode.textContent = "Select a therapist profile below to open the full profile page.";
    }
    return;
  }

  if (!staff) {
    if (detailSection) {
      detailSection.classList.add("hidden");
    }
    if (listSection) {
      listSection.classList.remove("hidden");
    }
    renderStaffGroups(staffRows, siteData.branches || []);
    if (titleNode) {
      titleNode.textContent = "Therapist profile not found.";
    }
    if (subtitleNode) {
      subtitleNode.textContent = "Choose an available therapist profile below.";
    }
    return;
  }

  if (detailSection) {
    detailSection.classList.remove("hidden");
  }
  if (listSection) {
    listSection.classList.add("hidden");
  }

  const name = String(staff.name || "").trim();
  const gender = String(staff.gender || "").trim();
  const role = String(staff.role || "").trim();
  const specialty = String(staff.specialty || "").trim();
  const branch = String(staff.branch || "").trim();
  const age = String(staff.age || "").trim();
  const height = String(staff.height || "").trim();
  const weight = String(staff.weight || "").trim();
  const bio = String(staff.bio || "").trim();
  const images = parseStaffImageUrls(staff.image_urls);

  if (titleNode) {
    titleNode.textContent = name || "Therapist";
  }
  if (subtitleNode) {
    subtitleNode.textContent = gender ? `${gender} therapist profile` : "Therapist profile";
  }
  if (metaNode) {
    metaNode.textContent = [specialty || role, branch].filter(Boolean).join(" | ");
  }
  if (bioNode) {
    bioNode.textContent = bio || "";
  }
  if (galleryNode) {
    galleryNode.innerHTML = images.length
      ? images.map((image, index) => renderTherapistImage(image, `${name || "Therapist"} photo ${index + 1}`, "")).join("")
      : `<div class="therapist-avatar therapist-avatar-placeholder">${escapeHtml(getInitials(name))}</div>`;
  }
  if (statsNode) {
    const statItems = [
      age ? { label: "Age", value: age } : null,
      height ? { label: "Height", value: height } : null,
      weight ? { label: "Weight", value: weight } : null
    ].filter(Boolean);

    statsNode.innerHTML = statItems.map((item) => `
      <div class="profile-stat">
        <span>${escapeHtml(item.label)}</span>
        <strong>${escapeHtml(item.value)}</strong>
      </div>
    `).join("");
  }
}

function renderHeaderBranchPhones(branches) {
  const containers = Array.from(document.querySelectorAll("[data-header-branch-phones]"));

  if (!containers.length) {
    return;
  }

  const visibleBranches = selectedBranchName
    ? getActiveRows(branches || []).filter((branch) => isSameBranch(branch.name, selectedBranchName))
    : getActiveRows(branches || []);

  const items = visibleBranches
    .map((branch) => {
      const phone = String(branch.phone || "").trim();

      if (!phone) {
        return "";
      }

      let displayPhone = phone;
      if (selectedBranchName && displayPhone.toLowerCase().startsWith(selectedBranchName.toLowerCase())) {
        displayPhone = displayPhone.slice(selectedBranchName.length).trim();
        if (displayPhone.startsWith(':')) {
          displayPhone = displayPhone.slice(1).trim();
        }
      }

      return `
        <div class="header-contact-info">
          <div class="header-contact-label">Contact Number:</div>
          <div class="header-contact-row">
            <a class="header-contact-number" href="${escapeAttribute(buildWhatsappUrl(phone))}" target="_blank" rel="noreferrer">${escapeHtml(displayPhone)}</a>
            <span class="header-contact-icons" aria-hidden="true">
              <img class="header-contact-icon" src="assets/whatsapp.png" alt="WhatsApp">
              <img class="header-contact-icon" src="assets/viber.png" alt="Viber">
              <img class="header-contact-icon" src="assets/telegram.png" alt="Telegram">
              <img class="header-contact-icon" src="assets/kakaotalk.png" alt="KakaoTalk">
              <img class="header-contact-icon" src="assets/wechat.png" alt="WeChat">
            </span>
          </div>
        </div>
      `;
    })
    .filter(Boolean)
    .join("");

  containers.forEach((container) => {
    container.innerHTML = items;
    container.classList.toggle("is-empty", !items);
  });
}

function renderContactChannels() {
  const container = document.querySelector("[data-contact-channel-grid]");

  if (!container) {
    return;
  }

  const cards = [];

  if (runtimeConfig.whatsappNumber) {
    cards.push(renderContactChannelCard({
      title: "WhatsApp",
      display: runtimeConfig.whatsappDisplay,
      description: "Send your preferred schedule, selected service, and therapist preference so our team can reply with the available slots.",
      href: buildWhatsappUrl(runtimeConfig.whatsappNumber),
      buttonLabel: "Chat on WhatsApp",
      qrValue: buildWhatsappUrl(runtimeConfig.whatsappNumber),
      icon: "whatsapp"
    }));
  }

  if (runtimeConfig.viberNumber) {
    cards.push(renderContactChannelCard({
      title: "Viber",
      display: runtimeConfig.viberDisplay,
      description: "Message us on Viber if you prefer quick mobile chat for reservations and questions.",
      href: buildViberUrl(runtimeConfig.viberNumber),
      buttonLabel: "Open Viber",
      qrValue: buildViberUrl(runtimeConfig.viberNumber),
      icon: "viber"
    }));
  }

  if (!cards.length) {
    return;
  }

  container.innerHTML = cards.join("");
}

function renderContactChannelCard({ title, display, description, href, buttonLabel, qrValue, icon }) {
  return `
    <article class="contact-card branch-contact-card">
      <p class="contact-label">${escapeHtml(title)}</p>
      <div class="contact-card-title">
        ${getIconSvg(icon)}
        <h2>${escapeHtml(display || title)}</h2>
      </div>
      <p>${escapeHtml(description || "")}</p>
      <div class="branch-actions">
        <a class="button primary" href="${escapeAttribute(href)}" target="_blank" rel="noreferrer">${escapeHtml(buttonLabel)}</a>
      </div>
      <div class="qr-stack">
        ${renderQrVisual(qrValue, title, icon)}
        <p class="qr-note">Scan to open ${escapeHtml(title)} instantly.</p>
      </div>
    </article>
  `;
}

function renderBranchCards(branches, selector) {
  if (!selector) {
    return;
  }

  const branchContainer = document.querySelector(selector);

  if (!branchContainer) {
    return;
  }

  const activeBranches = getActiveRows(branches);

  if (!activeBranches.length) {
    return;
  }

  branchContainer.innerHTML = activeBranches.map((branch) => renderBranchCard(branch)).join("");
}

function renderSlides(slides) {
  const slider = document.querySelector("[data-dynamic-slider]");
  const controls = document.querySelector("[data-dynamic-slider-controls]");
  const activeSlides = getActiveRows(slides);

  if (!slider || !controls || !activeSlides.length) {
    return;
  }

  slider.innerHTML = activeSlides.map((slide, index) => `
    <img
      class="slide${index === 0 ? " active" : ""}"
      src="${escapeAttribute(slide.image_url || "assets/slide-1.svg")}"
      alt="${escapeAttribute(slide.alt_text || slide.title || "Massage wellness image")}"
    >
  `).join("");

  controls.innerHTML = activeSlides.map((slide, index) => `
    <button
      class="slider-dot${index === 0 ? " active" : ""}"
      type="button"
      data-slide="${index}"
      aria-label="Show slide ${index + 1}"
    ></button>
  `).join("");

  initDynamicSlider();
}

function renderPromos(promos) {
  const promoGrid = document.querySelector("[data-promos]");
  const activePromos = getActiveRows(promos);

  if (!promoGrid || !activePromos.length) {
    return;
  }

  promoGrid.innerHTML = activePromos.map((promo, index) => `
    <article class="promo-card${index === 0 ? " featured" : ""}">
      <span class="promo-tag">${escapeHtml(promo.label || "Promo")}</span>
      <h3>${escapeHtml(promo.title || "Special Offer")}</h3>
      <p>${escapeHtml(promo.description || "")}</p>
    </article>
  `).join("");
}

function renderServiceCards(services) {
  const serviceGrid = document.querySelector("[data-services-grid]");
  const activeServices = getActiveRows(services);

  if (!serviceGrid || !activeServices.length) {
    return;
  }

  serviceGrid.innerHTML = activeServices.map((service) => `
    <article class="service-card">
      <h2>${escapeHtml(service.name || "Service")}</h2>
      <p>${escapeHtml(service.description || "")}</p>
      <div class="service-meta">
        <strong>${escapeHtml(service.duration || "Available by request")}</strong>
        <p>${escapeHtml(formatGenderRate("Female", service.female_rate))}</p>
        <p>${escapeHtml(formatGenderRate("Male", service.male_rate))}</p>
      </div>
    </article>
  `).join("");
}

function renderRateCards(rates) {
  const serviceGrid = document.querySelector("[data-service-rates-grid]");
  const taxiGrid = document.querySelector("[data-taxi-rates-grid]");

  if (!serviceGrid && !taxiGrid) {
    return;
  }

  const activeRates = getActiveRows(rates || []);
  const serviceRates = activeRates.filter((rate) => String(rate.category || "").trim().toLowerCase() === "service");
  const taxiRates = activeRates.filter((rate) => String(rate.category || "").trim().toLowerCase() === "taxi");

  if (serviceGrid) {
    serviceGrid.innerHTML = serviceRates.length
      ? serviceRates.map((rate) => renderRateCard(rate)).join("")
      : `<article class="rate-card rate-card-empty"><h3>Rates coming soon</h3><p>Add service rates in the admin Rates tab to show them here.</p></article>`;
  }

  if (taxiGrid) {
    taxiGrid.innerHTML = taxiRates.length
      ? taxiRates.map((rate) => renderRateCard(rate)).join("")
      : `<article class="rate-card rate-card-empty"><h3>Taxi rates coming soon</h3><p>Add taxi rates in the admin Rates tab to show them here.</p></article>`;
  }
}

function renderRateCard(rate) {
  const label = String(rate.label || "").trim() || formatRateKey(String(rate.key || "").trim());
  const amount = parseAmount(rate.amount);
  const category = String(rate.category || "").trim().toLowerCase();

  return `
    <article class="rate-card">
      <p class="contact-label">${escapeHtml(category || "rate")}</p>
      <h3>${escapeHtml(label || "Rate")}</h3>
      <strong>PHP ${escapeHtml(formatNumber(amount))}</strong>
    </article>
  `;
}

function formatRateKey(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function renderStaffGroups(staffRows, branches) {
  const therapistGrid = document.querySelector("[data-therapist-grid]");
  const activeStaff = getActiveRows(staffRows);
  const genderFilter = getTherapistPageGenderFilter();
  const filteredStaff = genderFilter
    ? activeStaff.filter((staff) => matchesGender(staff.gender, genderFilter))
    : activeStaff;

  if (!therapistGrid) {
    return;
  }

  if (!filteredStaff.length) {
    therapistGrid.innerHTML = '<div class="service-note"><p>No therapists available yet.</p></div>';
    return;
  }

  if (selectedBranchName) {
    therapistGrid.innerHTML = filteredStaff.map((staff) => renderTherapistProfile(staff)).join("");
    return;
  }

  const branchNames = getOrderedBranchNames(branches, filteredStaff);

  const markup = branchNames.map((branchName) => {
    const branchStaff = filteredStaff.filter((staff) => isSameBranch(staff.branch, branchName));
    const femaleStaff = genderFilter === "male"
      ? []
      : branchStaff.filter((staff) => matchesGender(staff.gender, "female"));
    const maleStaff = genderFilter === "female"
      ? []
      : branchStaff.filter((staff) => matchesGender(staff.gender, "male"));
    const sections = [
      femaleStaff.length ? renderStaffCard("Female Therapists", femaleStaff) : "",
      maleStaff.length ? renderStaffCard("Male Therapists", maleStaff) : ""
    ].filter(Boolean).join("");

    if (!sections) {
      return "";
    }

    return `
      <section class="branch-therapist-section">
        <div class="branch-therapist-heading">
          <p class="eyebrow">Branch</p>
          <h3>${escapeHtml(branchName || "Therapists")}</h3>
        </div>
        <div class="therapist-grid">${sections}</div>
      </section>
    `;
  }).filter(Boolean).join("");

  therapistGrid.innerHTML = markup || `<div class="service-note"><p>No ${genderFilter || ""} therapists available yet.</p></div>`;
}

function renderStaffCard(title, rows) {
  const items = rows.length
    ? rows.map((staff) => renderTherapistProfile(staff)).join("")
    : `
      <article class="therapist-profile therapist-profile-empty">
        <div class="therapist-avatar therapist-avatar-placeholder">?</div>
        <div class="therapist-body">
          <h3>Coming soon</h3>
          <p>New therapist profiles will appear here after you add them in admin.</p>
        </div>
      </article>
    `;

  return `
    <article class="therapist-card">
      <p class="therapist-type">${title}</p>
      <div class="therapist-list therapist-list-grid">${items}</div>
    </article>
  `;
}

function renderTherapistProfile(staff) {
  const name = String(staff.name || "").trim();
  const specialty = String(staff.specialty || "").trim();
  const role = String(staff.role || "").trim();
  const branch = String(staff.branch || "").trim();
  const age = String(staff.age || "").trim();
  const height = String(staff.height || "").trim();
  const weight = String(staff.weight || "").trim();
  const bio = String(staff.bio || "").trim();
  const imageUrls = parseStaffImageUrls(staff.image_urls);
  const imageUrl = imageUrls[0] || "";
  const metaLine = [specialty || role, branch].filter(Boolean).join(" | ");
  const avatar = imageUrl
    ? renderTherapistImage(imageUrl, name || "Therapist", "therapist-avatar")
    : `<div class="therapist-avatar therapist-avatar-placeholder">${escapeHtml(getInitials(name))}</div>`;
  const profileParams = new URLSearchParams();
  const genderFilter = getTherapistPageGenderFilter();
  profileParams.set("name", name);
  if (genderFilter) {
    profileParams.set("gender", genderFilter);
  }
  const profilePagePath = genderFilter ? getCurrentPagePath() : getBranchPagePath("therapist");
  const profileUrl = `${profilePagePath}?${profileParams.toString()}`;

  return `
    <a class="therapist-profile therapist-profile-grid" href="${escapeAttribute(profileUrl)}">
      ${avatar}
      <div class="therapist-body">
        <h3>${escapeHtml(name || "Therapist")}</h3>
        ${metaLine ? `<p class="therapist-meta">${escapeHtml(metaLine)}</p>` : ""}
        <span class="therapist-more" aria-hidden="true">${getIconSvg("eye")}</span>
      </div>
    </a>
  `;
}

function renderTherapistImage(imageUrl, altText, className) {
  const normalizedUrl = String(imageUrl || "").trim();
  const normalizedAlt = String(altText || "Therapist").trim();
  const driveFileId = extractDriveFileId(normalizedUrl);
  const fallbackUrl = driveFileId ? buildDriveViewUrl(driveFileId) : "";
  const initials = getInitials(normalizedAlt);
  const placeholderClass = className || "therapist-avatar";
  const placeholderHtml = `<div class="${placeholderClass} therapist-avatar-placeholder">${escapeHtml(initials)}</div>`;
  const errorHandler = fallbackUrl
    ? `if(!this.dataset.fallbackApplied){this.dataset.fallbackApplied='true';this.src='${escapeAttribute(fallbackUrl)}';}else{this.onerror=null;this.outerHTML='${escapeAttribute(placeholderHtml)}';}`
    : `this.onerror=null;this.outerHTML='${escapeAttribute(placeholderHtml)}';`;

  return `<img${className ? ` class="${escapeAttribute(className)}"` : ""} src="${escapeAttribute(normalizedUrl)}" alt="${escapeAttribute(normalizedAlt)}" onerror="${errorHandler}">`;
}

function normalizeImageUrl(value) {
  const trimmedValue = String(value || "").trim();

  if (!trimmedValue) {
    return "";
  }

  if (/^https?:\/\/drive\.google\.com\/thumbnail/i.test(trimmedValue)) {
    const driveFileId = extractDriveFileId(trimmedValue);
    return driveFileId ? buildDriveThumbnailUrl(driveFileId) : trimmedValue;
  }

  const driveFileId = extractDriveFileId(trimmedValue);
  if (driveFileId) {
    return buildDriveThumbnailUrl(driveFileId);
  }

  return trimmedValue;
}

function parseStaffImageUrls(value) {
  return String(value || "")
    .split(/\r?\n|,|;/)
    .map((item) => normalizeImageUrl(item))
    .filter(Boolean)
    .slice(0, 10);
}

function populateSelect(select, options, placeholder) {
  if (!select) {
    return;
  }

  const firstOption = placeholder ? `<option value="">${escapeHtml(placeholder)}</option>` : "";

  select.innerHTML = firstOption + (options || []).map((option) => `
    <option value="${escapeAttribute(option.value)}">${escapeHtml(option.label)}</option>
  `).join("");
}

function initStaticSlider() {
  const slider = document.querySelector(".slider");
  const controls = document.querySelector(".slider-controls");

  if (!slider || !controls) {
    return;
  }

  bindSlider(slider, controls);
}

function initDynamicSlider() {
  const slider = document.querySelector("[data-dynamic-slider]");
  const controls = document.querySelector("[data-dynamic-slider-controls]");

  if (!slider || !controls) {
    return;
  }

  bindSlider(slider, controls);
}

function bindSlider(slider, controls) {
  const slides = Array.from(slider.querySelectorAll(".slide"));
  const dots = Array.from(controls.querySelectorAll(".slider-dot"));

  if (!slides.length || !dots.length) {
    return;
  }

  let currentSlide = 0;

  const showSlide = (index) => {
    slides.forEach((slide, slideIndex) => {
      slide.classList.toggle("active", slideIndex === index);
    });

    dots.forEach((dot, dotIndex) => {
      dot.classList.toggle("active", dotIndex === index);
    });

    currentSlide = index;
  };

  dots.forEach((dot, index) => {
    dot.addEventListener("click", () => showSlide(index));
  });

  setInterval(() => {
    showSlide((currentSlide + 1) % slides.length);
  }, 4500);
}

function initBookingForm(siteData) {
  const bookingForm = document.querySelector("[data-booking-form]");
  const formStatus = document.querySelector("[data-form-status]");

  if (!bookingForm || !formStatus) {
    return;
  }

  const serviceSelect = bookingForm.querySelector("[data-booking-service-options]");
  const branchSelect = bookingForm.querySelector("[data-booking-branch-options]");
  const femaleCountSelect = bookingForm.querySelector("[data-booking-female-count]");
  const maleCountSelect = bookingForm.querySelector("[data-booking-male-count]");
  const taxiFareInput = bookingForm.querySelector("[data-booking-taxi-fare]");
  const taxiFareDisplay = bookingForm.querySelector("[data-booking-taxi-fare-display]");
  const agreementCheckbox = bookingForm.querySelector("[data-booking-agreement-check]");
  const agreementHidden = bookingForm.querySelector("[data-booking-agreement]");

  if (taxiFareInput && !taxiFareInput.value) {
    taxiFareInput.value = String(getTaxiFareForSelection(0, 0));
  }

  if (taxiFareDisplay && !taxiFareDisplay.value) {
    taxiFareDisplay.value = `PHP ${formatNumber(getTaxiFareForSelection(0, 0))}`;
  }

  if (agreementCheckbox && agreementHidden) {
    const syncAgreement = () => {
      agreementHidden.value = agreementCheckbox.checked ? "Yes" : "No";
    };

    syncAgreement();
    agreementCheckbox.addEventListener("change", syncAgreement);
  }

  [branchSelect, serviceSelect, femaleCountSelect, maleCountSelect].forEach((input) => {
    input?.addEventListener("change", () => syncBookingEstimate(siteData));
    input?.addEventListener("input", () => syncBookingEstimate(siteData));
  });

  syncBookingEstimate(siteData);

  bookingForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(bookingForm);
    const bookingData = Object.fromEntries(formData.entries());
    const femaleCount = parseAmount(bookingData.female_therapist_count || "0");
    const maleCount = parseAmount(bookingData.male_therapist_count || "0");
    const hasAgreement = bookingData.agreement === "Yes";

    if (femaleCount + maleCount <= 0) {
      formStatus.classList.add("is-error");
      formStatus.classList.remove("is-success");
      formStatus.textContent = "Please choose at least one therapist.";
      return;
    }

    if (!hasAgreement) {
      formStatus.classList.add("is-error");
      formStatus.classList.remove("is-success");
      formStatus.textContent = "Booking cancelled. Please agree to the terms and conditions before submitting.";
      return;
    }

    formStatus.classList.remove("is-error", "is-success");
    formStatus.textContent = "Submitting your booking...";

    if (bookingEndpoint) {
      try {
        const response = await fetch(bookingEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "text/plain;charset=utf-8"
          },
          body: JSON.stringify({
            action: "createBooking",
            ...bookingData
          })
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error("Booking request failed.");
        }

        bookingForm.reset();
        const fareInput = bookingForm.querySelector("[data-booking-taxi-fare]");
        const fareDisplay = bookingForm.querySelector("[data-booking-taxi-fare-display]");
        if (fareInput) {
          fareInput.value = String(getTaxiFareForSelection(0, 0));
        }
        if (fareDisplay) {
          fareDisplay.value = `PHP ${formatNumber(getTaxiFareForSelection(0, 0))}`;
        }
        const checkbox = bookingForm.querySelector("[data-booking-agreement-check]");
        const hiddenAgreement = bookingForm.querySelector("[data-booking-agreement]");
        if (checkbox) {
          checkbox.checked = false;
        }
        if (hiddenAgreement) {
          hiddenAgreement.value = "No";
        }
        syncBookingEstimate(siteData);
        formStatus.classList.add("is-success");
        formStatus.textContent = "Booking sent successfully. We'll contact you soon.";
        return;
      } catch (error) {
        formStatus.classList.add("is-error");
        formStatus.textContent = "Online booking is unavailable right now. Redirecting to WhatsApp...";
      }
    } else {
      formStatus.classList.add("is-error");
      formStatus.textContent = "Direct booking is not connected yet. Opening WhatsApp instead...";
    }

    openWhatsappBooking(bookingData, siteData);
  });
}

function openWhatsappBooking(bookingData) {
  const message = [
    "Hello, I would like to book a massage.",
    `Name: ${bookingData.name || ""}`,
    `Phone: ${bookingData.phone || ""}`,
    `Branch: ${bookingData.branch || ""}`,
    `Service: ${bookingData.service || ""}`,
    `Female Therapists: ${bookingData.female_therapist_count || "0"}`,
    `Male Therapists: ${bookingData.male_therapist_count || "0"}`,
    `Date: ${bookingData.date || ""}`,
    `Time: ${bookingData.time || ""}`,
    `Preferred Female Therapists: ${bookingData.female_therapists || "Any available"}`,
    `Preferred Male Therapists: ${bookingData.male_therapists || "Any available"}`,
    `Estimated Service Cost: PHP ${bookingData.estimated_service_cost || "0"}`,
    `Taxi Fare: PHP ${bookingData.taxi_fare || "0"}`,
    `Total Estimate: PHP ${bookingData.total_estimate || "0"}`,
    `Notes: ${bookingData.notes || "None"}`
  ].join("\n");

  window.open(
    `${buildWhatsappUrl(runtimeConfig.whatsappNumber)}?text=${encodeURIComponent(message)}`,
    "_blank",
    "noopener"
  );
}

function getActiveRows(rows) {
  return (rows || [])
    .filter((row) => {
      if (typeof row?.active === "boolean") {
        return row.active;
      }

      return String(row?.active ?? "TRUE").trim().toUpperCase() === "TRUE";
    })
    .sort((a, b) => Number(a.__rowIndex || 0) - Number(b.__rowIndex || 0));
}

function matchesGender(value, target) {
  const normalizedValue = String(value || "").trim().toLowerCase();
  const normalizedTarget = String(target || "").trim().toLowerCase();

  if (!normalizedValue || !normalizedTarget) {
    return false;
  }

  if (normalizedValue === normalizedTarget) {
    return true;
  }

  if (normalizedTarget === "female") {
    return ["f", "female", "feminine", "girl", "lady", "woman", "women"].includes(normalizedValue);
  }

  if (normalizedTarget === "male") {
    return ["m", "male", "masculine", "boy", "man", "men", "gentleman"].includes(normalizedValue);
  }

  return false;
}

function formatServiceOption(service) {
  const duration = service.duration ? String(service.duration).trim() : "";
  const femaleRate = formatCompactRate(service.female_rate, "F");
  const maleRate = formatCompactRate(service.male_rate, "M");

  return [duration, femaleRate, maleRate].filter(Boolean).join(" | ") || "Available by request";
}

function formatBookingServiceOption(service) {
  return `${service.name || "Service"}${service.duration ? ` | ${service.duration}` : ""}${buildRateSuffix(service)}`;
}

function buildRateSuffix(service) {
  const femaleRate = formatCompactRate(service.female_rate, "F");
  const maleRate = formatCompactRate(service.male_rate, "M");
  const parts = [femaleRate, maleRate].filter(Boolean);
  return parts.length ? ` | ${parts.join(" | ")}` : "";
}

function formatCompactRate(value, label) {
  const amount = parseAmount(value);
  return amount > 0 ? `${label}: PHP ${formatNumber(amount)}` : "";
}

function formatGenderRate(label, value) {
  const amount = parseAmount(value);
  return `${label}: ${amount > 0 ? `PHP ${formatNumber(amount)}` : "Request quote"}`;
}

function syncBookingEstimate(siteData) {
  const bookingForm = document.querySelector("[data-booking-form]");

  if (!bookingForm) {
    return;
  }

  const serviceName = bookingForm.querySelector("[data-booking-service-options]")?.value || "";
  const branchName = bookingForm.querySelector("[data-booking-branch-options]")?.value || "";
  const femaleCount = parseAmount(bookingForm.querySelector("[data-booking-female-count]")?.value || "0");
  const maleCount = parseAmount(bookingForm.querySelector("[data-booking-male-count]")?.value || "0");
  const taxiFareInput = bookingForm.querySelector("[data-booking-taxi-fare]");
  const taxiFareDisplay = bookingForm.querySelector("[data-booking-taxi-fare-display]");
  const rateMap = getRateMap(siteData.rates || []);
  const taxiFare = getTaxiFareForSelection(femaleCount, maleCount, rateMap);
  const service = getActiveRows(siteData.services || []).find((item) => String(item.name || "") === serviceName);
  const serviceEstimate = getServiceEstimate(service, femaleCount, maleCount, rateMap);
  const totalEstimate = serviceEstimate + taxiFare;

  if (taxiFareInput) {
    taxiFareInput.value = String(taxiFare);
  }

  if (taxiFareDisplay) {
    taxiFareDisplay.value = `PHP ${formatNumber(taxiFare)}`;
  }

  populateTherapistOptions(siteData, "female", femaleCount, branchName);
  populateTherapistOptions(siteData, "male", maleCount, branchName);
  updateEstimateDisplay(serviceEstimate, taxiFare, totalEstimate);
}

function populateTherapistOptions(siteData, gender, count, branchName) {
  const container = document.querySelector(gender === "female" ? "[data-booking-female-therapist-list]" : "[data-booking-male-therapist-list]");

  if (!container) {
    return;
  }

  const existingValues = Array.from(container.querySelectorAll("select")).map((select) => select.value);
  const matchingStaff = getActiveRows(siteData.staff || []).filter((staff) => {
    return matchesGender(staff.gender, gender) && isSameBranch(staff.branch, branchName);
  });
  const label = gender === "female" ? "female" : "male";

  if (count <= 0) {
    container.innerHTML = `<p class="booking-therapist-empty">No ${label} therapist selected.</p>`;
    syncTherapistHiddenFields();
    return;
  }

  if (!String(branchName || "").trim()) {
    container.innerHTML = `<p class="booking-therapist-empty">Select a branch first to view available ${label} therapists.</p>`;
    syncTherapistHiddenFields();
    return;
  }

  if (!matchingStaff.length) {
    container.innerHTML = `<p class="booking-therapist-empty">No ${label} therapists available for this branch right now.</p>`;
    syncTherapistHiddenFields();
    return;
  }

  container.innerHTML = Array.from({ length: count }).map((_, index) => `
    <label class="booking-therapist-pick">
      <span>${gender === "female" ? "Female" : "Male"} Therapist ${index + 1}</span>
      <select data-therapist-pick="${gender}">
        <option value="">Any available therapist</option>
        ${matchingStaff.map((staff) => `<option value="${escapeAttribute(staff.name)}">${escapeHtml(`${staff.name}${staff.branch ? ` | ${staff.branch}` : ""}`)}</option>`).join("")}
      </select>
    </label>
  `).join("");

  Array.from(container.querySelectorAll("select")).forEach((select, index) => {
    const previousValue = existingValues[index] || "";
    if (matchingStaff.some((staff) => staff.name === previousValue)) {
      select.value = previousValue;
    }

    select.addEventListener("change", syncTherapistHiddenFields);
  });

  syncTherapistHiddenFields();
}

function getOrderedBranchNames(branches, staffRows) {
  const orderedNames = [];
  const seen = new Set();

  getActiveRows(branches || []).forEach((branch) => {
    const name = String(branch.name || "").trim();
    const normalized = normalizeBranchName(name);

    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      orderedNames.push(name);
    }
  });

  (staffRows || []).forEach((staff) => {
    const name = String(staff.branch || "").trim();
    const normalized = normalizeBranchName(name);

    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      orderedNames.push(name);
    }
  });

  return orderedNames;
}

function normalizeBranchName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSameBranch(value, target) {
  const left = normalizeBranchName(value);
  const right = normalizeBranchName(target);

  if (!left || !right) {
    return left === right;
  }

  if (left === right) {
    return true;
  }

  if (left.indexOf(right) !== -1 || right.indexOf(left) !== -1) {
    return true;
  }

  return false;
}

function updateEstimateDisplay(serviceEstimate, taxiFare, totalEstimate) {
  const serviceText = `PHP ${formatNumber(serviceEstimate)}`;
  const taxiText = `PHP ${formatNumber(taxiFare)}`;
  const totalText = `PHP ${formatNumber(totalEstimate)}`;
  const totalUsdText = `USD ${formatUsd(getUsdEstimate(totalEstimate))}`;

  const serviceNode = document.querySelector("[data-estimate-service]");
  const taxiNode = document.querySelector("[data-estimate-taxi]");
  const totalNode = document.querySelector("[data-estimate-total]");
  const totalUsdNode = document.querySelector("[data-estimate-total-usd]");
  const serviceDisplay = document.querySelector("[data-booking-service-estimate-display]");
  const totalDisplay = document.querySelector("[data-booking-total-estimate-display]");
  const totalUsdDisplay = document.querySelector("[data-booking-total-estimate-usd-display]");
  const hiddenService = document.querySelector("[data-booking-estimated-service-cost]");
  const hiddenTotal = document.querySelector("[data-booking-total-estimate]");

  if (serviceNode) {
    serviceNode.textContent = serviceText;
  }

  if (taxiNode) {
    taxiNode.textContent = taxiText;
  }

  if (totalNode) {
    totalNode.textContent = totalText;
  }

  if (totalUsdNode) {
    totalUsdNode.textContent = totalUsdText;
  }

  if (serviceDisplay) {
    serviceDisplay.value = serviceText;
  }

  if (totalDisplay) {
    totalDisplay.value = totalText;
  }

  if (totalUsdDisplay) {
    totalUsdDisplay.value = totalUsdText;
  }

  if (hiddenService) {
    hiddenService.value = String(serviceEstimate);
  }

  if (hiddenTotal) {
    hiddenTotal.value = String(totalEstimate);
  }
}

function syncTherapistHiddenFields() {
  const femaleNames = Array.from(document.querySelectorAll('[data-booking-female-therapist-list] select'))
    .map((select) => select.value.trim())
    .filter(Boolean);
  const maleNames = Array.from(document.querySelectorAll('[data-booking-male-therapist-list] select'))
    .map((select) => select.value.trim())
    .filter(Boolean);

  const femaleHidden = document.querySelector("[data-booking-female-therapists]");
  const maleHidden = document.querySelector("[data-booking-male-therapists]");

  if (femaleHidden) {
    femaleHidden.value = femaleNames.join(", ");
  }

  if (maleHidden) {
    maleHidden.value = maleNames.join(", ");
  }
}

function getServiceRateByGender(service, therapistGender) {
  if (String(therapistGender).toLowerCase() === "male") {
    return parseAmount(service?.male_rate) || getDefaultMaleRate();
  }

  if (String(therapistGender).toLowerCase() === "female") {
    return parseAmount(service?.female_rate) || getDefaultFemaleRate();
  }

  return parseAmount(service?.female_rate) || parseAmount(service?.male_rate) || getDefaultFemaleRate() || getDefaultMaleRate();
}

function getRateMap(rates) {
  return getActiveRows(rates || []).reduce((map, row) => {
    const key = String(row.key || "").trim();
    if (key) {
      map[key] = parseAmount(row.amount);
    }
    return map;
  }, {});
}

function getRateValue(rateMap, key) {
  return parseAmount(rateMap && rateMap[key]);
}

function getServiceEstimate(service, femaleCount, maleCount, rateMap) {
  const femaleSelectedCount = Math.max(0, Number(femaleCount || 0));
  const maleSelectedCount = Math.max(0, Number(maleCount || 0));

  if (femaleSelectedCount === 1 && maleSelectedCount === 1) {
    return getRateValue(rateMap, "service_mixed_1_1") || 12000;
  }

  if (femaleSelectedCount === 2 && maleSelectedCount === 0) {
    return getRateValue(rateMap, "service_female_2") || (getServiceRateByGender(service, "female") * 2);
  }

  if (femaleSelectedCount === 0 && maleSelectedCount === 2) {
    return getRateValue(rateMap, "service_male_2") || (getServiceRateByGender(service, "male") * 2);
  }

  if (femaleSelectedCount === 1 && maleSelectedCount === 0) {
    return getRateValue(rateMap, "service_female_1") || getServiceRateByGender(service, "female");
  }

  if (femaleSelectedCount === 0 && maleSelectedCount === 1) {
    return getRateValue(rateMap, "service_male_1") || getServiceRateByGender(service, "male");
  }

  const femaleServiceRate = getServiceRateByGender(service, "female");
  const maleServiceRate = getServiceRateByGender(service, "male");
  return (femaleServiceRate * femaleSelectedCount) + (maleServiceRate * maleSelectedCount);
}

function getTaxiFareDefault() {
  return parseAmount(runtimeConfig.defaultTaxiFare || "0");
}

function getDefaultFemaleRate() {
  return parseAmount(runtimeConfig.defaultFemaleRate || "5000");
}

function getDefaultMaleRate() {
  return parseAmount(runtimeConfig.defaultMaleRate || "3000");
}

function getFemaleTaxiFare() {
  return parseAmount(runtimeConfig.femaleTaxiFare || runtimeConfig.defaultTaxiFare || "0");
}

function getMaleTaxiFare() {
  return parseAmount(runtimeConfig.maleTaxiFare || runtimeConfig.defaultTaxiFare || "0");
}

function getTaxiFareForSelection(femaleCount, maleCount, rateMap) {
  const femaleSelectedCount = Math.max(0, Number(femaleCount || 0));
  const maleSelectedCount = Math.max(0, Number(maleCount || 0));

  if (femaleSelectedCount === 1 && maleSelectedCount === 1) {
    return getRateValue(rateMap, "taxi_mixed_1_1") || (getFemaleTaxiFare() + getMaleTaxiFare());
  }

  if (femaleSelectedCount === 2 && maleSelectedCount === 0) {
    return getRateValue(rateMap, "taxi_female_2") || (2 * getFemaleTaxiFare());
  }

  if (femaleSelectedCount === 0 && maleSelectedCount === 2) {
    return getRateValue(rateMap, "taxi_male_2") || (2 * getMaleTaxiFare());
  }

  if (femaleSelectedCount === 1 && maleSelectedCount === 0) {
    return getRateValue(rateMap, "taxi_female_1") || getFemaleTaxiFare();
  }

  if (femaleSelectedCount === 0 && maleSelectedCount === 1) {
    return getRateValue(rateMap, "taxi_male_1") || getMaleTaxiFare();
  }

  const totalFare = (femaleSelectedCount * getFemaleTaxiFare()) + (maleSelectedCount * getMaleTaxiFare());

  return totalFare > 0 ? totalFare : getTaxiFareDefault();
}

function getUsdExchangeRate() {
  const rate = parseAmount(runtimeConfig.usdExchangeRate || "56");
  return rate > 0 ? rate : 56;
}

function getUsdEstimate(valueInPhp) {
  return Number(valueInPhp || 0) / getUsdExchangeRate();
}

function parseAmount(value) {
  const normalized = String(value || "").replace(/[^\d.]/g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-PH", { maximumFractionDigits: 2 }).format(Number(value || 0));
}

function formatUsd(value) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function getInitials(value) {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "?";
}

function renderBranchCard(branch) {
  const name = String(branch.name || "").trim() || "Branch";
  const address = String(branch.address || "").trim();
  const phone = String(branch.phone || "").trim();
  const whatsappNumber = String(branch.whatsapp_number || phone || runtimeConfig.whatsappNumber || "").trim();
  const viberNumber = String(branch.viber_number || phone || runtimeConfig.viberNumber || "").trim();
  const wechatId = String(branch.wechat_id || "").trim();
  const telegramUsername = String(branch.telegram_username || "").trim().replace(/^@/, "");
  const mapLink = String(branch.map_link || "").trim();
  const logoUrl = String(branch.logo_url || "").trim() || buildDriveThumbnailUrl(branch.logo_file_id);
  const qrItems = [
    whatsappNumber ? renderQrCard("WhatsApp", buildWhatsappUrl(whatsappNumber), "whatsapp") : "",
    viberNumber ? renderQrCard("Viber", buildViberUrl(viberNumber), "viber") : "",
    wechatId ? renderQrCard("WeChat", buildWechatQrValue(wechatId), "wechat") : "",
    telegramUsername ? renderQrCard("Telegram", buildTelegramUrl(telegramUsername), "telegram") : ""
  ].filter(Boolean).join("");

  return `
    <article class="branch-card branch-card-rich">
      <div class="branch-card-body">
        ${logoUrl ? `<img class="branch-logo-image" src="${escapeAttribute(logoUrl)}" alt="${escapeAttribute(name)}">` : ""}
        <p class="contact-label">${escapeHtml(name)}</p>
        ${address ? `<p>${escapeHtml(address)}</p>` : ""}
        ${phone ? `<p>${escapeHtml(phone)}</p>` : ""}
        <div class="branch-actions">
          ${whatsappNumber ? `<a class="branch-link" href="${escapeAttribute(buildWhatsappUrl(whatsappNumber))}" target="_blank" rel="noreferrer">${getIconSvg("whatsapp")}<span>WhatsApp</span></a>` : ""}
          ${viberNumber ? `<a class="branch-link" href="${escapeAttribute(buildViberUrl(viberNumber))}">${getIconSvg("viber")}<span>Viber</span></a>` : ""}
          ${wechatId ? `<span class="branch-link branch-link-static">${getIconSvg("wechat")}<span>WeChat: ${escapeHtml(wechatId)}</span></span>` : ""}
          ${telegramUsername ? `<a class="branch-link" href="${escapeAttribute(buildTelegramUrl(telegramUsername))}" target="_blank" rel="noreferrer">${getIconSvg("telegram")}<span>Telegram</span></a>` : ""}
          ${mapLink ? `<a class="branch-link" href="${escapeAttribute(mapLink)}" target="_blank" rel="noreferrer">${getIconSvg("map")}<span>View Map</span></a>` : ""}
        </div>
      </div>
      ${qrItems ? `<div class="branch-qr-grid">${qrItems}</div>` : ""}
    </article>
  `;
}

function renderQrCard(label, value, icon) {
  return `
    <article class="qr-card-mini">
      <div class="qr-card-title">
        ${getIconSvg(icon)}
        <span>${escapeHtml(label)}</span>
      </div>
      ${renderQrVisual(value, label, icon)}
    </article>
  `;
}

function renderQrVisual(value, label, icon) {
  return `
    <div class="qr-code-shell">
      <img src="${escapeAttribute(buildQrCodeUrl(value))}" alt="${escapeAttribute(`${label} QR code`)}">
      <span class="qr-center-badge qr-center-badge-${escapeAttribute(icon)}" aria-hidden="true">
        ${getIconSvg(icon)}
      </span>
    </div>
  `;
}

function renderSocialLinks() {
  const containers = Array.from(document.querySelectorAll("[data-social-links]"));

  if (!containers.length) {
    return;
  }

  const socials = [
    { key: "facebookUrl", label: "Facebook", icon: "facebook" },
    { key: "xUrl", label: "X", icon: "x" },
    { key: "instagramUrl", label: "Instagram", icon: "instagram" }
  ].filter((item) => runtimeConfig[item.key]);

  containers.forEach((container) => {
    container.innerHTML = socials.map((item) => `
      <a class="social-link" href="${escapeAttribute(runtimeConfig[item.key])}" target="_blank" rel="noreferrer" aria-label="${escapeAttribute(item.label)}">
        ${getIconSvg(item.icon)}
        <span>${escapeHtml(item.label)}</span>
      </a>
    `).join("");
  });
}

function buildWhatsappUrl(number) {
  return `https://wa.me/${normalizePhoneNumber(number)}`;
}

function buildViberUrl(number) {
  const normalized = normalizePhoneDisplay(number);
  return `viber://chat?number=${encodeURIComponent(normalized)}`;
}

function buildTelegramUrl(username) {
  return `https://t.me/${encodeURIComponent(String(username || "").replace(/^@/, ""))}`;
}

function buildWechatQrValue(wechatId) {
  return `WeChat ID: ${String(wechatId || "").trim()}`;
}

function buildQrCodeUrl(value) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(value)}`;
}

function buildDriveThumbnailUrl(fileId) {
  const normalized = String(fileId || "").trim();
  return normalized ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(normalized)}&sz=w1200` : "";
}

function extractDriveFileId(value) {
  const trimmedValue = String(value || "").trim();
  if (!trimmedValue) {
    return "";
  }

  const driveFileMatch = trimmedValue.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
  if (driveFileMatch) {
    return driveFileMatch[1];
  }

  const driveOpenMatch = trimmedValue.match(/[?&]id=([^&]+)/i);
  if (trimmedValue.includes("drive.google.com") && driveOpenMatch) {
    return driveOpenMatch[1];
  }

  return "";
}

function buildDriveViewUrl(fileId) {
  const normalized = String(fileId || "").trim();
  return normalized ? `https://drive.google.com/uc?export=view&id=${encodeURIComponent(normalized)}` : "";
}

function normalizePhoneNumber(value) {
  return String(value || "").replace(/[^\d]/g, "");
}

function normalizePhoneDisplay(value) {
  const digits = normalizePhoneNumber(value);

  if (!digits) {
    return "";
  }

  if (digits.startsWith("63")) {
    return `+${digits}`;
  }

  if (digits.startsWith("0")) {
    return `+63${digits.slice(1)}`;
  }

  return `+${digits}`;
}

function getIconSvg(name) {
  const icons = {
    whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20.5 3.5A11.3 11.3 0 0 0 2.9 17.1L1.5 22.5l5.5-1.4A11.3 11.3 0 1 0 20.5 3.5Zm-8.3 17a9.2 9.2 0 0 1-4.7-1.3l-.3-.2-3.2.8.9-3.1-.2-.3a9.2 9.2 0 1 1 7.5 4.1Zm5-6.9c-.3-.1-1.8-.9-2.1-1s-.5-.1-.7.1-.8 1-1 1.1-.4.2-.7 0a7.6 7.6 0 0 1-2.2-1.4 8.3 8.3 0 0 1-1.5-1.9c-.2-.3 0-.5.1-.7l.5-.6.3-.5a.8.8 0 0 0 0-.6l-1-2.5c-.3-.6-.5-.5-.7-.5h-.6a1.2 1.2 0 0 0-.8.4 3.4 3.4 0 0 0-1 2.5c0 1.4 1 2.7 1.1 2.9a12.9 12.9 0 0 0 5 4.3c2 .8 2 .5 2.4.5a2.9 2.9 0 0 0 1.9-1.3 2.3 2.3 0 0 0 .2-1.3c-.1-.1-.3-.2-.6-.3Z"/></svg>',
    viber: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2C6.6 2 3 5.3 3 10.3c0 2.7 1.3 4.8 3.5 6.1V22l4.1-2.2c.5.1 1 .1 1.4.1 5.4 0 9-3.3 9-8.3S17.4 2 12 2Zm4.5 11.7c-.2.5-1.1 1-1.5 1.1-.4 0-.9.2-2.8-.6a9.8 9.8 0 0 1-4.1-3.6c-.6-1-.8-1.8-.8-2.1a2.4 2.4 0 0 1 .7-1.6c.3-.3.6-.4.8-.4h.6c.2 0 .4 0 .6.5l.7 1.7c.1.3.1.4 0 .6l-.3.5-.3.4c-.1.2-.2.4 0 .6.3.5.8 1.1 1.4 1.6.7.6 1.3 1 1.8 1.2.2.1.4 0 .6-.1l.7-.9c.2-.2.4-.3.7-.2l1.6.6c.3.1.5.2.6.4.1.1.1.8-.1 1.3ZM9.3 5.7c2.8-.3 5.6 1.3 6.4 4 .1.3.6.2.5-.1-.9-2.9-3.9-4.7-7-4.4-.3 0-.2.5.1.5Zm-.1 2c1.8-.2 3.7.8 4.3 2.5.1.3.6.2.5-.1-.7-1.9-2.7-3.2-4.9-3-.3 0-.2.6.1.6Zm0 2c.8-.1 1.6.3 1.9 1.1.1.3.6.2.5-.1-.4-1-1.4-1.7-2.5-1.6-.3 0-.2.6.1.6Z"/></svg>',
    wechat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9.3 4C5 4 1.5 6.8 1.5 10.3c0 2 1.1 3.8 2.9 5l-.7 2.5 2.8-1.4c.9.2 1.8.4 2.8.4h.5c-.3-.7-.4-1.5-.4-2.3 0-3.8 3.8-6.9 8.4-6.9h.4C17.6 5.5 13.8 4 9.3 4Zm-2.8 5.1a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8Zm5.6 0a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8ZM17.3 9c-3.5 0-6.3 2.2-6.3 5 0 1.6.9 3 2.3 4l-.5 2 2.2-1.1c.7.2 1.5.3 2.3.3 3.5 0 6.2-2.2 6.2-5s-2.8-5.1-6.2-5.1Zm-2.1 4.1a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6Zm4.3 0a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6Z"/></svg>',
    telegram: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.5 4.8 18.3 20c-.2 1.1-.9 1.4-1.8.9l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5.1 9.3-8.4c.4-.4-.1-.6-.6-.3L5.8 13.5.9 12c-1.1-.3-1.1-1 .2-1.5L20 3.2c.9-.3 1.7.2 1.5 1.6Z"/></svg>',
    eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 5c5.4 0 9.7 4.5 10.9 6-.2.3-.5.7-.9 1.2-1.7 2-5.3 6.8-10 6.8S3.7 14.2 2 12.2c-.4-.5-.7-.9-.9-1.2C2.3 9.5 6.6 5 12 5Zm0 2C8.3 7 5.1 9.7 3.4 11.5c1.7 1.8 4.9 4.5 8.6 4.5s6.9-2.7 8.6-4.5C18.9 9.7 15.7 7 12 7Zm0 1.8A3.2 3.2 0 1 1 8.8 12 3.2 3.2 0 0 1 12 8.8Zm0 2A1.2 1.2 0 1 0 13.2 12 1.2 1.2 0 0 0 12 10.8Z"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.5 22v-8h2.7l.4-3h-3V9.2c0-.9.3-1.5 1.6-1.5h1.5V5c-.7-.1-1.5-.1-2.2-.1-2.2 0-3.8 1.4-3.8 4V11H8v3h2.7v8h2.8Z"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.9 2H22l-6.8 7.8L23 22h-6.1l-4.8-6.4L6.5 22H3.4l7.3-8.3L1 2h6.2l4.3 5.8L18.9 2Zm-1.1 18h1.7L6.3 3.9H4.5L17.8 20Z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm0 2.2A2.8 2.8 0 0 0 4.2 7v10A2.8 2.8 0 0 0 7 19.8h10a2.8 2.8 0 0 0 2.8-2.8V7A2.8 2.8 0 0 0 17 4.2H7Zm10.3 1.6a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2.2A2.8 2.8 0 1 0 12 15a2.8 2.8 0 0 0 0-5.6Z"/></svg>',
    map: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z"/></svg>'
  };

  return `<span class="inline-icon inline-icon-${escapeAttribute(name)}">${icons[name] || ""}</span>`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function initGoogleTranslate() {
  const containers = Array.from(document.querySelectorAll("[data-google-translate]"));

  if (!containers.length) {
    return;
  }

  window.googleTranslateElementInit = function googleTranslateElementInit() {
    if (!(window.google && window.google.translate && window.google.translate.TranslateElement)) {
      return;
    }

    containers.forEach((container, index) => {
      if (container.dataset.initialized === "true") {
        return;
      }

      const elementId = container.id || `google_translate_element_${index}`;
      container.id = elementId;

      new window.google.translate.TranslateElement(
        {
          pageLanguage: "en",
          autoDisplay: false,
          layout: window.google.translate.TranslateElement.InlineLayout.SIMPLE
        },
        elementId
      );

      container.dataset.initialized = "true";
    });
  };

  if (window.google && window.google.translate && window.google.translate.TranslateElement) {
    window.googleTranslateElementInit();
    return;
  }

  if (document.querySelector("script[data-google-translate-script]")) {
    return;
  }

  const script = document.createElement("script");
  script.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
  script.async = true;
  script.dataset.googleTranslateScript = "true";
  document.head.appendChild(script);
}
