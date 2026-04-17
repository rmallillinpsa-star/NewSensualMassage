const SHEET_NAMES = {
  branches: "branches",
  services: "services",
  staff: "staff",
  promos: "promos",
  slides: "slides",
  homeSections: "home_sections",
  rates: "rates",
  settings: "settings",
  bookings: "bookings",
  adminUsers: "admin_users"
};

const ADMIN_TOKEN_CACHE_PREFIX = "admin_token_";
const ADMIN_TOKEN_TTL_SECONDS = 21600;

function doGet(e) {
  try {
    ensureSchema();

    const action = (e && e.parameter && e.parameter.action) || "siteData";

    if (action === "siteData") {
      return jsonOutput({
        success: true,
        data: getSiteData()
      });
    }

    return jsonOutput({
      success: false,
      message: "Invalid action."
    });
  } catch (error) {
    return jsonOutput({
      success: false,
      message: error.message
    });
  }
}

function doPost(e) {
  try {
    ensureSchema();

    const body = parsePostBody(e);
    const action = body.action || "";

    if (action === "createBooking") {
      return jsonOutput({
        success: true,
        data: createBooking(body)
      });
    }

    if (action === "adminLogin") {
      return jsonOutput({
        success: true,
        data: adminLogin(body.username, body.password)
      });
    }

    if (action === "adminGetData") {
      assertAdminToken(body.token);
      return jsonOutput({
        success: true,
        data: getAdminData()
      });
    }

    if (action === "adminSaveSheet") {
      assertAdminToken(body.token);
      return jsonOutput({
        success: true,
        data: adminSaveSheet(body.sheetName, body.rows || [])
      });
    }

    if (action === "syncSchema") {
      assertAdminToken(body.token);
      ensureSchema(true);
      return jsonOutput({
        success: true,
        data: { message: "Schema synced successfully." }
      });
    }

    return jsonOutput({
      success: false,
      message: "Invalid action."
    });
  } catch (error) {
    return jsonOutput({
      success: false,
      message: error.message
    });
  }
}

function getSiteData() {
  return {
    branches: getActiveSortedRows(getSheetData(SHEET_NAMES.branches)),
    services: getActiveSortedRows(getSheetData(SHEET_NAMES.services)),
    staff: getActiveSortedRows(getSheetData(SHEET_NAMES.staff)),
    promos: getActiveSortedRows(getSheetData(SHEET_NAMES.promos)),
    slides: getActiveSortedRows(getSheetData(SHEET_NAMES.slides)),
    home_sections: getActiveSortedRows(getSheetData(SHEET_NAMES.homeSections)),
    rates: getActiveSortedRows(getSheetData(SHEET_NAMES.rates)),
    settings: getSettingsObject()
  };
}

function getAdminData() {
  return {
    branches: getSheetData(SHEET_NAMES.branches),
    services: getSheetData(SHEET_NAMES.services),
    staff: getSheetData(SHEET_NAMES.staff),
    promos: getSheetData(SHEET_NAMES.promos),
    slides: getSheetData(SHEET_NAMES.slides),
    home_sections: getSheetData(SHEET_NAMES.homeSections),
    rates: getSheetData(SHEET_NAMES.rates),
    settings: getSheetData(SHEET_NAMES.settings),
    bookings: getSheetData(SHEET_NAMES.bookings),
    admin_users: getSheetData(SHEET_NAMES.adminUsers)
  };
}

function adminLogin(username, password) {
  const users = getSheetData(SHEET_NAMES.adminUsers);
  const matchedUser = users.find(function(user) {
    return String(user.username || "").trim() === String(username || "").trim() &&
      String(user.password || "") === String(password || "") &&
      String(user.active || "TRUE").toUpperCase() === "TRUE";
  });

  if (!matchedUser) {
    throw new Error("Invalid username or password.");
  }

  const token = Utilities.getUuid();
  CacheService.getScriptCache().put(
    ADMIN_TOKEN_CACHE_PREFIX + token,
    String(matchedUser.username || username),
    ADMIN_TOKEN_TTL_SECONDS
  );

  return {
    token: token,
    username: matchedUser.username
  };
}

function assertAdminToken(token) {
  if (!token) {
    throw new Error("Missing admin token.");
  }

  const cachedUser = CacheService.getScriptCache().get(ADMIN_TOKEN_CACHE_PREFIX + token);

  if (!cachedUser) {
    throw new Error("Admin session expired. Please log in again.");
  }
}

