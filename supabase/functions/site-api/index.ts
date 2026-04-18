import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decodeJwt } from "https://esm.sh/jose@4.14.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

const adminManagedTables = {
  branches: "branches",
  services: "services",
  staff: "staff",
  promos: "promos",
  slides: "slides",
  home_sections: "home_sections",
  rates: "rates",
  settings: "settings",
  bookings: "bookings"
} as const;

function toBooleanString(value: unknown) {
  return String(value ?? "TRUE").trim().toUpperCase() === "FALSE" ? "FALSE" : "TRUE";
}

function toDbBoolean(value: unknown) {
  return String(value ?? "TRUE").trim().toUpperCase() !== "FALSE";
}

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

function parseImageUrls(value: unknown) {
  return String(value ?? "")
    .split(/\r?\n|,|;/)
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .slice(0, 10);
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

  // Decode JWT to get user ID without verifying signature
  let userId: string;
  try {
    const payload = decodeJwt(token);
    userId = payload.sub as string;
    if (!userId) {
      throw new Error("Invalid token: no user ID");
    }
  } catch (error) {
    throw new Error("Invalid JWT token");
  }

  const adminClient = getAdminClient();
  const { data: profile, error: profileError } = await adminClient
    .from("admin_profiles")
    .select("user_id, is_active")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError || !profile || !profile.is_active) {
    throw new Error("Admin access denied.");
  }

  return { adminClient, user: { id: userId } };
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

  return {
    branches: (branches.data || []).map((row) => ({
      id: row.id,
      name: row.name,
      address: row.address || "",
      phone: row.phone || "",
      email: row.email || "",
      whatsapp_number: row.whatsapp_number || "",
      viber_number: row.viber_number || "",
      wechat_id: row.wechat_id || "",
      telegram_username: row.telegram_username || "",
      map_link: row.map_link || "",
      logo_url: row.logo_url || "",
      logo_file_id: extractDriveFileId(row.logo_url || row.logo_path || ""),
      active: toBooleanString(row.active)
    })),
    services: (services.data || []).map((row) => ({
      id: row.id,
      branch_id: row.branch_id || null,
      branch: row.branch_id ? branchById.get(row.branch_id) || "" : "",
      name: row.name,
      description: row.description || "",
      duration: row.duration || "",
      female_rate: String(row.female_rate ?? ""),
      male_rate: String(row.male_rate ?? ""),
      category: row.category || "",
      active: toBooleanString(row.active)
    })),
    staff: (staff.data || []).map((row) => ({
      id: row.id,
      branch_id: row.branch_id || null,
      branch: branchById.get(row.branch_id) || "",
      name: row.name,
      gender: row.gender || "Female",
      role: row.role || "",
      specialty: row.specialty || "",
      age: row.age ?? "",
      height: row.height || "",
      weight: row.weight || "",
      image_urls: (groupedImages.get(row.id) || []).join("\n"),
      bio: row.bio || "",
      active: toBooleanString(row.active)
    })),
    promos: (promos.data || []).map((row) => ({
      id: row.id,
      branch_id: row.branch_id || null,
      branch: row.branch_id ? branchById.get(row.branch_id) || "" : "",
      title: row.title,
      description: row.description || "",
      label: row.label || "",
      active: toBooleanString(row.active)
    })),
    slides: (slides.data || []).map((row) => ({
      id: row.id,
      branch_id: row.branch_id || null,
      branch: row.branch_id ? branchById.get(row.branch_id) || "" : "",
      title: row.title || "",
      subtitle: row.subtitle || "",
      image_url: row.image_url || "",
      alt_text: row.alt_text || "",
      button_text: row.button_text || "",
      button_link: row.button_link || "",
      active: toBooleanString(row.active)
    })),
    home_sections: (homeSections.data || []).map((row) => ({
      id: row.id,
      branch_id: row.branch_id || null,
      branch: row.branch_id ? branchById.get(row.branch_id) || "" : "",
      section_key: row.section_key,
      title: row.title,
      description: row.description || "",
      image_url: row.image_url || "",
      button_text: row.button_text || "",
      button_link: row.button_link || "",
      active: toBooleanString(row.active)
    })),
    rates: (rates.data || []).map((row) => ({
      id: row.id,
      branch_id: row.branch_id || null,
      branch: row.branch_id ? branchById.get(row.branch_id) || "" : "",
      key: row.key,
      label: row.label,
      amount: String(row.amount ?? ""),
      category: row.category || "service",
      active: toBooleanString(row.active)
    })),
    settings: (settings.data || []).map((row) => ({
      id: row.id,
      key: row.key,
      value: row.value
    })),
    bookings: (bookings.data || []).map((row) => ({
      id: row.id,
      branch_id: row.branch_id || null,
      branch: row.branch_name || (row.branch_id ? branchById.get(row.branch_id) || "" : ""),
      timestamp: row.timestamp || row.created_at || "",
      name: row.name || "",
      phone: row.phone || "",
      service: row.service || "",
      female_therapist_count: String(row.female_therapist_count ?? 0),
      male_therapist_count: String(row.male_therapist_count ?? 0),
      date: row.booking_date || "",
      time: row.booking_time || "",
      female_therapists: row.female_therapists || "",
      male_therapists: row.male_therapists || "",
      estimated_service_cost: String(row.estimated_service_cost ?? 0),
      taxi_fare: String(row.taxi_fare ?? 0),
      total_estimate: String(row.total_estimate ?? 0),
      agreement: row.agreement || "No",
      notes: row.notes || "",
      status: row.status || "New"
    })),
    admin_profiles: adminProfiles.data || []
  };
}

