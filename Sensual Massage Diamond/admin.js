const adminConfig = window.SITE_CONFIG || {};
const adminApiBaseUrl = adminConfig.apiBaseUrl || "";
const adminSupabaseUrl = adminConfig.supabaseUrl || "";
const adminSupabaseAnonKey = adminConfig.supabaseAnonKey || "";
const adminSessionStorageKey = "supabaseAdminSession";
let supabaseClient = null;

async function withTimeout(promise, ms, timeoutMessage) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

const adminSheetDefinitions = {
  branches: {
    label: "Branches",
    entryLabel: "Branch",
    fields: [
      { key: "id", type: "hidden", readOnly: true },
      { key: "id", type: "hidden", readOnly: true },
      { key: "name", label: "Branch Name", placeholder: "Example: Makati Branch", required: true },
      { key: "address", label: "Address", type: "textarea", placeholder: "Full branch address", required: true },
      { key: "phone", label: "Phone", placeholder: "+63 917 000 0000" },
      { key: "email", label: "Booking Email", type: "email", placeholder: "branch@example.com" },
      { key: "whatsapp_number", label: "WhatsApp Number", placeholder: "639170000000" },
      { key: "viber_number", label: "Viber Number", placeholder: "639170000000" },
      { key: "wechat_id", label: "WeChat ID", placeholder: "your_wechat_id" },
      { key: "telegram_username", label: "Telegram Username", placeholder: "yourtelegram" },
      { key: "map_link", label: "Google Maps Link", placeholder: "https://maps.google.com/..." },
      { key: "logo_url", label: "Branch Photo", placeholder: "Paste image URL or upload from device" },
      { key: "logo_file_id", label: "Branch Photo File ID", placeholder: "Auto-filled after save", readOnly: true },
      { key: "active", label: "Show on website", type: "select", options: ["TRUE", "FALSE"], defaultValue: "TRUE" }
    ]
  },
  services: {
    label: "Services",
    entryLabel: "Service",
    fields: [
      { key: "id", type: "hidden", readOnly: true },
      { key: "branch", label: "Branch", type: "select", optionsSource: "branches", allowBlank: true, blankLabel: "All branches" },
      { key: "name", label: "Service Name", placeholder: "Example: Signature Relaxation Massage", required: true },
      { key: "description", label: "Description", type: "textarea", placeholder: "Short service description", required: true },
      { key: "duration", label: "Duration", placeholder: "60 mins | 90 mins" },
      { key: "female_rate", label: "Female Rate", type: "number", placeholder: "1500" },
      { key: "male_rate", label: "Male Rate", type: "number", placeholder: "1800" },
      { key: "category", label: "Category", placeholder: "Example: Relaxation" },
      { key: "active", label: "Show on website", type: "select", options: ["TRUE", "FALSE"], defaultValue: "TRUE" }
    ]
  },
  staff: {
    label: "Staff",
    entryLabel: "Therapist",
    fields: [
      { key: "id", type: "hidden", readOnly: true },
      { key: "branch", label: "Branch", type: "select", optionsSource: "branches", required: true },
      { key: "name", label: "Name", placeholder: "Therapist name", required: true },
      { key: "gender", label: "Gender", type: "select", options: ["Female", "Male"], defaultValue: "Female" },
      { key: "role", label: "Role", placeholder: "Example: Senior Therapist" },
      { key: "specialty", label: "Specialty", placeholder: "Example: Deep Tissue" },
      { key: "age", label: "Age", type: "number", placeholder: "21" },
      { key: "height", label: "Height", placeholder: "Example: 165 cm" },
      { key: "weight", label: "Weight", placeholder: "Example: 55 kg" },
      { key: "image_urls", label: "Profile Pictures", type: "textarea", placeholder: "Paste image URLs or upload from device", required: true },
      { key: "bio", label: "Short Bio", type: "textarea", placeholder: "Short introduction for the therapist" },
      { key: "active", label: "Show on website", type: "select", options: ["TRUE", "FALSE"], defaultValue: "TRUE" }
    ]
  },
  promos: {
    label: "Promos",
    entryLabel: "Promo",
    fields: [
      { key: "id", type: "hidden", readOnly: true },
      { key: "branch", label: "Branch", type: "select", optionsSource: "branches", allowBlank: true, blankLabel: "All branches" },
      { key: "title", label: "Promo Title", placeholder: "Example: Intro Bliss Package", required: true },
      { key: "description", label: "Description", type: "textarea", placeholder: "Promo details", required: true },
      { key: "label", label: "Tag Label", placeholder: "Best Seller" },
      { key: "active", label: "Show on website", type: "select", options: ["TRUE", "FALSE"], defaultValue: "TRUE" }
    ]
  },
  slides: {
    label: "Slides",
    entryLabel: "Slide",
    fields: [
      { key: "id", type: "hidden", readOnly: true },
      { key: "branch", label: "Branch", type: "select", optionsSource: "branches", allowBlank: true, blankLabel: "All branches" },
      { key: "title", label: "Slide Title", placeholder: "Optional title" },
      { key: "subtitle", label: "Subtitle", type: "textarea", placeholder: "Optional subtitle" },
      { key: "image_url", label: "Slide Image", placeholder: "Paste image URL or upload from device", required: true },
      { key: "alt_text", label: "Image Alt Text", placeholder: "Describe the image" },
      { key: "button_text", label: "Button Text", placeholder: "Book Now" },
      { key: "button_link", label: "Button Link", placeholder: "booking.html" },
      { key: "active", label: "Show on website", type: "select", options: ["TRUE", "FALSE"], defaultValue: "TRUE" }
    ]
  },
  home_sections: {
    label: "Home Sections",
    entryLabel: "Section",
    fields: [
      { key: "id", type: "hidden", readOnly: true },
      { key: "branch", label: "Branch", type: "select", optionsSource: "branches", allowBlank: true, blankLabel: "All branches" },
      { key: "section_key", label: "Section Key", placeholder: "Example: booking_block", required: true },
      { key: "title", label: "Title", placeholder: "Section title", required: true },
      { key: "description", label: "Description", type: "textarea", placeholder: "Section description", required: true },
      { key: "image_url", label: "Section Image", placeholder: "Paste image URL or upload from device" },
      { key: "button_text", label: "Button Text", placeholder: "Book Now" },
      { key: "button_link", label: "Button Link", placeholder: "booking.html" },
      { key: "active", label: "Show on website", type: "select", options: ["TRUE", "FALSE"], defaultValue: "TRUE" }
    ]
  },
  rates: {
    label: "Rates",
    entryLabel: "Rate",
    fields: [
      { key: "id", type: "hidden", readOnly: true },
      { key: "branch", label: "Branch", type: "select", optionsSource: "branches", allowBlank: true, blankLabel: "All branches" },
      { key: "key", label: "Rate Key", placeholder: "Auto-generated from label", readOnly: true },
      { key: "label", label: "Label", placeholder: "Example: 1 Female Service", required: true },
      { key: "amount", label: "Amount", type: "number", placeholder: "5000", required: true },
      { key: "category", label: "Category", type: "select", options: ["service", "taxi"], defaultValue: "service" },
      { key: "active", label: "Use this rate", type: "select", options: ["TRUE", "FALSE"], defaultValue: "TRUE" }
    ]
  },
  settings: {
    label: "Settings",
    entryLabel: "Setting",
    fields: [
      { key: "id", type: "hidden", readOnly: true },
      { key: "key", label: "Setting Key", placeholder: "Example: hero_title", required: true },
      { key: "value", label: "Setting Value", type: "textarea", placeholder: "Enter setting value", required: true }
    ]
  },
  bookings: {
    label: "Bookings",
    entryLabel: "Booking",
    fields: [
      { key: "id", type: "hidden", readOnly: true },
      { key: "branch", label: "Branch", type: "select", optionsSource: "branches", allowBlank: true, blankLabel: "Select branch" },
      { key: "timestamp", label: "Created At", placeholder: "Auto-filled or manual edit" },
      { key: "name", label: "Customer Name", placeholder: "Customer full name", required: true },
      { key: "phone", label: "Phone", placeholder: "+63 917 000 0000" },
      { key: "service", label: "Service", type: "select", optionsSource: "services", allowBlank: true, blankLabel: "Select service" },
      { key: "female_therapist_count", label: "Female Therapist Count", type: "number", placeholder: "0" },
      { key: "male_therapist_count", label: "Male Therapist Count", type: "number", placeholder: "0" },
      { key: "date", label: "Date", type: "date" },
      { key: "time", label: "Time", type: "time" },
      { key: "female_therapists", label: "Female Therapists", placeholder: "Comma-separated names" },
      { key: "male_therapists", label: "Male Therapists", placeholder: "Comma-separated names" },
      { key: "estimated_service_cost", label: "Service Estimate", type: "number", placeholder: "0" },
      { key: "taxi_fare", label: "Taxi Fare", type: "number", placeholder: "0" },
      { key: "total_estimate", label: "Total Estimate", type: "number", placeholder: "0" },
      { key: "agreement", label: "Agreement", type: "select", options: ["Yes", "No"], defaultValue: "No" },
      { key: "notes", label: "Notes", type: "textarea", placeholder: "Customer notes" },
      { key: "status", label: "Status", type: "select", options: ["New", "Confirmed", "Completed", "Cancelled"], defaultValue: "New" }
    ]
  },
};