function adminSaveSheet(sheetName, rows) {
  const allowedSheets = [
    SHEET_NAMES.branches,
    SHEET_NAMES.services,
    SHEET_NAMES.staff,
    SHEET_NAMES.promos,
    SHEET_NAMES.slides,
    SHEET_NAMES.homeSections,
    SHEET_NAMES.rates,
    SHEET_NAMES.settings,
    SHEET_NAMES.bookings,
    SHEET_NAMES.adminUsers
  ];

  if (allowedSheets.indexOf(sheetName) === -1) {
    throw new Error("Saving that sheet is not allowed.");
  }

  const sheet = getOrCreateSheet(sheetName);
  const headers = getHeadersForSheet(sheetName);
  const normalizedRows = Array.isArray(rows) ? rows : [];

  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  if (normalizedRows.length) {
    const values = normalizedRows.map(function(row) {
      if (sheetName === SHEET_NAMES.branches) {
        row.logo_file_id = row.logo_file_id || extractDriveFileId(row.logo_url);
      }

      if (sheetName === SHEET_NAMES.staff) {
        const imageUrls = normalizeStaffImageUrls(row.image_urls || row.image_url || "");
        if (!imageUrls.length) {
          throw new Error("Each staff profile must have at least 1 profile picture.");
        }
        row.image_urls = imageUrls.join("\n");
      }

      if (sheetName === SHEET_NAMES.rates) {
        row.key = inferRateKey(row.category, row.label, row.key);
      }

      return headers.map(function(header) {
        return row[header] !== undefined ? row[header] : "";
      });
    });

    sheet.getRange(2, 1, values.length, headers.length).setValues(values);
  }

  return {
    sheetName: sheetName,
    count: normalizedRows.length
  };
}

function createBooking(data) {
  ensureSchema();

  const sheet = getOrCreateSheet(SHEET_NAMES.bookings);
  ensureSheetHeader(SHEET_NAMES.bookings);

  const bookingRecord = {
    timestamp: formatDateTime(new Date()),
    name: data.name || "",
    phone: data.phone || "",
    branch: data.branch || "",
    service: data.service || "",
    female_therapist_count: data.female_therapist_count || "0",
    male_therapist_count: data.male_therapist_count || "0",
    date: data.date || "",
    time: data.time || "",
    female_therapists: data.female_therapists || "",
    male_therapists: data.male_therapists || "",
    estimated_service_cost: data.estimated_service_cost || "",
    taxi_fare: data.taxi_fare || "",
    total_estimate: data.total_estimate || "",
    agreement: data.agreement || "No",
    notes: data.notes || "",
    status: data.status || "New"
  };

  const row = [
    bookingRecord.branch,
    bookingRecord.timestamp,
    bookingRecord.name,
    bookingRecord.phone,
    bookingRecord.service,
    bookingRecord.female_therapist_count,
    bookingRecord.male_therapist_count,
    bookingRecord.date,
    bookingRecord.time,
    bookingRecord.female_therapists,
    bookingRecord.male_therapists,
    bookingRecord.estimated_service_cost,
    bookingRecord.taxi_fare,
    bookingRecord.total_estimate,
    bookingRecord.agreement,
    bookingRecord.notes,
    bookingRecord.status
  ];

  sheet.appendRow(row);
  sendBranchBookingEmail(bookingRecord);

  return {
    message: "Booking saved successfully."
  };
}

function ensureSchema(forceRewrite) {
  const sheetNames = [
    SHEET_NAMES.branches,
    SHEET_NAMES.services,
    SHEET_NAMES.staff,
    SHEET_NAMES.promos,
    SHEET_NAMES.slides,
    SHEET_NAMES.homeSections,
    SHEET_NAMES.rates,
    SHEET_NAMES.settings,
    SHEET_NAMES.bookings,
    SHEET_NAMES.adminUsers
  ];

  sheetNames.forEach(function(sheetName) {
    ensureSheetHeader(sheetName, forceRewrite);
  });
}

function syncSchema() {
  ensureSchema(true);
  Logger.log("Schema synced successfully.");
}