async function buildBranchMaps(adminClient: ReturnType<typeof getAdminClient>) {
  const { data, error } = await adminClient.from("branches").select("id, name, site_key, slug");
  if (error) throw error;
  const branchIdByName = new Map<string, string>();
  (data || []).forEach((row) => {
    const id = String(row.id || "").trim();
    const name = String(row.name || "").trim();
    const slug = String(row.slug || "").trim();
    if (name) branchIdByName.set(name, id);
    if (id) branchIdByName.set(id, id);
    if (slug) branchIdByName.set(slug, id);
  });
  return { branchIdByName };
}

async function replaceTableRows(adminClient: ReturnType<typeof getAdminClient>, tableName: string, rows: Record<string, unknown>[]) {
  const { error: deleteError } = await adminClient.from(tableName).delete().not("id", "is", null);
  if (deleteError) throw deleteError;
  if (!rows.length) return;
  const { error: insertError } = await adminClient.from(tableName).insert(rows);
  if (insertError) throw insertError;
}

async function upsertRows(adminClient: ReturnType<typeof getAdminClient>, tableName: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return [];

  const { data, error } = await adminClient.from(tableName).upsert(rows, {
    onConflict: ["id"],
    returning: "representation"
  });
  if (error) throw error;

  const ids = new Set<string>();
  rows.forEach((row) => {
    const id = String(row.id || "").trim();
    if (id) ids.add(id);
  });
  (data || []).forEach((row) => {
    const id = String((row as Record<string, unknown>).id || "").trim();
    if (id) ids.add(id);
  });

  return Array.from(ids);
}

async function deleteRowsNotIn(adminClient: ReturnType<typeof getAdminClient>, tableName: string, idsToKeep: string[]) {
  if (idsToKeep.length) {
    const values = idsToKeep.map((value) => String(value || "").trim()).filter(Boolean);
    if (values.length) {
      const valueList = values.join(",");
      const { error: deleteError } = await adminClient
        .from(tableName)
        .delete()
        .not("id", "in", `(${valueList})`);
      if (deleteError) throw deleteError;
      return;
    }
  }

  const { error: deleteError } = await adminClient.from(tableName).delete().not("id", "is", null);
  if (deleteError) throw deleteError;
}