const adminState = { token: "", data: {} };

document.addEventListener("DOMContentLoaded", async () => {
  const loginForm = document.querySelector("[data-admin-login-form]");
  const refreshButton = document.querySelector("[data-admin-refresh]");
  const logoutButton = document.querySelector("[data-admin-logout]");

  if (!loginForm) {
    return;
  }

  initializeSupabaseClient();
  loginForm.addEventListener("submit", handleAdminLogin);

  if (refreshButton) {
    refreshButton.addEventListener("click", loadAdminData);
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", logoutAdmin);
  }

  const savedToken = await restoreAdminSession();

  if (savedToken) {
    adminState.token = savedToken;
    showAdminApp(true);
    loadAdminData();
  }
});

function initializeSupabaseClient() {
  if (supabaseClient) {
    return supabaseClient;
  }

  if (!adminSupabaseUrl || !adminSupabaseAnonKey || !window.supabase || !window.supabase.createClient) {
    return null;
  }

  supabaseClient = window.supabase.createClient(adminSupabaseUrl, adminSupabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: adminSessionStorageKey
    }
  });

  return supabaseClient;
}

async function restoreAdminSession() {
  const client = initializeSupabaseClient();

  if (!client) {
    return "";
  }

  const { data, error } = await client.auth.getSession();
  if (error || !data?.session?.access_token) {
    console.warn("Failed to restore admin session.", error);
    await clearAdminSession();
    return "";
  }

  const accessToken = String(data.session.access_token).trim();
  adminState.token = accessToken;
  return accessToken;
}