function ensureSheetHeader(sheetName, forceRewrite) {
  const sheet = getOrCreateSheet(sheetName);
  const expectedHeaders = getHeadersForSheet(sheetName);
  const lastColumn = Math.max(sheet.getLastColumn(), expectedHeaders.length);
  const currentHeaders = lastColumn > 0
    ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(String)
    : [];

  const headersMatch = expectedHeaders.length === currentHeaders.length &&
    expectedHeaders.every(function(header, index) {
      return String(currentHeaders[index] || "") === String(header);
    });

  if (forceRewrite || !headersMatch) {
    const existingData = sheet.getDataRange().getValues();
    const dataRows = existingData.length > 1 ? existingData.slice(1) : [];
    const oldHeaders = existingData.length ? existingData[0].map(String) : [];
    const remappedRows = remapRows(sheetName, oldHeaders, dataRows, expectedHeaders);

    sheet.clearContents();
    sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);

    if (remappedRows.length) {
      sheet.getRange(2, 1, remappedRows.length, expectedHeaders.length).setValues(remappedRows);
    }
  }
}

function remapRows(sheetName, oldHeaders, dataRows, expectedHeaders) {
  if (!oldHeaders.length || !dataRows.length) {
    return [];
  }

  return dataRows
    .filter(function(row) {
      return row.some(function(cell) {
        return String(cell).trim() !== "";
      });
    })
    .map(function(row) {
      const oldItem = {};
      oldHeaders.forEach(function(header, index) {
        oldItem[header] = row[index];
      });

      if (sheetName === SHEET_NAMES.branches && oldItem.logo_url && !oldItem.logo_file_id) {
        oldItem.logo_file_id = extractDriveFileId(oldItem.logo_url);
      }

      if (sheetName === SHEET_NAMES.staff && !oldItem.image_urls && oldItem.image_url) {
        oldItem.image_urls = normalizeStaffImageUrls(oldItem.image_url).join("\n");
      }

      if (sheetName === SHEET_NAMES.rates && !oldItem.key) {
        oldItem.key = inferRateKey(oldItem.category, oldItem.label, oldItem.key);
      }

      return expectedHeaders.map(function(header) {
        return oldItem[header] !== undefined ? oldItem[header] : "";
      });
    });
}

function getSheetData(sheetName) {
  const sheet = getOrCreateSheet(sheetName);
  ensureSheetHeader(sheetName);

  const values = sheet.getDataRange().getValues();

  if (!values || values.length < 2) {
    return [];
  }

  const headers = values[0].map(String);
  const rows = values.slice(1);

  return rows
    .filter(function(row) {
      return row.some(function(cell) {
        return String(cell).trim() !== "";
      });
    })
    .map(function(row, index) {
      const item = {};
      headers.forEach(function(header, headerIndex) {
        item[header] = row[headerIndex];
      });
      item.__rowIndex = index + 1;
      return item;
    });
}

function getSettingsObject() {
  const rows = getSheetData(SHEET_NAMES.settings);
  const settings = {};

  rows.forEach(function(row) {
    if (row.key) {
      settings[String(row.key).trim()] = row.value;
    }
  });

  return settings;
}

function getActiveSortedRows(rows) {
  return rows
    .filter(function(row) {
      if (row.active === "" || row.active === undefined) return true;
      return String(row.active).toUpperCase() === "TRUE";
    })
    .sort(function(a, b) {
      const aOrder = Number(a.__rowIndex || 0);
      const bOrder = Number(b.__rowIndex || 0);
      return aOrder - bOrder;
    });
}

function parsePostBody(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return {};
  }

  try {
    return JSON.parse(e.postData.contents);
  } catch (error) {
    throw new Error("Invalid JSON body.");
  }
}

function getOrCreateSheet(name) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(name);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
  }

  return sheet;
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
  if (trimmedValue.indexOf("drive.google.com") !== -1 && driveOpenMatch) {
    return driveOpenMatch[1];
  }

  return "";
}

function normalizeStaffImageUrls(value) {
  const items = String(value || "")
    .split(/\r?\n|,|;/)
    .map(function(item) {
      return String(item || "").trim();
    })
    .filter(Boolean);

  return items.slice(0, 10);
}

function inferRateKey(category, label, currentKey) {
  const existingKey = String(currentKey || "").trim();
  if (existingKey) {
    return existingKey;
  }

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
    return normalizedCategory + "_mixed_" +
      (femaleCount ? femaleCount[1] : firstNumber || "1") + "_" +
      (maleCount ? maleCount[1] : secondNumber || "1");
  }

  if (hasFemale) {
    return normalizedCategory + "_female_" + (firstNumber || "1");
  }

  if (hasMale) {
    return normalizedCategory + "_male_" + (firstNumber || "1");
  }

  const slug = normalizedLabel
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalizedCategory + "_" + (slug || "rate");
}

