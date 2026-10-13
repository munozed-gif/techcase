import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email, password, full_name, role } = req.body ?? {};
  if (!email || !password || !full_name || !role) {
    return res.status(400).json({ error: "email, password, full_name and role are required" });
  }

  if (!process.env.SUPABASE_URL && !process.env.VITE_SUPABASE_URL) {
    return res.status(500).json({ error: "Supabase URL not configured" });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "Service role key not configured" });
  }

  const admin = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Verify the caller is an admin or manager by checking the Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      const { data: { user } } = await admin.auth.getUser(token);
      const { data: profile } = await admin.from("users").select("role").eq("id", user?.id).single();
      if (!profile || !["admin", "manager"].includes(profile.role)) {
        return res.status(403).json({ error: "Only admins and managers can create users" });
      }
    } catch {
      return res.status(401).json({ error: "Invalid token" });
    }
  }

  // Create user with email_confirm: true — skips confirmation email entirely
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, role },
  });

  let userId;

  if (error) {
    // If the auth user already exists (e.g. from a failed previous attempt), recover by
    // upserting the profile rather than hard-failing.
    const msg = error.message ?? "";
    const isAlreadyExists =
      msg.toLowerCase().includes("already") ||
      msg.toLowerCase().includes("registered") ||
      msg.toLowerCase().includes("exists");

    if (isAlreadyExists) {
      const { data: existing } = await admin
        .from("users")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      if (existing?.id) {
        userId = existing.id;
        await admin
          .from("users")
          .update({ full_name, role, is_active: true })
          .eq("id", userId);
        return res.status(200).json({ id: userId, email, full_name, role, updated: true });
      }
    }

    return res.status(400).json({ error: error.message });
  }

  // Upsert into users table
  userId = data.user.id;
  await admin.from("users").upsert(
    { id: userId, email, full_name, role, is_active: true },
    { onConflict: "id" }
  );

  return res.status(200).json({ id: userId, email, full_name, role });
}