async function handleAdminLogin(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const status = document.querySelector("[data-admin-login-status]");
  const payload = Object.fromEntries(new FormData(form).entries());

  if (status) {
    status.textContent = "Logging in...";
    status.classList.remove("is-error", "is-success");
  }

  try {
    const client = initializeSupabaseClient();

    if (!client) {
      throw new Error("Supabase admin login is not configured yet.");
    }

    const { data, error } = await withTimeout(
      client.auth.signInWithPassword({
        email: String(payload.email || "").trim(),
        password: String(payload.password || "")
      }),
      15000,
      "Login request timed out. Check your internet connection and try again."
    );

    if (error || !data.session) {
      throw new Error(error?.message || "Login failed.");
    }

    adminState.token = data.session.access_token || "";
    form.reset();

    if (status) {
      status.textContent = "Login successful.";
      status.classList.add("is-success");
    }

    showAdminApp(true);
    await loadAdminData();
  } catch (error) {
    if (status) {
      status.textContent = error.message || "Login failed.";
      status.classList.add("is-error");
    }
  }
}

async function loadAdminData() {
  const token = getAdminToken();
  const panels = document.querySelector("[data-admin-panels]");

  if (!token || !panels) {
    return;
  }

  panels.innerHTML = "<div class='contact-card'><p>Loading admin data...</p></div>";

  try {
    const result = await postAdminAction({ action: "adminGetData" });
    adminState.data = result.data || {};

    // Process branch mappings
    const branches = adminState.data.branches || [];
    const branchNameById = new Map();
    const branchIdByName = new Map();
    branches.forEach(branch => {
      branchNameById.set(branch.id, branch.name);
      branchIdByName.set(branch.name, branch.id);
    });
    adminState.branchIdByName = branchIdByName;

    // Map branch_id to branch name for display
    ['staff', 'slides', 'services', 'rates', 'promos', 'home_sections'].forEach(sheetKey => {
      if (adminState.data[sheetKey]) {
        adminState.data[sheetKey] = adminState.data[sheetKey].map(row => ({
          ...row,
          branch: branchNameById.get(row.branch_id) || '',
        }));
      }
    });

    // Populate branch select
    const branchSelect = document.getElementById("admin-branch-select");
    if (branchSelect) {
      branchSelect.innerHTML = '<option value="">All branches</option>' + branches.map(branch => `<option value="${escapeHtml(branch.name)}">${escapeHtml(branch.name)}</option>`).join('');
      branchSelect.addEventListener('change', () => {
        renderAdminPanels();
      });
    }

    renderAdminTabs();
    renderAdminPanels();
    showAdminApp(true);
  } catch (error) {
    panels.innerHTML = `<div class="contact-card"><p>${escapeHtml(error.message || "Failed to load admin data.")}</p></div>`;
  }
}

function renderAdminTabs() {
  const tabs = document.querySelector("[data-admin-tabs]");
  const sheetKeys = Object.keys(adminSheetDefinitions);

  if (!tabs) {
    return;
  }

  tabs.innerHTML = sheetKeys.map((sheetKey, index) => `
    <button class="admin-tab${index === 0 ? " active" : ""}" type="button" data-admin-tab="${sheetKey}">
      ${adminSheetDefinitions[sheetKey].label}
    </button>
  `).join("");

  tabs.querySelectorAll("[data-admin-tab]").forEach((button) => {
    button.addEventListener("click", () => activateAdminPanel(button.dataset.adminTab));
  });
}

function renderAdminPanels() {
  const panels = document.querySelector("[data-admin-panels]");
  const sheetKeys = Object.keys(adminSheetDefinitions);

  if (!panels) {
    return;
  }

  panels.innerHTML = sheetKeys.map((sheetKey, index) => renderAdminPanel(sheetKey, index === 0)).join("");

  panels.querySelectorAll("[data-admin-add-row]").forEach((button) => {
    button.addEventListener("click", () => addAdminRow(button.dataset.adminAddRow));
  });

  panels.querySelectorAll("[data-admin-save-sheet]").forEach((button) => {
    button.addEventListener("click", () => saveAdminSheet(button.dataset.adminSaveSheet));
  });

  bindDeleteButtons();
  bindStaffPreviewInputs();
  bindBranchPreviewInputs();
  bindRateKeyInputs();
  bindUploadInputs();
}

