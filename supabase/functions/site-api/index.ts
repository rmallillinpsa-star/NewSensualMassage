// ========== NO JWT - PURE REST API ==========
// This Edge Function uses ONLY REST API calls to Supabase
// Zero JWT involvement, Zero cryptographic operations
// 100% compatible with ES256 error fix

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ADMIN_API_KEY = Deno.env.get("ADMIN_API_KEY") || "";

// ========== PURE REST API HELPER ==========
async function supabaseRest(method: string, path: string, body?: Record<string, unknown> | unknown[], query?: Record<string, string>) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase configuration");
  }

  const url = new URL(`${SUPABASE_URL}/rest/v1${path}`);
  
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
  }

  const response = await fetch(url.toString(), {
    method,
    headers: {
      "apikey": SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  
  if (!response.ok) {
    console.error(`Supabase REST error [${method} ${path}]: ${response.status} - ${text}`);
    throw new Error(`Database error: ${response.status}`);
  }

  return text ? JSON.parse(text) : [];
}

// ========== HELPER FUNCTIONS ==========
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

async function assertAdmin(request: Request): Promise<void> {
  const apiKey = request.headers.get("x-api-key") || request.headers.get("apikey") || "";
  if (!apiKey || apiKey.trim() !== ADMIN_API_KEY) {
    throw new Error("Unauthorized: Invalid API key");
  }
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function toBooleanString(value: unknown): string {
  return String(value ?? "TRUE").trim().toUpperCase() === "FALSE" ? "FALSE" : "TRUE";
}

function toDbBoolean(value: unknown): boolean {
  return String(value ?? "TRUE").trim().toUpperCase() !== "FALSE";
}

function extractDriveFileId(value: unknown): string {
  const text = normalizeText(value);
  if (!text) return "";
  const match = text.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
  return match ? match[1] : "";
}

// ========== CONSISTENT DATA TRANSFORMERS ==========
function transformBranch(b: any) {
  return {
    id: b.id,
    name: normalizeText(b.name),
    address: normalizeText(b.address),
    phone: normalizeText(b.phone),
    email: normalizeText(b.email),
    whatsapp_number: normalizeText(b.whatsapp_number),
    viber_number: normalizeText(b.viber_number),
    wechat_id: normalizeText(b.wechat_id),
    telegram_username: normalizeText(b.telegram_username),
    map_link: normalizeText(b.map_link),
    logo_url: normalizeText(b.logo_url),
    logo_file_id: extractDriveFileId(b.logo_url || b.logo_path),
    active: toBooleanString(b.active)
  };
}

function transformService(s: any, branchMap: Map<string, string>) {
  return {
    id: s.id,
    branch_id: s.branch_id || null,
    branch: s.branch_id ? (branchMap.get(s.branch_id) || "") : "",
    name: normalizeText(s.name),
    description: normalizeText(s.description),
    duration: normalizeText(s.duration),
    female_rate: String(s.female_rate ?? ""),
    male_rate: String(s.male_rate ?? ""),
    category: normalizeText(s.category),
    active: toBooleanString(s.active)
  };
}

function transformStaff(s: any, branchMap: Map<string, string>, imageMap: Map<string, string[]>) {
  return {
    id: s.id,
    branch_id: s.branch_id || null,
    branch: branchMap.get(s.branch_id) || "",
    name: normalizeText(s.name),
    gender: normalizeText(s.gender) || "Female",
    role: normalizeText(s.role),
    specialty: normalizeText(s.specialty),
    age: s.age ?? "",
    height: normalizeText(s.height),
    weight: normalizeText(s.weight),
    image_urls: (imageMap.get(s.id) || []).join("\n"),
    bio: normalizeText(s.bio),
    active: toBooleanString(s.active)
  };
}

function transformPromo(p: any, branchMap: Map<string, string>) {
  return {
    id: p.id,
    branch_id: p.branch_id || null,
    branch: p.branch_id ? (branchMap.get(p.branch_id) || "") : "",
    title: normalizeText(p.title),
    description: normalizeText(p.description),
    label: normalizeText(p.label),
    active: toBooleanString(p.active)
  };
}

function transformSlide(s: any, branchMap: Map<string, string>) {
  return {
    id: s.id,
    branch_id: s.branch_id || null,
    branch: s.branch_id ? (branchMap.get(s.branch_id) || "") : "",
    title: normalizeText(s.title),
    subtitle: normalizeText(s.subtitle),
    image_url: normalizeText(s.image_url),
    alt_text: normalizeText(s.alt_text),
    button_text: normalizeText(s.button_text),
    button_link: normalizeText(s.button_link),
    active: toBooleanString(s.active)
  };
}

function transformHomeSection(h: any, branchMap: Map<string, string>) {
  return {
    id: h.id,
    branch_id: h.branch_id || null,
    branch: h.branch_id ? (branchMap.get(h.branch_id) || "") : "",
    section_key: normalizeText(h.section_key),
    title: normalizeText(h.title),
    description: normalizeText(h.description),
    image_url: normalizeText(h.image_url),
    button_text: normalizeText(h.button_text),
    button_link: normalizeText(h.button_link),
    active: toBooleanString(h.active)
  };
}

function transformRate(r: any, branchMap: Map<string, string>) {
  return {
    id: r.id,
    branch_id: r.branch_id || null,
    branch: r.branch_id ? (branchMap.get(r.branch_id) || "") : "",
    key: normalizeText(r.key),
    label: normalizeText(r.label),
    amount: String(r.amount ?? ""),
    category: normalizeText(r.category),
    active: toBooleanString(r.active)
  };
}

function transformSetting(s: any) {
  return {
    id: s.id,
    key: normalizeText(s.key),
    value: normalizeText(s.value)
  };
}

function transformBooking(b: any, branchMap: Map<string, string>) {
  return {
    id: b.id,
    branch_id: b.branch_id || null,
    branch: b.branch_name || (b.branch_id ? (branchMap.get(b.branch_id) || "") : ""),
    timestamp: b.created_at || b.timestamp || "",
    name: normalizeText(b.name),
    email: normalizeText(b.email),
    phone: normalizeText(b.phone),
    service: normalizeText(b.service),
    female_therapist_count: String(b.female_therapist_count ?? 0),
    male_therapist_count: String(b.male_therapist_count ?? 0),
    date: normalizeText(b.booking_date),
    time: normalizeText(b.booking_time),
    female_therapists: normalizeText(b.female_therapists),
    male_therapists: normalizeText(b.male_therapists),
    estimated_service_cost: String(b.estimated_service_cost ?? 0),
    taxi_fare: String(b.taxi_fare ?? 0),
    total_estimate: String(b.total_estimate ?? 0),
    agreement: normalizeText(b.agreement) || "No",
    notes: normalizeText(b.notes),
    status: normalizeText(b.status) || "New"
  };
}

// ========== DATA ENDPOINTS ==========
async function getSiteData() {
  try {
    const [branches, services, staff, staffImages, promos, slides, homeSections, rates, settings] = await Promise.all([
      supabaseRest("GET", "/branches", undefined, { select: "*", active: "eq.true", order: "sort_order.asc,name.asc" }),
      supabaseRest("GET", "/services", undefined, { select: "*", active: "eq.true", order: "sort_order.asc,name.asc" }),
      supabaseRest("GET", "/staff", undefined, { select: "*", active: "eq.true", order: "sort_order.asc,name.asc" }),
      supabaseRest("GET", "/staff_images", undefined, { select: "*", order: "sort_order.asc" }),
      supabaseRest("GET", "/promos", undefined, { select: "*", active: "eq.true", order: "sort_order.asc,title.asc" }),
      supabaseRest("GET", "/slides", undefined, { select: "*", active: "eq.true", order: "sort_order.asc" }),
      supabaseRest("GET", "/home_sections", undefined, { select: "*", active: "eq.true", order: "sort_order.asc" }),
      supabaseRest("GET", "/rates", undefined, { select: "*", active: "eq.true", order: "sort_order.asc,label.asc" }),
      supabaseRest("GET", "/settings", undefined, { select: "*" })
    ]);

    const branchMap = new Map((branches || []).map((b: any) => [b.id, b.name]));
    const imageMap = new Map<string, string[]>();
    
    (staffImages || []).forEach((img: any) => {
      const list = imageMap.get(img.staff_id) || [];
      if (img.image_url) list.push(img.image_url);
      imageMap.set(img.staff_id, list);
    });

    const settingsMap: Record<string, any> = {};
    (settings || [])
      .filter((s: any) => !s.branch_id)
      .forEach((s: any) => {
        settingsMap[normalizeText(s.key)] = normalizeText(s.value);
      });

    return {
      branches: (branches || []).map(transformBranch),
      services: (services || []).map((s: any) => transformService(s, branchMap)),
      staff: (staff || []).map((s: any) => transformStaff(s, branchMap, imageMap)),
      promos: (promos || []).map((p: any) => transformPromo(p, branchMap)),
      slides: (slides || []).map((s: any) => transformSlide(s, branchMap)),
      home_sections: (homeSections || []).map((h: any) => transformHomeSection(h, branchMap)),
      rates: (rates || []).map((r: any) => transformRate(r, branchMap)),
      settings: settingsMap
    };
  } catch (error) {
    console.error("getSiteData error:", error);
    throw error;
  }
}

async function createBooking(payload: Record<string, unknown>) {
  try {
    const branchName = normalizeText(payload.branch);
    let branchId: string | null = null;

    if (branchName) {
      try {
        const branches = await supabaseRest("GET", "/branches", undefined, {
          select: "id",
          name: `eq.${encodeURIComponent(branchName)}`
        });
        branchId = branches?.[0]?.id || null;
      } catch (err) {
        console.warn("Could not fetch branch, proceeding with branchId=null", err);
      }
    }

    const bookingRecord = {
      branch_id: branchId,
      branch_name: branchName,
      name: normalizeText(payload.name),
      email: normalizeText(payload.email),
      phone: normalizeText(payload.phone),
      service: normalizeText(payload.service),
      female_therapist_count: Number(payload.female_therapist_count) || 0,
      male_therapist_count: Number(payload.male_therapist_count) || 0,
      booking_date: payload.date || null,
      booking_time: normalizeText(payload.time),
      female_therapists: normalizeText(payload.female_therapists),
      male_therapists: normalizeText(payload.male_therapists),
      estimated_service_cost: Number(payload.estimated_service_cost) || 0,
      taxi_fare: Number(payload.taxi_fare) || 0,
      total_estimate: Number(payload.total_estimate) || 0,
      agreement: normalizeText(payload.agreement) || "No",
      notes: normalizeText(payload.notes),
      status: "New",
      created_at: new Date().toISOString()
    };

    const result = await supabaseRest("POST", "/bookings", bookingRecord);
    return { 
      message: "Booking created successfully", 
      success: true,
      data: result?.[0] || { id: "pending" }
    };
  } catch (error) {
    console.error("createBooking error:", error);
    throw error;
  }
}

async function getAdminData(request: Request) {
  try {
    await assertAdmin(request);

    const [branches, services, staff, staffImages, promos, slides, homeSections, rates, settings, bookings] = await Promise.all([
      supabaseRest("GET", "/branches", undefined, { select: "*", order: "sort_order.asc,name.asc" }),
      supabaseRest("GET", "/services", undefined, { select: "*", order: "sort_order.asc,name.asc" }),
      supabaseRest("GET", "/staff", undefined, { select: "*", order: "sort_order.asc,name.asc" }),
      supabaseRest("GET", "/staff_images", undefined, { select: "*", order: "sort_order.asc" }),
      supabaseRest("GET", "/promos", undefined, { select: "*", order: "sort_order.asc,title.asc" }),
      supabaseRest("GET", "/slides", undefined, { select: "*", order: "sort_order.asc" }),
      supabaseRest("GET", "/home_sections", undefined, { select: "*", order: "sort_order.asc" }),
      supabaseRest("GET", "/rates", undefined, { select: "*", order: "sort_order.asc,label.asc" }),
      supabaseRest("GET", "/settings", undefined, { select: "*", order: "key.asc" }),
      supabaseRest("GET", "/bookings", undefined, { select: "*", order: "created_at.desc" })
    ]);

    const branchMap = new Map((branches || []).map((b: any) => [b.id, b.name]));
    const imageMap = new Map<string, string[]>();
    
    (staffImages || []).forEach((img: any) => {
      const list = imageMap.get(img.staff_id) || [];
      if (img.image_url) list.push(img.image_url);
      imageMap.set(img.staff_id, list);
    });

    return {
      branches: (branches || []).map(transformBranch),
      services: (services || []).map((s: any) => transformService(s, branchMap)),
      staff: (staff || []).map((s: any) => transformStaff(s, branchMap, imageMap)),
      promos: (promos || []).map((p: any) => transformPromo(p, branchMap)),
      slides: (slides || []).map((s: any) => transformSlide(s, branchMap)),
      home_sections: (homeSections || []).map((h: any) => transformHomeSection(h, branchMap)),
      rates: (rates || []).map((r: any) => transformRate(r, branchMap)),
      settings: (settings || []).map(transformSetting),
      bookings: (bookings || []).map((b: any) => transformBooking(b, branchMap))
    };
  } catch (error) {
    console.error("getAdminData error:", error);
    throw error;
  }
}

// ========== DENO SERVER ==========
Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("OK", { headers: corsHeaders });
  }

  try {
    const url = new URL(request.url);

    // Public endpoint: Get site data
    if (request.method === "GET" && url.searchParams.get("action") === "siteData") {
      const data = await getSiteData();
      return json({ success: true, data });
    }

    // Public endpoint: Create booking
    if (request.method === "POST") {
      const payload = await request.json() as Record<string, unknown>;
      const action = normalizeText(payload.action);

      if (action === "createBooking") {
        const data = await createBooking(payload);
        return json({ success: true, data });
      }

      // Admin endpoints (require API key)
      if (action === "adminGetData") {
        const data = await getAdminData(request);
        return json({ success: true, data });
      }

      return json({ success: false, message: "Unknown action" }, 400);
    }

    return json({ success: false, message: "Method not allowed" }, 405);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("Edge Function Error:", message, error);
    return json({ success: false, message }, 500);
  }
});