function getHeadersForSheet(sheetName) {
  const headersMap = {};
  headersMap[SHEET_NAMES.branches] = ["name", "address", "phone", "email", "whatsapp_number", "viber_number", "wechat_id", "telegram_username", "map_link", "logo_url", "logo_file_id", "active"];
  headersMap[SHEET_NAMES.services] = ["branch", "name", "description", "duration", "female_rate", "male_rate", "category", "active"];
  headersMap[SHEET_NAMES.staff] = ["branch", "name", "gender", "role", "specialty", "age", "height", "weight", "image_urls", "bio", "active"];
  headersMap[SHEET_NAMES.promos] = ["branch", "title", "description", "label", "active"];
  headersMap[SHEET_NAMES.slides] = ["branch", "title", "subtitle", "image_url", "alt_text", "button_text", "button_link", "active"];
  headersMap[SHEET_NAMES.homeSections] = ["branch", "section_key", "title", "description", "image_url", "button_text", "button_link", "active"];
  headersMap[SHEET_NAMES.rates] = ["branch", "key", "label", "amount", "category", "active"];
  headersMap[SHEET_NAMES.settings] = ["key", "value"];
  headersMap[SHEET_NAMES.bookings] = ["branch", "timestamp", "name", "phone", "service", "female_therapist_count", "male_therapist_count", "date", "time", "female_therapists", "male_therapists", "estimated_service_cost", "taxi_fare", "total_estimate", "agreement", "notes", "status"];
  headersMap[SHEET_NAMES.adminUsers] = ["username", "password", "active"];

  if (!headersMap[sheetName]) {
    throw new Error("No headers configured for sheet: " + sheetName);
  }

  return headersMap[sheetName];
}

function formatDateTime(date) {
  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone(),
    "yyyy-MM-dd HH:mm:ss"
  );
}