function renderAdminPanel(sheetKey, isActive) {
  const definition = adminSheetDefinitions[sheetKey];
  let rows = Array.isArray(adminState.data[sheetKey]) ? adminState.data[sheetKey] : [];
  if (['staff', 'slides', 'services', 'rates', 'promos', 'home_sections'].includes(sheetKey)) {
    const selectedBranch = document.getElementById("admin-branch-select")?.value || '';
    if (selectedBranch) {
      rows = rows.filter(row => row.branch === selectedBranch);
    }
  }
  const emptyMessage = `No ${definition.label.toLowerCase()} yet. Click Add ${definition.entryLabel}.`;

  return `
    <section class="admin-panel${isActive ? " active" : ""}" data-admin-panel="${sheetKey}">
      <div class="admin-panel-head">
        <div>
          <p class="contact-label">${definition.label}</p>
          <h3>${definition.label}</h3>
        </div>
        <div class="admin-panel-actions">
          <button class="button secondary" type="button" data-admin-add-row="${sheetKey}">Add ${definition.entryLabel}</button>
          <button class="button primary" type="button" data-admin-save-sheet="${sheetKey}">Save ${definition.label}</button>
        </div>
      </div>
      <div class="admin-record-list" data-admin-record-list="${sheetKey}">
        ${rows.length ? rows.map((row, index) => renderAdminRecord(sheetKey, row, index)).join("") : `<p class="admin-empty">${escapeHtml(emptyMessage)}</p>`}
      </div>
      <p class="form-status" data-admin-status="${sheetKey}"></p>
    </section>
  `;
}

function renderAdminRecord(sheetKey, row, index) {
  const definition = adminSheetDefinitions[sheetKey];
  const preview = sheetKey === "staff"
    ? renderStaffAdminPreview(row)
    : sheetKey === "branches"
      ? renderBranchAdminPreview(row)
      : "";

  return `
    <article class="admin-record" data-admin-record="${sheetKey}">
      <div class="admin-record-head">
        <strong>${definition.entryLabel} ${index + 1}</strong>
        <button class="button secondary admin-delete-button" type="button" data-admin-delete-row>Delete</button>
      </div>
      ${preview}
      <div class="admin-form-grid">
        ${definition.fields.map((field) => renderAdminField(field, row[field.key])).join("")}
      </div>
    </article>
  `;
}

function renderStaffAdminPreview(row) {
  const name = String(row.name || "").trim() || "Therapist Preview";
  const imageUrls = normalizeStaffImageList(String(row.image_urls || ""));
  const imageUrl = imageUrls[0] || "";
  const visual = imageUrl
    ? `<img class="admin-staff-preview-image" src="${escapeAttribute(imageUrl)}" alt="${escapeAttribute(name)}" data-staff-preview-image>`
    : `<div class="admin-staff-preview-placeholder" data-staff-preview-image>${escapeHtml(getInitials(name))}</div>`;
  const gallery = imageUrls.length
    ? `<div class="admin-staff-preview-gallery">${imageUrls.map((url, index) => `<img class="admin-staff-preview-thumb" src="${escapeAttribute(url)}" alt="${escapeAttribute(name)} photo ${index + 1}">`).join("")}</div>`
    : "";

  return `
    <div class="admin-staff-preview">
      ${visual}
      <div class="admin-staff-preview-copy">
        <p class="contact-label">Profile Picture</p>
        <strong data-staff-preview-name>${escapeHtml(name)}</strong>
        ${gallery}
      </div>
    </div>
  `;
}

function renderBranchAdminPreview(row) {
  const name = String(row.name || "").trim() || "Branch Preview";
  const logoUrl = normalizeImageUrl(String(row.logo_url || "").trim());
  const logoFileId = String(row.logo_file_id || "").trim();
  const previewUrl = logoUrl || (logoFileId ? `https://drive.google.com/thumbnail?id=${logoFileId}&sz=w320` : "");
  const visual = previewUrl
    ? `<img class="admin-branch-logo" src="${escapeAttribute(previewUrl)}" alt="${escapeAttribute(name)}" data-branch-logo>`
    : `<div class="admin-branch-logo-placeholder" data-branch-logo>${escapeHtml(name.charAt(0) || "B")}</div>`;

  return `
    <div class="admin-branch-preview">
      ${visual}
      <div class="admin-branch-preview-copy">
        <p class="contact-label">Branch Photo</p>
        <strong data-branch-preview-name>${escapeHtml(name)}</strong>
      </div>
    </div>
  `;
}

function renderAdminField(field, value) {
  const normalizedValue = value ?? field.defaultValue ?? "";
  const uploadControl = renderUploadControl(field);

  if (field.type === "textarea") {
    const textareaRows = field.key === "image_urls" ? 8 : 4;
    const helperText = field.key === "image_urls"
      ? `<small class="admin-field-hint">Paste one image URL per line. Minimum 1 photo, maximum 10 photos.</small>`
      : "";

    return `
      <label class="admin-field admin-field-full">
        <span>${escapeHtml(field.label)}</span>
        <textarea data-field="${field.key}" rows="${textareaRows}" placeholder="${escapeAttribute(field.placeholder || "")}" ${field.readOnly ? "readonly" : ""}>${escapeHtml(normalizedValue)}</textarea>
        ${helperText}
        ${uploadControl}
      </label>
    `;
  }

  if (field.key === "branch") {
    const branches = adminState.data.branches || [];
    const optionsHtml = `${field.allowBlank ? `<option value="">${escapeHtml(field.blankLabel || "Select branch")}</option>` : ""}${branches.map(branch => `<option value="${escapeAttribute(branch.name)}"${String(branch.name) === String(normalizedValue) ? ' selected' : ''}>${escapeHtml(branch.name)}</option>`).join('')}`;
    return `
      <label class="admin-field">
        <span>${escapeHtml(field.label)}</span>
        <select data-field="${field.key}" ${field.required ? "required" : ""}>
          ${optionsHtml}
        </select>
      </label>
    `;
  }

  if (field.type === "select") {
    const options = getFieldOptions(field);
    return `
      <label class="admin-field">
        <span>${escapeHtml(field.label)}</span>
        <select data-field="${field.key}" ${field.readOnly ? "disabled" : ""} ${field.required ? "required" : ""}>
          ${field.allowBlank ? `<option value="">${escapeHtml(field.blankLabel || "Select option")}</option>` : ""}
          ${options.map((option) => `<option value="${escapeAttribute(option)}"${String(normalizedValue) === String(option) ? " selected" : ""}>${escapeHtml(option)}</option>`).join("")}
        </select>
      </label>
    `;
  }

  return `
    <label class="admin-field">
      <span>${escapeHtml(field.label)}</span>
      <input type="${escapeAttribute(field.type || "text")}" data-field="${field.key}" value="${escapeAttribute(normalizedValue)}" placeholder="${escapeAttribute(field.placeholder || "")}" ${field.readOnly ? "readonly" : ""} ${field.required ? "required" : ""}>
      ${uploadControl}
    </label>
  `;
}

