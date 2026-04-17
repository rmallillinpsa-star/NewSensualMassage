import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const adminManagedTables = {
  branches: "branches",
  services: "services",
  staff: "staff",
  staff_images: "staff_images",
  promos: "promos",
  slides: "slides",
  home_sections: "home_sections",
  rates: "rates",
  settings: "settings",
  bookings: "bookings"
} as const;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

function getAdminClient() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function assertAdmin(request: Request) {
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    throw new Error("Missing bearer token.");
  }

  const adminClient = getAdminClient();
  const {
    data: { user },
    error
  } = await adminClient.auth.getUser(token);

  if (error || !user) {
    throw new Error("Invalid user session.");
  }

  const { data: profile, error: profileError } = await adminClient
    .from("admin_profiles")
    .select("user_id, is_active")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError || !profile || !profile.is_active) {
    throw new Error("Admin access denied.");
  }

  return { adminClient, user };
}

async function getSiteData() {
  const adminClient = getAdminClient();

  const [branches, services, staff, staffImages, promos, slides, homeSections, rates, settings] = await Promise.all([
    adminClient.from("branches").select("*").eq("active", true).order("sort_order").order("name"),
    adminClient.from("services").select("*").eq("active", true).order("sort_order").order("name"),
    adminClient.from("staff").select("*").eq("active", true).order("sort_order").order("name"),
    adminClient.from("staff_images").select("*").order("sort_order"),
    adminClient.from("promos").select("*").eq("active", true).order("sort_order").order("title"),
    adminClient.from("slides").select("*").eq("active", true).order("sort_order"),
    adminClient.from("home_sections").select("*").eq("active", true).order("sort_order"),
    adminClient.from("rates").select("*").eq("active", true).order("sort_order").order("label"),
    adminClient.from("settings").select("*")
  ]);

  const queryResults = [branches, services, staff, staffImages, promos, slides, homeSections, rates, settings];
  const failed = queryResults.find((result) => result.error);
  if (failed?.error) {
    throw failed.error;
  }

  const branchById = new Map((branches.data || []).map((row) => [row.id, row.name]));
  const groupedImages = new Map<string, string[]>();

  for (const image of staffImages.data || []) {
    const staffId = String(image.staff_id || "");
    if (!staffId) continue;
    const list = groupedImages.get(staffId) || [];
    if (image.image_url) {
      list.push(String(image.image_url));
    }
    groupedImages.set(staffId, list);
  }

  const settingsObject = Object.fromEntries(
    (settings.data || [])
      .filter((row) => !row.branch_id)
      .map((row) => [row.key, row.value])
  );

  return {
    branches: (branches.data || []).map((row) => ({
      ...row,
      __rowIndex: row.sort_order || 0
    })),
    services: (services.data || []).map((row) => ({
      ...row,
      branch: row.branch_id ? branchById.get(row.branch_id) || "" : "",
      __rowIndex: row.sort_order || 0
    })),
    staff: (staff.data || []).map((row) => ({
      ...row,
      branch: branchById.get(row.branch_id) || "",
      image_urls: (groupedImages.get(row.id) || []).join("\n"),
      __rowIndex: row.sort_order || 0
    })),
    promos: (promos.data || []).map((row) => ({
      ...row,
      branch: row.branch_id ? branchById.get(row.branch_id) || "" : "",
      __rowIndex: row.sort_order || 0
    })),
    slides: (slides.data || []).map((row) => ({
      ...row,
      branch: row.branch_id ? branchById.get(row.branch_id) || "" : "",
      __rowIndex: row.sort_order || 0
    })),
    home_sections: (homeSections.data || []).map((row) => ({
      ...row,
      branch: row.branch_id ? branchById.get(row.branch_id) || "" : "",
      __rowIndex: row.sort_order || 0
    })),
    rates: (rates.data || []).map((row) => ({
      ...row,
      branch: row.branch_id ? branchById.get(row.branch_id) || "" : "",
      __rowIndex: row.sort_order || 0
    })),
    settings: settingsObject
  };
}

async function createBooking(payload: Record<string, unknown>) {
  const adminClient = getAdminClient();
  const branchName = String(payload.branch || "").trim();

  let branchId: string | null = null;
  if (branchName) {
    const { data: branch } = await adminClient
      .from("branches")
      .select("id")
      .eq("name", branchName)
      .maybeSingle();
    branchId = branch?.id || null;
  }

  const { error } = await adminClient.from("bookings").insert({
    branch_id: branchId,
    branch_name: branchName,
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

  if (error) {
    throw error;
  }

  return { message: "Booking saved successfully." };
}

async function getAdminData(request: Request) {
  const { adminClient } = await assertAdmin(request);

  const [branches, services, staff, staffImages, promos, slides, homeSections, rates, settings, bookings, adminProfiles] = await Promise.all([
    adminClient.from("branches").select("*").order("sort_order").order("name"),
    adminClient.from("services").select("*").order("sort_order").order("name"),
    adminClient.from("staff").select("*").order("sort_order").order("name"),
    adminClient.from("staff_images").select("*").order("sort_order"),
    adminClient.from("promos").select("*").order("sort_order").order("title"),
    adminClient.from("slides").select("*").order("sort_order"),
    adminClient.from("home_sections").select("*").order("sort_order"),
    adminClient.from("rates").select("*").order("sort_order").order("label"),
    adminClient.from("settings").select("*").order("key"),
    adminClient.from("bookings").select("*").order("timestamp", { ascending: false }),
    adminClient.from("admin_profiles").select("user_id, email, display_name, is_active").order("email")
  ]);

  const queryResults = [branches, services, staff, staffImages, promos, slides, homeSections, rates, settings, bookings, adminProfiles];
  const failed = queryResults.find((result) => result.error);
  if (failed?.error) {
    throw failed.error;
  }

  return {
    branches: branches.data || [],
    services: services.data || [],
    staff: staff.data || [],
    staff_images: staffImages.data || [],
    promos: promos.data || [],
    slides: slides.data || [],
    home_sections: homeSections.data || [],
    rates: rates.data || [],
    settings: settings.data || [],
    bookings: bookings.data || [],
    admin_profiles: adminProfiles.data || []
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(request.url);

    if (request.method === "GET" && url.searchParams.get("action") === "siteData") {
      const data = await getSiteData();
      return json({ success: true, data });
    }

    const payload = await request.json();
    const action = String(payload.action || "").trim();

    if (action === "createBooking") {
      const data = await createBooking(payload);
      return json({ success: true, data });
    }

    if (action === "adminGetData") {
      const data = await getAdminData(request);
      return json({ success: true, data });
    }

    if (action === "adminSaveSheet") {
      return json({
        success: false,
        message: "adminSaveSheet scaffolding is intentionally not enabled yet. Implement table-specific upsert/delete rules before going live."
      }, 400);
    }

    return json({ success: false, message: "Invalid action." }, 400);
  } catch (error) {
    return json({
      success: false,
      message: error instanceof Error ? error.message : "Unexpected error."
    }, 500);
  }
});