async function saveBranches(adminClient: ReturnType<typeof getAdminClient>, rows: Record<string, unknown>[]) {
  const branchSiteKeyMap: Record<string, string> = {
    "sensual-massage-manila": "manila",
    "sensual-massage-elite": "elite",
    "sensual-massage-diamond": "diamond"
  };

  const { data: existingBranches, error: existingBranchesError } = await adminClient
    .from("branches")
    .select("id, name, slug, site_key");
  if (existingBranchesError) throw existingBranchesError;

  const existingBranchIdBySlug = new Map<string, string>();
  const existingBranchIdByName = new Map<string, string>();
  const existingBranchIdBySiteKey = new Map<string, string>();
  (existingBranches || []).forEach((row) => {
    const id = String(row.id || "").trim();
    if (!id) return;
    const name = String(row.name || "").trim();
    const slug = String(row.slug || "").trim();
    const siteKey = String(row.site_key || "").trim();
    if (slug) existingBranchIdBySlug.set(slug, id);
    if (name) existingBranchIdByName.set(name, id);
    if (siteKey) existingBranchIdBySiteKey.set(siteKey, id);
  });

  const mappedRows = rows.map((row, index) => {
    const name = normalizeText(row.name);
    const slug = normalizeSlug(row.slug || name);
    let siteKey = branchSiteKeyMap[slug];
    
    if (!siteKey) {
      const nameLower = name.toLowerCase();
      if (nameLower.includes("manila")) siteKey = "manila";
      else if (nameLower.includes("elite")) siteKey = "elite";
      else if (nameLower.includes("diamond")) siteKey = "diamond";
      else siteKey = "manila";
    }

    const explicitId = String(row.id || "").trim();
    const preservedId = explicitId || existingBranchIdBySiteKey.get(siteKey) || existingBranchIdBySlug.get(slug) || existingBranchIdByName.get(name);

    return {
      ...(preservedId ? { id: preservedId } : {}),
      site_key: siteKey,
      slug: slug || siteKey,
      name,
      address: normalizeText(row.address),
      phone: normalizeText(row.phone),
      email: normalizeText(row.email),
      whatsapp_number: normalizeText(row.whatsapp_number),
      viber_number: normalizeText(row.viber_number),
      wechat_id: normalizeText(row.wechat_id),
      telegram_username: normalizeText(row.telegram_username),
      map_link: normalizeText(row.map_link),
      logo_url: normalizeText(row.logo_url),
      logo_path: "",
      active: toDbBoolean(row.active),
      sort_order: index
    };
  }).filter((row) => row.name);

  const idsToKeep = await upsertRows(adminClient, "branches", mappedRows);
  await deleteRowsNotIn(adminClient, "branches", idsToKeep);
}

async function saveServices(adminClient: ReturnType<typeof getAdminClient>, rows: Record<string, unknown>[]) {
  const { branchIdByName } = await buildBranchMaps(adminClient);
  const mappedRows = rows.map((row, index) => ({
    branch_id: branchIdByName.get(normalizeText(row.branch)) || null,
    name: normalizeText(row.name),
    description: normalizeText(row.description),
    duration: normalizeText(row.duration),
    female_rate: parseNumberValue(row.female_rate),
    male_rate: parseNumberValue(row.male_rate),
    category: normalizeText(row.category),
    active: toDbBoolean(row.active),
    sort_order: index
  })).filter((row) => row.name);

  await replaceTableRows(adminClient, adminManagedTables.services, mappedRows);
}