function renderUploadControl(field) {
  if (!isUploadField(field.key) || field.readOnly) {
    return "";
  }

  const isMultiple = field.key === "image_urls";
  const helperText = isMultiple
    ? "Upload up to 10 images from this device."
    : "Upload an image from this device.";

  return `
    <div class="admin-upload-control">
      <label class="admin-upload-button">
        <span>Upload From Device</span>
        <input type="file" accept="image/*"${isMultiple ? " multiple" : ""} data-upload-field="${field.key}">
      </label>
      <small class="admin-field-hint">${helperText}</small>
    </div>
  `;
}

function isUploadField(fieldKey) {
  return fieldKey === "logo_url" || fieldKey === "image_url" || fieldKey === "image_urls";
}

function activateAdminPanel(sheetKey) {
  document.querySelectorAll("[data-admin-tab]").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.adminTab === sheetKey);
  });

  document.querySelectorAll("[data-admin-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.adminPanel === sheetKey);
  });
}

function addAdminRow(sheetKey) {
  const list = document.querySelector(`[data-admin-record-list="${sheetKey}"]`);
  const definition = adminSheetDefinitions[sheetKey];

  if (!list || !definition) {
    return;
  }

  list.querySelector(".admin-empty")?.remove();
  list.insertAdjacentHTML("beforeend", renderAdminRecord(sheetKey, createEmptyRow(definition), list.querySelectorAll("[data-admin-record]").length));
  bindDeleteButtons();
  bindStaffPreviewInputs();
  bindBranchPreviewInputs();
  bindRateKeyInputs();
  bindUploadInputs();
}

function bindDeleteButtons() {
  document.querySelectorAll("[data-admin-delete-row]").forEach((button) => {
    if (button.dataset.bound === "true") {
      return;
    }

    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      const record = button.closest("[data-admin-record]");
      const list = record?.parentElement;
      const panel = button.closest("[data-admin-panel]");
      const sheetKey = panel?.dataset.adminPanel || "";
      record?.remove();

      if (list && !list.querySelector("[data-admin-record]") && sheetKey) {
        const definition = adminSheetDefinitions[sheetKey];
        list.innerHTML = `<p class="admin-empty">${escapeHtml(`No ${definition.label.toLowerCase()} yet. Click Add ${definition.entryLabel}.`)}</p>`;
      }
    });
  });
}

function bindStaffPreviewInputs() {
  document.querySelectorAll('[data-admin-panel="staff"] [data-admin-record]').forEach((record) => {
    const nameInput = record.querySelector('[data-field="name"]');
    const imageInput = record.querySelector('[data-field="image_urls"]');

    const updatePreview = () => {
      const name = String(nameInput?.value || "").trim() || "Therapist Preview";
      const imageUrls = normalizeStaffImageList(String(imageInput?.value || ""));
      const imageUrl = imageUrls[0] || "";
      const nameNode = record.querySelector("[data-staff-preview-name]");
      let imageNode = record.querySelector("[data-staff-preview-image]");
      const copyNode = record.querySelector(".admin-staff-preview-copy");
      const galleryMarkup = imageUrls.length
        ? `<div class="admin-staff-preview-gallery">${imageUrls.map((url, index) => `<img class="admin-staff-preview-thumb" src="${escapeAttribute(url)}" alt="${escapeAttribute(name)} photo ${index + 1}">`).join("")}</div>`
        : "";
      const existingGallery = record.querySelector(".admin-staff-preview-gallery");

      if (imageInput) {
        imageInput.value = imageUrls.join("\n");
      }

      if (nameNode) {
        nameNode.textContent = name;
      }

      if (!imageNode) {
        return;
      }

      if (galleryMarkup) {
        if (existingGallery) {
          existingGallery.outerHTML = galleryMarkup;
        } else {
          copyNode?.insertAdjacentHTML("beforeend", galleryMarkup);
        }
      } else if (existingGallery) {
        existingGallery.remove();
      }

      if (imageUrl) {
        if (imageNode.tagName !== "IMG") {
          imageNode.outerHTML = `<img class="admin-staff-preview-image" src="${escapeAttribute(imageUrl)}" alt="${escapeAttribute(name)}" data-staff-preview-image>`;
          imageNode = record.querySelector("[data-staff-preview-image]");
        }
        imageNode.src = imageUrl;
        imageNode.alt = name;
        return;
      }

      if (imageNode.tagName === "IMG") {
        imageNode.outerHTML = `<div class="admin-staff-preview-placeholder" data-staff-preview-image>${escapeHtml(getInitials(name))}</div>`;
        return;
      }

      imageNode.textContent = getInitials(name);
    };

    if (nameInput && nameInput.dataset.previewBound !== "true") {
      nameInput.dataset.previewBound = "true";
      nameInput.addEventListener("input", updatePreview);
    }

    if (imageInput && imageInput.dataset.previewBound !== "true") {
      imageInput.dataset.previewBound = "true";
      imageInput.addEventListener("blur", updatePreview);
      imageInput.addEventListener("input", updatePreview);
    }
  });
}

