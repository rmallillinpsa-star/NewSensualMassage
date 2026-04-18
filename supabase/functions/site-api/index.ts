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
        settingsMap[s.key] = s.value;
      });

    return {
      branches: (branches || []).map((b: any) => ({ ...b, __rowIndex: b.sort_order || 0 })),
      services: (services || []).map((s: any) => ({ ...s, branch: s.branch_id ? branchMap.get(s.branch_id) || "" : "", __rowIndex: s.sort_order || 0 })),
      staff: (staff || []).map((s: any) => ({ ...s, branch: branchMap.get(s.branch_id) || "", image_urls: (imageMap.get(s.id) || []).join("\n"), __rowIndex: s.sort_order || 0 })),
      promos: (promos || []).map((p: any) => ({ ...p, branch: p.branch_id ? branchMap.get(p.branch_id) || "" : "", __rowIndex: p.sort_order || 0 })),
      slides: (slides || []).map((s: any) => ({ ...s, branch: s.branch_id ? branchMap.get(s.branch_id) || "" : "", __rowIndex: s.sort_order || 0 })),
      home_sections: (homeSections || []).map((h: any) => ({ ...h, branch: h.branch_id ? branchMap.get(h.branch_id) || "" : "", __rowIndex: h.sort_order || 0 })),
      rates: (rates || []).map((r: any) => ({ ...r, branch: r.branch_id ? branchMap.get(r.branch_id) || "" : "", __rowIndex: r.sort_order || 0 })),
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
      const branches = await supabaseRest("GET", "/branches", undefined, {
        select: "id",
        name: `eq.${branchName}`
      });
      branchId = branches?.[0]?.id || null;
    }

    const bookingRecord = {
      branch_id: branchId,
      branch_name: branchName,
      name: normalizeText(payload.name),
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

    await supabaseRest("POST", "/bookings", bookingRecord);
    return { message: "Booking created successfully", success: true };
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
      branches: (branches || []).map((b: any) => ({
        id: b.id,
        name: b.name,
        address: b.address || "",
        phone: b.phone || "",
        email: b.email || "",
        whatsapp_number: b.whatsapp_number || "",
        viber_number: b.viber_number || "",
        wechat_id: b.wechat_id || "",
        telegram_username: b.telegram_username || "",
        map_link: b.map_link || "",
        logo_url: b.logo_url || "",
        logo_file_id: extractDriveFileId(b.logo_url || b.logo_path || ""),
        active: toBooleanString(b.active)
      })),
      services: (services || []).map((s: any) => ({
        id: s.id,
        branch_id: s.branch_id || null,
        branch: s.branch_id ? branchMap.get(s.branch_id) || "" : "",
        name: s.name,
        description: s.description || "",
        duration: s.duration || "",
        female_rate: String(s.female_rate ?? ""),
        male_rate: String(s.male_rate ?? ""),
        category: s.category || "",
        active: toBooleanString(s.active)
      })),
      staff: (staff || []).map((s: any) => ({
        id: s.id,
        branch_id: s.branch_id || null,
        branch: branchMap.get(s.branch_id) || "",
        name: s.name,
        gender: s.gender || "Female",
        role: s.role || "",
        specialty: s.specialty || "",
        age: s.age ?? "",
        height: s.height || "",
        weight: s.weight || "",
        image_urls: (imageMap.get(s.id) || []).join("\n"),
        bio: s.bio || "",
        active: toBooleanString(s.active)
      })),
      promos: (promos || []).map((p: any) => ({
        id: p.id,
        branch_id: p.branch_id || null,
        branch: p.branch_id ? branchMap.get(p.branch_id) || "" : "",
        title: p.title,
        description: p.description || "",
        label: p.label || "",
        active: toBooleanString(p.active)
      })),
      slides: (slides || []).map((s: any) => ({
        id: s.id,
        branch_id: s.branch_id || null,
        branch: s.branch_id ? branchMap.get(s.branch_id) || "" : "",
        title: s.title || "",
        subtitle: s.subtitle || "",
        image_url: s.image_url || "",
        alt_text: s.alt_text || "",
        button_text: s.button_text || "",
        button_link: s.button_link || "",
        active: toBooleanString(s.active)
      })),
      home_sections: (homeSections || []).map((h: any) => ({
        id: h.id,
        branch_id: h.branch_id || null,
        branch: h.branch_id ? branchMap.get(h.branch_id) || "" : "",
        section_key: h.section_key,
        title: h.title,
        description: h.description || "",
        image_url: h.image_url || "",
        button_text: h.button_text || "",
        button_link: h.button_link || "",
        active: toBooleanString(h.active)
      })),
      rates: (rates || []).map((r: any) => ({
        id: r.id,
        branch_id: r.branch_id || null,
        branch: r.branch_id ? branchMap.get(r.branch_id) || "" : "",
        key: r.key,
        label: r.label,
        amount: String(r.amount ?? ""),
        category: r.category || "service",
        active: toBooleanString(r.active)
      })),
      settings: (settings || []).map((s: any) => ({
        id: s.id,
        key: s.key,
        value: s.value
      })),
      bookings: (bookings || []).map((b: any) => ({
        id: b.id,
        branch_id: b.branch_id || null,
        branch: b.branch_name || (b.branch_id ? branchMap.get(b.branch_id) || "" : ""),
        timestamp: b.created_at || b.timestamp || "",
        name: b.name || "",
        email: b.email || "",
        phone: b.phone || "",
        service: b.service || "",
        female_therapist_count: String(b.female_therapist_count ?? 0),
        male_therapist_count: String(b.male_therapist_count ?? 0),
        date: b.booking_date || "",
        time: b.booking_time || "",
        female_therapists: b.female_therapists || "",
        male_therapists: b.male_therapists || "",
        estimated_service_cost: String(b.estimated_service_cost ?? 0),
        taxi_fare: String(b.taxi_fare ?? 0),
        total_estimate: String(b.total_estimate ?? 0),
        agreement: b.agreement || "No",
        notes: b.notes || "",
        status: b.status || "New"
      }))
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