async function saveStaff(adminClient: ReturnType<typeof getAdminClient>, rows: Record<string, unknown>[]) {
  const { branchIdByName } = await buildBranchMaps(adminClient);
  const staffRows = rows.map((row, index) => {
    const branchName = normalizeText(row.branch);
    const branchId = branchIdByName.get(branchName);
    if (!branchId) {
      throw new Error(`Invalid branch "${branchName}" for staff member "${normalizeText(row.name)}". Please select a valid branch.`);
    }
    return {
      branch_id: branchId,
      name: normalizeText(row.name),
      slug: normalizeSlug(row.slug || row.name || `staff-${index + 1}`),
      gender: normalizeText(row.gender) === "Male" ? "Male" : "Female",
      role: normalizeText(row.role),
      specialty: normalizeText(row.specialty),
      age: normalizeText(row.age) ? parseNumberValue(row.age) : null,
      height: normalizeText(row.height),
      weight: normalizeText(row.weight),
      bio: normalizeText(row.bio),
      active: toDbBoolean(row.active),
      sort_order: index,
      __imageUrls: parseImageUrls(row.image_urls)
    };
  }).filter((row) => row.name);

  const insertRows = staffRows.map(({ __imageUrls, ...row }) => row);
  await replaceTableRows(adminClient, adminManagedTables.staff, insertRows);

  const { data: insertedStaff, error: staffFetchError } = await adminClient
    .from("staff")
    .select("id, slug")
    .order("sort_order");
  if (staffFetchError) throw staffFetchError;

  const staffIdBySlug = new Map((insertedStaff || []).map((row) => [String(row.slug || ""), row.id]));
  const imageRows = staffRows.flatMap((row) =>
    row.__imageUrls.map((imageUrl, index) => ({
      staff_id: staffIdBySlug.get(row.slug) || null,
      image_url: imageUrl,
      storage_path: "",
      sort_order: index
    }))
  ).filter((row) => row.staff_id);

  await replaceTableRows(adminClient, "staff_images", imageRows);
}

async function savePromos(adminClient: ReturnType<typeof getAdminClient>, rows: Record<string, unknown>[]) {
  const { branchIdByName } = await buildBranchMaps(adminClient);
  const mappedRows = rows.map((row, index) => ({
    branch_id: branchIdByName.get(normalizeText(row.branch)) || null,
    title: normalizeText(row.title),
    description: normalizeText(row.description),
    label: normalizeText(row.label),
    active: toDbBoolean(row.active),
    sort_order: index
  })).filter((row) => row.title);

  await replaceTableRows(adminClient, adminManagedTables.promos, mappedRows);
}

async function saveSlides(adminClient: ReturnType<typeof getAdminClient>, rows: Record<string, unknown>[]) {
  const { branchIdByName } = await buildBranchMaps(adminClient);
  const mappedRows = rows.map((row, index) => ({
    branch_id: branchIdByName.get(normalizeText(row.branch)) || null,
    title: normalizeText(row.title),
    subtitle: normalizeText(row.subtitle),
    image_url: normalizeText(row.image_url),
    image_path: "",
    alt_text: normalizeText(row.alt_text),
    button_text: normalizeText(row.button_text),
    button_link: normalizeText(row.button_link),
    active: toDbBoolean(row.active),
    sort_order: index
  })).filter((row) => row.image_url);

  await replaceTableRows(adminClient, adminManagedTables.slides, mappedRows);
}

async function saveHomeSections(adminClient: ReturnType<typeof getAdminClient>, rows: Record<string, unknown>[]) {
  const { branchIdByName } = await buildBranchMaps(adminClient);
  const mappedRows = rows.map((row, index) => ({
    branch_id: branchIdByName.get(normalizeText(row.branch)) || null,
    section_key: normalizeText(row.section_key),
    title: normalizeText(row.title),
    description: normalizeText(row.description),
    image_url: normalizeText(row.image_url),
    image_path: "",
    button_text: normalizeText(row.button_text),
    button_link: normalizeText(row.button_link),
    active: toDbBoolean(row.active),
    sort_order: index
  })).filter((row) => row.section_key && row.title);

  await replaceTableRows(adminClient, adminManagedTables.home_sections, mappedRows);
}

async function saveRates(adminClient: ReturnType<typeof getAdminClient>, rows: Record<string, unknown>[]) {
  const { branchIdByName } = await buildBranchMaps(adminClient);
  const mappedRows = rows.map((row, index) => ({
    branch_id: branchIdByName.get(normalizeText(row.branch)) || null,
    key: normalizeText(row.key),
    label: normalizeText(row.label),
    amount: parseNumberValue(row.amount),
    category: normalizeText(row.category) === "taxi" ? "taxi" : "service",
    active: toDbBoolean(row.active),
    sort_order: index
  })).filter((row) => row.key && row.label);

  await replaceTableRows(adminClient, adminManagedTables.rates, mappedRows);
}