function jsonOutput(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function sendBranchBookingEmail(bookingRecord) {
  const branchName = String(bookingRecord.branch || "").trim();

  if (!branchName) {
    return;
  }

  const branchRows = getSheetData(SHEET_NAMES.branches);
  const branch = branchRows.find(function(item) {
    return String(item.name || "").trim().toLowerCase() === branchName.toLowerCase();
  });
  const recipients = parseEmailRecipients(branch && branch.email);

  if (!recipients.length) {
    return;
  }

  const subject = "[New Booking] " + branchName + " - " + (bookingRecord.name || "Walk-in Client");
  const summaryLine = [
    "Service: " + (bookingRecord.service || "Not specified"),
    "Date: " + (bookingRecord.date || "Not specified"),
    "Time: " + (bookingRecord.time || "Not specified")
  ].join(" | ");

  const plainBody = [
    "A new massage booking was submitted.",
    "",
    "Booking Summary",
    summaryLine,
    "",
    "Client Details",
    "Name: " + (bookingRecord.name || ""),
    "Phone: " + (bookingRecord.phone || ""),
    "Branch: " + branchName,
    "",
    "Therapist Request",
    "Female Therapists: " + (bookingRecord.female_therapist_count || "0"),
    "Male Therapists: " + (bookingRecord.male_therapist_count || "0"),
    "Preferred Female Therapists: " + (bookingRecord.female_therapists || "Any available"),
    "Preferred Male Therapists: " + (bookingRecord.male_therapists || "Any available"),
    "",
    "Estimate",
    "Service Cost: PHP " + formatCurrencyValue(bookingRecord.estimated_service_cost),
    "Taxi Fare: PHP " + formatCurrencyValue(bookingRecord.taxi_fare),
    "Total Estimate: PHP " + formatCurrencyValue(bookingRecord.total_estimate),
    "",
    "Agreement Accepted: " + (bookingRecord.agreement || "No"),
    "Notes: " + (bookingRecord.notes || "None"),
    "",
    "Submitted At: " + (bookingRecord.timestamp || "")
  ].join("\n");

  const htmlBody = [
    '<div style="font-family:Arial,sans-serif;color:#2b1a1f;line-height:1.6;">',
    '<h2 style="margin:0 0 12px;color:#8c1023;">New Booking Received</h2>',
    '<p style="margin:0 0 16px;">A new massage booking was submitted for <strong>' + escapeEmailHtml(branchName) + '</strong>.</p>',
    '<table style="width:100%;border-collapse:collapse;margin:0 0 18px;">',
    '<tr><td style="padding:8px;border:1px solid #f1c8d1;"><strong>Client</strong></td><td style="padding:8px;border:1px solid #f1c8d1;">' + escapeEmailHtml(bookingRecord.name || "") + '</td></tr>',
    '<tr><td style="padding:8px;border:1px solid #f1c8d1;"><strong>Phone</strong></td><td style="padding:8px;border:1px solid #f1c8d1;">' + escapeEmailHtml(bookingRecord.phone || "") + '</td></tr>',
    '<tr><td style="padding:8px;border:1px solid #f1c8d1;"><strong>Service</strong></td><td style="padding:8px;border:1px solid #f1c8d1;">' + escapeEmailHtml(bookingRecord.service || "") + '</td></tr>',
    '<tr><td style="padding:8px;border:1px solid #f1c8d1;"><strong>Date</strong></td><td style="padding:8px;border:1px solid #f1c8d1;">' + escapeEmailHtml(bookingRecord.date || "") + '</td></tr>',
    '<tr><td style="padding:8px;border:1px solid #f1c8d1;"><strong>Time</strong></td><td style="padding:8px;border:1px solid #f1c8d1;">' + escapeEmailHtml(bookingRecord.time || "") + '</td></tr>',
    '<tr><td style="padding:8px;border:1px solid #f1c8d1;"><strong>Female Therapists</strong></td><td style="padding:8px;border:1px solid #f1c8d1;">' + escapeEmailHtml(bookingRecord.female_therapist_count || "0") + '</td></tr>',
    '<tr><td style="padding:8px;border:1px solid #f1c8d1;"><strong>Male Therapists</strong></td><td style="padding:8px;border:1px solid #f1c8d1;">' + escapeEmailHtml(bookingRecord.male_therapist_count || "0") + '</td></tr>',
    '<tr><td style="padding:8px;border:1px solid #f1c8d1;"><strong>Preferred Female</strong></td><td style="padding:8px;border:1px solid #f1c8d1;">' + escapeEmailHtml(bookingRecord.female_therapists || "Any available") + '</td></tr>',
    '<tr><td style="padding:8px;border:1px solid #f1c8d1;"><strong>Preferred Male</strong></td><td style="padding:8px;border:1px solid #f1c8d1;">' + escapeEmailHtml(bookingRecord.male_therapists || "Any available") + '</td></tr>',
    '<tr><td style="padding:8px;border:1px solid #f1c8d1;"><strong>Service Cost</strong></td><td style="padding:8px;border:1px solid #f1c8d1;">PHP ' + escapeEmailHtml(formatCurrencyValue(bookingRecord.estimated_service_cost)) + '</td></tr>',
    '<tr><td style="padding:8px;border:1px solid #f1c8d1;"><strong>Taxi Fare</strong></td><td style="padding:8px;border:1px solid #f1c8d1;">PHP ' + escapeEmailHtml(formatCurrencyValue(bookingRecord.taxi_fare)) + '</td></tr>',
    '<tr><td style="padding:8px;border:1px solid #f1c8d1;"><strong>Total Estimate</strong></td><td style="padding:8px;border:1px solid #f1c8d1;">PHP ' + escapeEmailHtml(formatCurrencyValue(bookingRecord.total_estimate)) + '</td></tr>',
    '<tr><td style="padding:8px;border:1px solid #f1c8d1;"><strong>Agreement</strong></td><td style="padding:8px;border:1px solid #f1c8d1;">' + escapeEmailHtml(bookingRecord.agreement || "No") + '</td></tr>',
    '<tr><td style="padding:8px;border:1px solid #f1c8d1;"><strong>Notes</strong></td><td style="padding:8px;border:1px solid #f1c8d1;">' + escapeEmailHtml(bookingRecord.notes || "None") + '</td></tr>',
    '<tr><td style="padding:8px;border:1px solid #f1c8d1;"><strong>Submitted At</strong></td><td style="padding:8px;border:1px solid #f1c8d1;">' + escapeEmailHtml(bookingRecord.timestamp || "") + '</td></tr>',
    '</table>',
    '</div>'
  ].join("");

  MailApp.sendEmail({
    to: recipients.join(","),
    subject: subject,
    body: plainBody,
    htmlBody: htmlBody,
    name: "Sensual Massage Manila - " + branchName + " Bookings"
  });
}

function parseEmailRecipients(value) {
  return String(value || "")
    .split(/[,\n;]/)
    .map(function(item) {
      return String(item || "").trim();
    })
    .filter(function(item) {
      return item && item.indexOf("@") !== -1;
    });
}

function formatCurrencyValue(value) {
  const amount = Number(String(value || "").replace(/[^\d.]/g, ""));

  if (!isFinite(amount)) {
    return "0";
  }

  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

function escapeEmailHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