function bindBranchPreviewInputs() {
  document.querySelectorAll('[data-admin-panel="branches"] [data-admin-record]').forEach((record) => {
    const nameInput = record.querySelector('[data-field="name"]');
    const logoInput = record.querySelector('[data-field="logo_url"]');
    const fileIdInput = record.querySelector('[data-field="logo_file_id"]');

    const updatePreview = () => {
      const name = String(nameInput?.value || "").trim() || "Branch Preview";
      const rawLogoValue = String(logoInput?.value || "").trim();
      const logoUrl = normalizeImageUrl(rawLogoValue);
      const logoFileId = extractDriveFileId(rawLogoValue);
      const previewUrl = logoUrl || (logoFileId ? `https://drive.google.com/thumbnail?id=${logoFileId}&sz=w320` : "");
      const nameNode = record.querySelector("[data-branch-preview-name]");
      let logoNode = record.querySelector("[data-branch-logo]");

      if (logoInput && logoInput.value !== logoUrl) {
        logoInput.value = logoUrl;
      }

      if (fileIdInput) {
        fileIdInput.value = logoFileId;
      }

      if (nameNode) {
        nameNode.textContent = name;
      }

      if (!logoNode) {
        return;
      }

      if (previewUrl) {
        if (logoNode.tagName !== "IMG") {
          logoNode.outerHTML = `<img class="admin-branch-logo" src="${escapeAttribute(previewUrl)}" alt="${escapeAttribute(name)}" data-branch-logo>`;
          logoNode = record.querySelector("[data-branch-logo]");
        }
        logoNode.src = previewUrl;
        logoNode.alt = name;
        return;
      }

      if (logoNode.tagName === "IMG") {
        logoNode.outerHTML = `<div class="admin-branch-logo-placeholder" data-branch-logo>${escapeHtml(name.charAt(0) || "B")}</div>`;
        return;
      }

      logoNode.textContent = name.charAt(0) || "B";
    };

    if (nameInput && nameInput.dataset.branchPreviewBound !== "true") {
      nameInput.dataset.branchPreviewBound = "true";
      nameInput.addEventListener("input", updatePreview);
    }

    if (logoInput && logoInput.dataset.branchPreviewBound !== "true") {
      logoInput.dataset.branchPreviewBound = "true";
      logoInput.addEventListener("blur", updatePreview);
      logoInput.addEventListener("input", updatePreview);
    }
  });
}

function bindRateKeyInputs() {
  document.querySelectorAll('[data-admin-panel="rates"] [data-admin-record]').forEach((record) => {
    const labelInput = record.querySelector('[data-field="label"]');
    const categoryInput = record.querySelector('[data-field="category"]');
    const keyInput = record.querySelector('[data-field="key"]');

    const updateKey = () => {
      if (!keyInput) {
        return;
      }

      keyInput.value = inferRateKey(String(categoryInput?.value || ""), String(labelInput?.value || ""));
    };

    if (labelInput && labelInput.dataset.rateKeyBound !== "true") {
      labelInput.dataset.rateKeyBound = "true";
      labelInput.addEventListener("input", updateKey);
      labelInput.addEventListener("blur", updateKey);
    }

    if (categoryInput && categoryInput.dataset.rateKeyBound !== "true") {
      categoryInput.dataset.rateKeyBound = "true";
      categoryInput.addEventListener("change", updateKey);
      categoryInput.addEventListener("input", updateKey);
    }

    updateKey();
  });
}

function bindUploadInputs() {
  document.querySelectorAll("[data-upload-field]").forEach((input) => {
    if (input.dataset.uploadBound === "true") {
      return;
    }

    input.dataset.uploadBound = "true";
    input.addEventListener("change", handleAdminFileUpload);
  });
}