async function saveSettings(adminClient: ReturnType<typeof getAdminClient>, rows: Record<string, unknown>[]) {
  const mappedRows = rows.map((row) => ({
    branch_id: null,
    key: normalizeText(row.key),
    value: normalizeText(row.value)
  })).filter((row) => row.key);

  await replaceTableRows(adminClient, adminManagedTables.settings, mappedRows);
}

async function saveBookings(adminClient: ReturnType<typeof getAdminClient>, rows: Record<string, unknown>[]) {
  const { branchIdByName } = await buildBranchMaps(adminClient);
  const mappedRows = rows.map((row) => ({
    branch_id: branchIdByName.get(normalizeText(row.branch)) || null,
    branch_name: normalizeText(row.branch),
    timestamp: normalizeText(row.timestamp) || new Date().toISOString(),
    name: normalizeText(row.name),
    phone: normalizeText(row.phone),
    service: normalizeText(row.service),
    female_therapist_count: parseNumberValue(row.female_therapist_count),
    male_therapist_count: parseNumberValue(row.male_therapist_count),
    booking_date: normalizeText(row.date) || null,
    booking_time: normalizeText(row.time),
    female_therapists: normalizeText(row.female_therapists),
    male_therapists: normalizeText(row.male_therapists),
    estimated_service_cost: parseNumberValue(row.estimated_service_cost),
    taxi_fare: parseNumberValue(row.taxi_fare),
    total_estimate: parseNumberValue(row.total_estimate),
    agreement: normalizeText(row.agreement) || "No",
    notes: normalizeText(row.notes),
    status: normalizeText(row.status) || "New"
  })).filter((row) => row.name);

  await replaceTableRows(adminClient, adminManagedTables.bookings, mappedRows);
}

async function adminSaveSheet(request: Request, sheetName: string, rows: Record<string, unknown>[]) {
  const { adminClient } = await assertAdmin(request);

  if (!(sheetName in adminManagedTables)) {
    throw new Error("Saving that sheet is not allowed.");
  }

  const normalizedRows = Array.isArray(rows) ? rows : [];

  if (sheetName === "branches") {
    await saveBranches(adminClient, normalizedRows);
  } else if (sheetName === "services") {
    await saveServices(adminClient, normalizedRows);
  } else if (sheetName === "staff") {
    await saveStaff(adminClient, normalizedRows);
  } else if (sheetName === "promos") {
    await savePromos(adminClient, normalizedRows);
  } else if (sheetName === "slides") {
    await saveSlides(adminClient, normalizedRows);
  } else if (sheetName === "home_sections") {
    await saveHomeSections(adminClient, normalizedRows);
  } else if (sheetName === "rates") {
    await saveRates(adminClient, normalizedRows);
  } else if (sheetName === "settings") {
    await saveSettings(adminClient, normalizedRows);
  } else if (sheetName === "bookings") {
    await saveBookings(adminClient, normalizedRows);
  } else {
    throw new Error("Saving that sheet is not supported yet.");
  }

  return { sheetName, count: normalizedRows.length };
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
      const rows = Array.isArray(payload.rows) ? (payload.rows as Record<string, unknown>[]) : [];
      const data = await adminSaveSheet(request, String(payload.sheetName || ""), rows);
      return json({ success: true, data });
    }

    return json({ success: false, message: "Invalid action." }, 400);
  } catch (error) {
    let message = "Unexpected error.";
    if (error instanceof Error) {
      message = error.message;
    } else if (error && typeof error === "object") {
      const maybeMessage = (error as Record<string, unknown>).message;
      if (typeof maybeMessage === "string" && maybeMessage.trim()) {
        message = maybeMessage;
      } else {
        message = JSON.stringify(error, Object.keys(error).sort(), 2);
      }
    } else if (error != null) {
      message = String(error);
    }
    console.error("Edge Function Error:", message, error);
    return json({
      success: false,
      message: message
    }, 500);
  }
});
