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
});// ========== NO JWT - PURE REST API ==========
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

  try {
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
      console.error(`Supabase REST error [${method} ${path}]: Status ${response.status}, URL: ${url.toString()}`);
      console.error(`Response body: ${text}`);
      throw new Error(`Database error: ${response.status} ${response.statusText} - ${text.substring(0, 200)}`);
    }

    return text ? JSON.parse(text) : [];
  } catch (error) {
    console.error(`Supabase fetch failed for ${method} ${path}:`, error);
    throw error;
  }
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
    site_key: normalizeText(b.site_key),
    slug: normalizeText(b.slug),
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

async function adminSaveSheet(request: Request, payload: Record<string, unknown>) {
  await assertAdmin(request);

  const sheetName = normalizeText(payload.sheetName);
  const rows = payload.rows as any[];

  if (!sheetName || !Array.isArray(rows)) {
    throw new Error("Invalid payload for adminSaveSheet");
  }

  const table = sheetName;

  let count = 0;

  if (table === "staff") {
    for (const row of rows) {
      const staffData = {
        branch_id: row.branch_id || null,
        name: normalizeText(row.name),
        slug: normalizeText(row.name).toLowerCase().replace(/[^a-z0-9]/g, '-'),
        gender: normalizeText(row.gender) || "Female",
        role: normalizeText(row.role),
        specialty: normalizeText(row.specialty),
        age: row.age ? Number(row.age) : null,
        height: normalizeText(row.height),
        weight: normalizeText(row.weight),
        bio: normalizeText(row.bio),
        active: toDbBoolean(row.active),
        sort_order: Number(row.sort_order) || 0
      };

      if (row.id) {
        await supabaseRest("PATCH", `/staff?id=eq.${row.id}`, staffData);
      } else {
        const result = await supabaseRest("POST", "/staff", staffData);
        row.id = result[0].id;
      }

      const imageUrls = normalizeText(row.image_urls).split('\n').map((s: string) => s.trim()).filter((s: string) => s);

      await supabaseRest("DELETE", "/staff_images", undefined, { staff_id: `eq.${row.id}` });

      for (let i = 0; i < imageUrls.length; i++) {
        await supabaseRest("POST", "/staff_images", {
          staff_id: row.id,
          image_url: imageUrls[i],
          sort_order: i
        });
      }

      count++;
    }
  } else {
    for (const row of rows) {
      const data: any = { ...row };

      if ('active' in data) data.active = toDbBoolean(data.active);
      if ('branch_id' in data && !data.branch_id) data.branch_id = null;

      if (row.id) {
        await supabaseRest("PATCH", `/${table}?id=eq.${row.id}`, data);
      } else {
        const result = await supabaseRest("POST", `/${table}`, data);
        row.id = result[0].id;
      }

      count++;
    }
  }

  return { count };
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

      if (action === "adminSaveSheet") {
        const data = await adminSaveSheet(request, payload);
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