async function handleAdminFileUpload(event) {
  const input = event.currentTarget;
  const files = Array.from(input.files || []);
  const fieldKey = String(input.dataset.uploadField || "").trim();
  const record = input.closest("[data-admin-record]");
  const panel = input.closest("[data-admin-panel]");
  const sheetKey = String(panel?.dataset.adminPanel || "").trim();
  const status = sheetKey ? document.querySelector(`[data-admin-status="${sheetKey}"]`) : null;

  if (!files.length || !fieldKey || !record || !sheetKey) {
    return;
  }

  try {
    if (status) {
      status.textContent = "Uploading image...";
      status.classList.remove("is-error", "is-success");
    }

    const uploadedUrls = await uploadFilesToStorage(files, sheetKey, fieldKey);
    const targetInput = record.querySelector(`[data-field="${fieldKey}"]`);

    if (!targetInput) {
      throw new Error("Image field not found.");
    }

    if (fieldKey === "image_urls") {
      const existingUrls = normalizeStaffImageList(String(targetInput.value || ""));
      targetInput.value = [...existingUrls, ...uploadedUrls].slice(0, 10).join("\n");
    } else {
      targetInput.value = uploadedUrls[0] || "";
    }

    if (fieldKey === "logo_url") {
      const fileIdInput = record.querySelector('[data-field="logo_file_id"]');
      if (fileIdInput) {
        fileIdInput.value = "";
      }
    }

    targetInput.dispatchEvent(new Event("input", { bubbles: true }));
    targetInput.dispatchEvent(new Event("blur", { bubbles: true }));
    input.value = "";

    if (status) {
      status.textContent = "Image uploaded successfully.";
      status.classList.add("is-success");
    }
  } catch (error) {
    if (status) {
      status.textContent = error.message || "Image upload failed.";
      status.classList.add("is-error");
    }
  }
}

async function uploadFilesToStorage(files, sheetKey, fieldKey) {
  const client = initializeSupabaseClient();

  if (!client) {
    throw new Error("Supabase is not configured for uploads.");
  }

  const safeFiles = files.slice(0, fieldKey === "image_urls" ? 10 : 1);
  const uploadedUrls = [];

  for (const file of safeFiles) {
    const extension = getFileExtension(file.name);
    const safeName = sanitizeFileName(file.name || "upload");
    const filePath = `admin/${sheetKey}/${fieldKey}/${Date.now()}-${createRandomId()}-${safeName}${extension}`;

    const { error } = await client.storage.from("site-media").upload(filePath, file, {
      cacheControl: "3600",
      upsert: false
    });

    if (error) {
      throw new Error(error.message || "Upload failed.");
    }

    const { data } = client.storage.from("site-media").getPublicUrl(filePath);
    uploadedUrls.push(String(data?.publicUrl || "").trim());
  }

  return uploadedUrls.filter(Boolean);
}

function sanitizeFileName(fileName) {
  const trimmedName = String(fileName || "").trim().replace(/\.[^.]+$/, "");
  const normalized = trimmedName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "image";
}

