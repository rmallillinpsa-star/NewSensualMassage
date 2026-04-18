// NO JWT, NO SUPABASE CLIENT - Pure REST API approach
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const adminApiKey = Deno.env.get("ADMIN_API_KEY") || "";

// Pure REST API helper - NO JWT INVOLVED
async function rest(method: string, endpoint: string, body?: unknown, params?: Record<string, string>) {
  const url = new URL(`${supabaseUrl}/rest/v1${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const response = await fetch(url, {
    method,
    headers: {
      "apikey": serviceRoleKey,
      "Authorization": `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    throw new Error(`REST error: ${response.status}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

async function assertAdmin(request: Request) {
  const apiKey = request.headers.get("x-api-key") || request.headers.get("apikey") || "";
  if (apiKey.trim() !== adminApiKey) {
    throw new Error("Admin access denied");
  }
  return true;
}

// Helper functions for data normalization
function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeSlug(value: unknown) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseNumberValue(value: unknown) {
  const numericValue = Number(value ?? 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function toBooleanString(value: unknown) {
  return String(value ?? "TRUE").trim().toUpperCase() === "FALSE" ? "FALSE" : "TRUE";
}

function toDbBoolean(value: unknown) {
  return String(value ?? "TRUE").trim().toUpperCase() !== "FALSE";
}

function extractDriveFileId(value: unknown) {
  const trimmedValue = normalizeText(value);
  if (!trimmedValue) return "";
  const driveFileMatch = trimmedValue.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
  if (driveFileMatch) return driveFileMatch[1];
  const driveOpenMatch = trimmedValue.match(/[?&]id=([^&]+)/i);
  if (trimmedValue.includes("drive.google.com") && driveOpenMatch) {
    return driveOpenMatch[1];
  }
  return "";
}

function parseImageUrls(value: unknown) {
  return String(value ?? "")
    .split(/\r?\n|,|;/)
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .slice(0, 10);
}

async function getSiteData() {
  const branches = await rest("GET", "/branches?select=*&active=eq.true&order=sort_order,name");
  const services = await rest("GET", "/services?select=*&active=eq.true&order=sort_order,name");
  const staff = await rest("GET", "/staff?select=*&active=eq.true&order=sort_order,name");
  const staffImages = await rest("GET", "/staff_images?select=*&order=sort_order");
  const promos = await rest("GET", "/promos?select=*&active=eq.true&order=sort_order,title");
  const slides = await rest("GET", "/slides?select=*&active=eq.true&order=sort_order");
  const homeSections = await rest("GET", "/home_sections?select=*&active=eq.true&order=sort_order");
  const rates = await rest("GET", "/rates?select=*&active=eq.true&order=sort_order,label");
  const settings = await rest("GET", "/settings?select=*");

  const branchMap = new Map((branches || []).map((r: any) => [r.id, r.name]));
  const imageMap = new Map<string, string[]>();
  (staffImages || []).forEach((img: any) => {
    const list = imageMap.get(img.staff_id) || [];
    if (img.image_url) list.push(img.image_url);
    imageMap.set(img.staff_id, list);
  });

  const settingsObj = Object.fromEntries((settings || []).filter((s: any) => !s.branch_id).map((s: any) => [s.key, s.value]));

  return {
    branches: (branches || []).map((r: any) => ({ ...r, __rowIndex: r.sort_order || 0 })),
    services: (services || []).map((r: any) => ({ ...r, branch: r.branch_id ? branchMap.get(r.branch_id) || "" : "", __rowIndex: r.sort_order || 0 })),
    staff: (staff || []).map((r: any) => ({ ...r, branch: branchMap.get(r.branch_id) || "", image_urls: (imageMap.get(r.id) || []).join("\n"), __rowIndex: r.sort_order || 0 })),
    promos: (promos || []).map((r: any) => ({ ...r, branch: r.branch_id ? branchMap.get(r.branch_id) || "" : "", __rowIndex: r.sort_order || 0 })),
    slides: (slides || []).map((r: any) => ({ ...r, branch: r.branch_id ? branchMap.get(r.branch_id) || "" : "", __rowIndex: r.sort_order || 0 })),
    home_sections: (homeSections || []).map((r: any) => ({ ...r, branch: r.branch_id ? branchMap.get(r.branch_id) || "" : "", __rowIndex: r.sort_order || 0 })),
    rates: (rates || []).map((r: any) => ({ ...r, branch: r.branch_id ? branchMap.get(r.branch_id) || "" : "", __rowIndex: r.sort_order || 0 })),
    settings: settingsObj
  };
}

async function createBooking(payload: Record<string, unknown>) {
  const branches: any[] = await rest("GET", "/branches?select=id&name=eq." + encodeURIComponent(String(payload.branch || "")));
  const branchId = branches?.[0]?.id || null;

  await rest("POST", "/bookings", {
    branch_id: branchId,
    branch_name: String(payload.branch || "").trim(),
    name: String(payload.name || "").trim(),
    phone: String(payload.phone || "").trim(),
    service: String(payload.service || "").trim(),
    female_therapist_count: Number(payload.female_therapist_count || 0),
    male_therapist_count: Number(payload.male_therapist_count || 0),
    booking_date: payload.date || null,
    booking_time: String(payload.time || "").trim(),
    female_therapists: String(payload.female_therapists || "").trim(),
    male_therapists: String(payload.male_therapists || "").trim(),
    estimated_service_cost: Number(payload.estimated_service_cost || 0),
    taxi_fare: Number(payload.taxi_fare || 0),
    total_estimate: Number(payload.total_estimate || 0),
    agreement: String(payload.agreement || "No").trim() || "No",
    notes: String(payload.notes || "").trim(),
    status: "New"
  });

  return { message: "Booking saved successfully" };
}

async function getAdminData(request: Request) {
  await assertAdmin(request);

  const branches = await rest("GET", "/branches?select=*&order=sort_order,name");
  const services = await rest("GET", "/services?select=*&order=sort_order,name");
  const staff = await rest("GET", "/staff?select=*&order=sort_order,name");
  const staffImages = await rest("GET", "/staff_images?select=*&order=sort_order");
  const promos = await rest("GET", "/promos?select=*&order=sort_order,title");
  const slides = await rest("GET", "/slides?select=*&order=sort_order");
  const homeSections = await rest("GET", "/home_sections?select=*&order=sort_order");
  const rates = await rest("GET", "/rates?select=*&order=sort_order,label");
  const settings = await rest("GET", "/settings?select=*&order=key");
  const bookings = await rest("GET", "/bookings?select=*&order=timestamp.desc");

  const branchMap = new Map((branches || []).map((r: any) => [r.id, r.name]));
  const imageMap = new Map<string, string[]>();
  (staffImages || []).forEach((img: any) => {
    const list = imageMap.get(img.staff_id) || [];
    if (img.image_url) list.push(img.image_url);
    imageMap.set(img.staff_id, list);
  });

  return {
    branches: (branches || []).map((r: any) => ({ id: r.id, name: r.name, address: r.address || "", phone: r.phone || "", email: r.email || "", whatsapp_number: r.whatsapp_number || "", viber_number: r.viber_number || "", wechat_id: r.wechat_id || "", telegram_username: r.telegram_username || "", map_link: r.map_link || "", logo_url: r.logo_url || "", logo_file_id: extractDriveFileId(r.logo_url || r.logo_path || ""), active: toBooleanString(r.active) })),
    services: (services || []).map((r: any) => ({ id: r.id, branch_id: r.branch_id || null, branch: r.branch_id ? branchMap.get(r.branch_id) || "" : "", name: r.name, description: r.description || "", duration: r.duration || "", female_rate: String(r.female_rate ?? ""), male_rate: String(r.male_rate ?? ""), category: r.category || "", active: toBooleanString(r.active) })),
    staff: (staff || []).map((r: any) => ({ id: r.id, branch_id: r.branch_id || null, branch: branchMap.get(r.branch_id) || "", name: r.name, gender: r.gender || "Female", role: r.role || "", specialty: r.specialty || "", age: r.age ?? "", height: r.height || "", weight: r.weight || "", image_urls: (imageMap.get(r.id) || []).join("\n"), bio: r.bio || "", active: toBooleanString(r.active) })),
    promos: (promos || []).map((r: any) => ({ id: r.id, branch_id: r.branch_id || null, branch: r.branch_id ? branchMap.get(r.branch_id) || "" : "", title: r.title, description: r.description || "", label: r.label || "", active: toBooleanString(r.active) })),
    slides: (slides || []).map((r: any) => ({ id: r.id, branch_id: r.branch_id || null, branch: r.branch_id ? branchMap.get(r.branch_id) || "" : "", title: r.title || "", subtitle: r.subtitle || "", image_url: r.image_url || "", alt_text: r.alt_text || "", button_text: r.button_text || "", button_link: r.button_link || "", active: toBooleanString(r.active) })),
    home_sections: (homeSections || []).map((r: any) => ({ id: r.id, branch_id: r.branch_id || null, branch: r.branch_id ? branchMap.get(r.branch_id) || "" : "", section_key: r.section_key, title: r.title, description: r.description || "", image_url: r.image_url || "", button_text: r.button_text || "", button_link: r.button_link || "", active: toBooleanString(r.active) })),
    rates: (rates || []).map((r: any) => ({ id: r.id, branch_id: r.branch_id || null, branch: r.branch_id ? branchMap.get(r.branch_id) || "" : "", key: r.key, label: r.label, amount: String(r.amount ?? ""), category: r.category || "service", active: toBooleanString(r.active) })),
    settings: (settings || []).map((r: any) => ({ id: r.id, key: r.key, value: r.value })),
    bookings: (bookings || []).map((r: any) => ({ id: r.id, branch_id: r.branch_id || null, branch: r.branch_name || (r.branch_id ? branchMap.get(r.branch_id) || "" : ""), timestamp: r.timestamp || r.created_at || "", name: r.name || "", phone: r.phone || "", service: r.service || "", female_therapist_count: String(r.female_therapist_count ?? 0), male_therapist_count: String(r.male_therapist_count ?? 0), date: r.booking_date || "", time: r.booking_time || "", female_therapists: r.female_therapists || "", male_therapists: r.male_therapists || "", estimated_service_cost: String(r.estimated_service_cost ?? 0), taxi_fare: String(r.taxi_fare ?? 0), total_estimate: String(r.total_estimate ?? 0), agreement: r.agreement || "No", notes: r.notes || "", status: r.status || "New" })),
    admin_profiles: []
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(request.url);

    if (request.method === "GET" && url.searchParams.get("action") === "siteData") {
      return json({ success: true, data: await getSiteData() });
    }

    const payload = await request.json();
    const action = String(payload.action || "").trim();

    if (action === "createBooking") {
      return json({ success: true, data: await createBooking(payload) });
    }

    if (action === "adminGetData") {
      return json({ success: true, data: await getAdminData(request) });
    }

    return json({ success: false, message: "Invalid action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error";
    console.error("Function Error:", message, error);
    return json({ success: false, message }, 500);
  }
});