function getFileExtension(fileName) {
  const match = String(fileName || "").trim().match(/(\.[a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : "";
}

function createRandomId() {
  return Math.random().toString(36).slice(2, 10);
}

async function saveAdminSheet(sheetKey) {
  const token = getAdminToken();
  const list = document.querySelector(`[data-admin-record-list="${sheetKey}"]`);
  const status = document.querySelector(`[data-admin-status="${sheetKey}"]`);
  const definition = adminSheetDefinitions[sheetKey];

  if (!token || !list || !status || !definition) {
    return;
  }

  const rows = Array.from(list.querySelectorAll("[data-admin-record]")).map((record) => {
    const item = {};

    definition.fields.forEach((field) => {
      const input = record.querySelector(`[data-field="${field.key}"]`);
      const rawValue = input ? String(input.value || "").trim() : "";
      let normalizedValue = rawValue;

      if (field.key === "image_url" || field.key === "logo_url") {
        normalizedValue = normalizeImageUrl(rawValue);
      }

      if (field.key === "image_urls") {
        normalizedValue = normalizeStaffImageList(rawValue).join("\n");
      }

      if (field.key === "logo_file_id") {
        const sourceInput = record.querySelector('[data-field="logo_url"]');
        normalizedValue = extractDriveFileId(String(sourceInput?.value || rawValue));
      }

      if (sheetKey === "rates" && field.key === "key") {
        const labelInput = record.querySelector('[data-field="label"]');
        const categoryInput = record.querySelector('[data-field="category"]');
        normalizedValue = inferRateKey(String(categoryInput?.value || ""), String(labelInput?.value || rawValue));
      }

      if (input && (field.key === "image_url" || field.key === "logo_url") && input.value !== normalizedValue) {
        input.value = normalizedValue;
      }

      if (input && field.key === "logo_file_id") {
        input.value = normalizedValue;
      }

      item[field.key] = normalizedValue;
    });

    return item;
  }).filter((row) => definition.fields.some((field) => String(row[field.key] || "").trim() !== ""));

  // Validate required fields
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    for (const field of definition.fields) {
      if (field.required && !String(row[field.key] || "").trim()) {
        status.textContent = `Error: Row ${i + 1} - "${field.label}" is required.`;
        status.classList.remove("is-success");
        status.classList.add("is-error");
        return;
      }
    }
  }

  status.textContent = "Saving...";
  status.classList.remove("is-error", "is-success");

  try {
    const result = await postAdminAction({
      action: "adminSaveSheet",
      sheetName: sheetKey,
      rows
    });

    if (result && typeof result === 'object' && result.success === false) {
      throw new Error(result.message || 'Save failed');
    }

    if (result && typeof result === 'object' && result.success === false) {
      throw new Error(result.message || 'Save failed');
    }

    await loadAdminData();
    activateAdminPanel(sheetKey);
    const refreshedStatus = document.querySelector(`[data-admin-status="${sheetKey}"]`);
    if (refreshedStatus) {
      refreshedStatus.textContent = `${definition.label} saved successfully. ${result.data && result.data.count !== undefined ? `${result.data.count} record(s) recorded.` : ""}`.trim();
      refreshedStatus.classList.add("is-success");
    }
    window.alert(`${definition.label} recorded successfully.`);
  } catch (error) {
    status.textContent = error.message || "Save failed.";
    status.classList.add("is-error");
    window.alert(`Save failed: ${error.message || "Unknown error."}`);
  }
}

function createEmptyRow(definition) {
  return definition.fields.reduce((row, field) => {
    row[field.key] = field.defaultValue || "";
    return row;
  }, {});
}

function getFieldOptions(field) {
  if (Array.isArray(field.options)) {
    return field.options;
  }

  if (field.optionsSource === "branches") {
    return getAdminOptionsFromRows("branches", "name");
  }

  if (field.optionsSource === "services") {
    return getAdminOptionsFromRows("services", "name");
  }

  if (field.optionsSource === "staff") {
    return getAdminOptionsFromRows("staff", "name");
  }

  return [];
}

function getAdminOptionsFromRows(sheetKey, property) {
  const rows = Array.isArray(adminState.data[sheetKey]) ? adminState.data[sheetKey] : [];
  const uniqueValues = new Set();

  rows.forEach((row) => {
    if (String(row.active || "TRUE").toUpperCase() !== "TRUE") {
      return;
    }

    const value = String(row[property] || "").trim();
    if (value) {
      uniqueValues.add(value);
    }
  });

  return Array.from(uniqueValues);
}

function showAdminApp(isVisible) {
  const loginView = document.querySelector("[data-admin-login-view]");
  const appView = document.querySelector("[data-admin-app]");

  if (loginView) {
    loginView.classList.toggle("hidden", isVisible);
  }

  if (appView) {
    appView.classList.toggle("hidden", !isVisible);
  }
}

async function clearAdminSession() {
  adminState.token = "";
  adminState.data = {};
  const client = initializeSupabaseClient();
  if (client) {
    await client.auth.signOut();
  }
}

async function logoutAdmin() {
  await clearAdminSession();
  showAdminApp(false);
}

function getAdminToken() {
  return adminState.token || "";
}

async function postAdminAction(payload) {
  if (!adminApiBaseUrl) {
    throw new Error("Admin API URL is missing.");
  }

  const token = getAdminToken();
  const headers = {
    "Content-Type": "application/json"
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await withTimeout(
    fetch(adminApiBaseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    }),
    20000,
    "Admin API request timed out. Check your network connection."
  );

  const result = await response.json();

  if (!response.ok || !result.success) {
    let errorMessage = "Request failed.";
    if (result && typeof result === "object") {
      if (typeof result.message === "string" && result.message.trim()) {
        errorMessage = result.message;
      } else if (result.message != null) {
        errorMessage = JSON.stringify(result.message, Object.keys(result.message).sort(), 2);
      } else if (typeof result.error === "string" && result.error.trim()) {
        errorMessage = result.error;
      } else if (result.error != null) {
        errorMessage = JSON.stringify(result.error, Object.keys(result.error).sort(), 2);
      }
    }

    if (/invalid user session|admin access denied|session.*expired/i.test(errorMessage)) {
      await clearAdminSession();
    }

    throw new Error(errorMessage);
  }

  return result;
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function getInitials(value) {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "?";
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

function normalizeImageUrl(value) {
  const trimmedValue = String(value || "").trim();

  if (!trimmedValue) {
    return "";
  }

  const driveFileId = extractDriveFileId(trimmedValue);
  if (driveFileId) {
    return `https://drive.google.com/thumbnail?id=${driveFileId}&sz=w1200`;
  }

  return trimmedValue;
}

function normalizeStaffImageList(value) {
  const urls = String(value || "")
    .split(/\r?\n|,|;|\s+(?=https?:\/\/)/)
    .map((item) => normalizeImageUrl(item))
    .filter(Boolean);

  return urls.slice(0, 10);
}

function getFirstStaffImage(row) {
  return normalizeStaffImageList(String(row.image_urls || "")).shift() || "";
}

function inferRateKey(category, label) {
  const normalizedCategory = String(category || "").trim().toLowerCase() || "service";
  const normalizedLabel = String(label || "").trim().toLowerCase();

  const hasFemale = /\bfemale\b/.test(normalizedLabel);
  const hasMale = /\bmale\b/.test(normalizedLabel);
  const numbers = normalizedLabel.match(/\d+/g) || [];
  const firstNumber = numbers[0] || "";
  const secondNumber = numbers[1] || "";

  if (hasFemale && hasMale) {
    const femaleCount = normalizedLabel.match(/(\d+)\s*female/i);
    const maleCount = normalizedLabel.match(/(\d+)\s*male/i);
    return `${normalizedCategory}_mixed_${femaleCount ? femaleCount[1] : firstNumber || "1"}_${maleCount ? maleCount[1] : secondNumber || "1"}`;
  }

  if (hasFemale) {
    return `${normalizedCategory}_female_${firstNumber || "1"}`;
  }

  if (hasMale) {
    return `${normalizedCategory}_male_${firstNumber || "1"}`;
  }

  const slug = normalizedLabel
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return `${normalizedCategory}_${slug || "rate"}`;
}
