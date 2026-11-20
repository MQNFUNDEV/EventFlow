import { createClient, type User } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const allowedRoles = ["super_admin", "event_admin", "front_desk"];
const creatableRoles = ["event_admin", "front_desk"];

function meetsPasswordPolicy(password: string) {
  return password.length >= 14 && password.length <= 128 &&
    /[a-z]/.test(password) && /[A-Z]/.test(password) &&
    /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password) &&
    !/\s/.test(password);
}

function generateTemporaryPassword() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const randomPart = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `EF!aA1-${randomPart}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Missing Supabase server environment variables.");
      return json({ error: "Server configuration is incomplete." }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json({ error: "Authentication required." }, 401);

    const { data: authData, error: authError } = await admin.auth.getUser(token);
    const caller = authData.user;
    if (authError || !caller) return json({ error: "Your session is invalid or expired." }, 401);

    const body = await req.json();
    const action = body?.action;

    // Password recovery is restricted to the currently authenticated account.
    // Apply the same strong password policy server-side as the first-login flow.
    if (action === "complete-password-reset") {
      const newPassword = body?.newPassword;
      if (typeof newPassword !== "string" || !meetsPasswordPolicy(newPassword)) {
        return json({ error: "Use 14–128 characters with uppercase and lowercase letters, a number, and a symbol. Do not include spaces." }, 400);
      }

      const { error: updateError } = await admin.auth.admin.updateUserById(caller.id, {
        password: newPassword,
        app_metadata: {
          ...(caller.app_metadata ?? {}),
          must_change_password: false,
          temporary_password_expires_at: null,
        },
      });
      if (updateError) return json({ error: updateError.message }, 400);
      return json({ success: true, message: "Password updated. Sign in again with your new password." });
    }

    // First-login password change is available to the signed-in account itself.
    if (action === "complete-first-login") {
      if (caller.app_metadata?.must_change_password !== true) {
        return json({ error: "A first-login password change is not pending." }, 400);
      }

      const expiry = caller.app_metadata?.temporary_password_expires_at;
      if (typeof expiry !== "string" || Date.parse(expiry) <= Date.now()) {
        return json({ error: "This temporary password has expired. Ask a Super Admin to issue a new one." }, 403);
      }

      const newPassword = body?.newPassword;
      if (typeof newPassword !== "string" || !meetsPasswordPolicy(newPassword)) {
        return json({ error: "Use 14–128 characters with uppercase and lowercase letters, a number, and a symbol. Do not include spaces." }, 400);
      }

      const { error: updateError } = await admin.auth.admin.updateUserById(caller.id, {
        password: newPassword,
        app_metadata: {
          ...(caller.app_metadata ?? {}),
          must_change_password: false,
          temporary_password_expires_at: null,
        },
      });
      if (updateError) return json({ error: updateError.message }, 400);
      return json({ success: true, message: "Password updated. Sign in again with your new password." });
    }

    if (caller.app_metadata?.must_change_password === true) {
      return json({ error: "Change your temporary password before using administrator tools." }, 403);
    }

    // Account management is available to active Super Admins and Event Admins.
    const { data: callerRole, error: callerRoleError } = await admin
      .from("admin_roles")
      .select("role, is_active")
      .eq("user_id", caller.id)
      .maybeSingle();

    if (callerRoleError) {
      console.error("Unable to verify caller role:", callerRoleError.message);
      return json({ error: "Unable to verify administrator permissions." }, 500);
    }
    if (!callerRole || !callerRole.is_active || !["super_admin", "event_admin"].includes(callerRole.role)) {
      return json({ error: "Only an active Super Admin or Event Admin can manage administrator accounts." }, 403);
    }
    const isSuperAdmin = callerRole.role === "super_admin";

    if (action === "list-admins") {
      let roleQuery = admin
        .from("admin_roles")
        .select("user_id, role, is_active, created_at");
      if (!isSuperAdmin) roleQuery = roleQuery.in("role", ["event_admin", "front_desk"]);
      const { data: roleRows, error: rolesError } = await roleQuery;

      if (rolesError) return json({ error: "Unable to load administrator roles." }, 500);

      const userMap = new Map<string, User>();
      for (let page = 1; page <= 20; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) return json({ error: "Unable to load administrator account details." }, 500);
        for (const user of data.users) userMap.set(user.id, user);
        if (data.users.length < 1000) break;
      }

      const admins = (roleRows ?? []).map((row) => {
        const user = userMap.get(row.user_id);
        return {
          user_id: row.user_id,
          email: user?.email ?? "",
          phone_number: user?.app_metadata?.admin_phone_number ?? "",
          role: row.role,
          is_active: row.is_active,
          created_at: row.created_at,
          last_sign_in_at: user?.last_sign_in_at ?? null,
          must_change_password: user?.app_metadata?.must_change_password === true,
          temporary_password_expires_at: user?.app_metadata?.temporary_password_expires_at ?? null,
        };
      });

      return json({ admins });
    }

    if (action === "create-admin") {
      const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
      const phoneNumber = typeof body?.phoneNumber === "string" ? body.phoneNumber.trim() : "";
      const role = body?.role;

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Enter a valid email address." }, 400);
      if (phoneNumber.length < 7 || phoneNumber.length > 25) return json({ error: "Enter a valid phone number." }, 400);
      if (!creatableRoles.includes(role)) return json({ error: "You can create Event Admin or Front Desk accounts only." }, 400);

      const temporaryPassword = generateTemporaryPassword();
      const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: {},
        app_metadata: {
          admin_phone_number: phoneNumber,
          must_change_password: true,
          temporary_password_expires_at: expiresAt,
        },
      });

      if (createError || !created.user) {
        return json({ error: createError?.message ?? "Unable to create administrator account." }, 400);
      }

      const { error: roleInsertError } = await admin.from("admin_roles").insert({
        user_id: created.user.id,
        role,
        is_active: true,
        created_by: caller.id,
      });

      if (roleInsertError) {
        await admin.auth.admin.deleteUser(created.user.id);
        console.error("Role insert failed; rolled back Auth user:", roleInsertError.message);
        return json({ error: "The account could not be assigned a role. No account was retained." }, 500);
      }

      return json({
        success: true,
        admin: { user_id: created.user.id, email, phone_number: phoneNumber, role, is_active: true },
        temporary_password: temporaryPassword,
        expires_at: expiresAt,
        warning: "This temporary password is shown only in this response. Copy it now and share it privately.",
      });
    }


    if (action === "reset-temp-password") {
      const targetUserId = body?.userId;
      if (typeof targetUserId !== "string" || targetUserId === caller.id) {
        return json({ error: "Select another administrator account to reset." }, 400);
      }
      const { data: targetRole, error: targetRoleError } = await admin
        .from("admin_roles").select("role").eq("user_id", targetUserId).maybeSingle();
      if (targetRoleError || !targetRole) return json({ error: "Administrator account not found." }, 404);
      if (!isSuperAdmin && targetRole.role === "super_admin") {
        return json({ error: "Event Admins cannot manage Super Admin accounts." }, 403);
      }
      const { data: targetUser, error: getUserError } = await admin.auth.admin.getUserById(targetUserId);
      if (getUserError || !targetUser.user) return json({ error: "Administrator account not found." }, 404);

      const temporaryPassword = generateTemporaryPassword();
      const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
      const { error: resetError } = await admin.auth.admin.updateUserById(targetUserId, {
        password: temporaryPassword,
        app_metadata: {
          ...(targetUser.user.app_metadata ?? {}),
          must_change_password: true,
          temporary_password_expires_at: expiresAt,
        },
      });
      if (resetError) return json({ error: "Unable to reset this administrator's temporary password." }, 500);

      return json({
        success: true,
        email: targetUser.user.email ?? "",
        temporary_password: temporaryPassword,
        expires_at: expiresAt,
        warning: "This temporary password is shown only in this response. Copy it now and share it privately.",
      });
    }

    if (action === "update-admin") {
      const targetUserId = body?.userId;
      const nextRole = body?.role;
      const nextActive = body?.isActive;
      const nextPhone = body?.phoneNumber;

      if (typeof targetUserId !== "string") return json({ error: "A target administrator is required." }, 400);
      if (targetUserId === caller.id) return json({ error: "You cannot change your own administrator role or status." }, 400);
      if (nextRole !== undefined && !allowedRoles.includes(nextRole)) return json({ error: "Select a valid administrator role." }, 400);
      if (!isSuperAdmin && nextRole === "super_admin") return json({ error: "Only a Super Admin can assign the Super Admin role." }, 403);
      if (nextActive !== undefined && typeof nextActive !== "boolean") return json({ error: "Invalid account status." }, 400);
      if (nextPhone !== undefined && (typeof nextPhone !== "string" || nextPhone.trim().length < 7 || nextPhone.trim().length > 25)) {
        return json({ error: "Enter a valid phone number." }, 400);
      }

      const { data: target, error: targetError } = await admin
        .from("admin_roles")
        .select("user_id, role, is_active")
        .eq("user_id", targetUserId)
        .maybeSingle();
      if (targetError || !target) return json({ error: "Administrator account not found." }, 404);
      if (!isSuperAdmin && target.role === "super_admin") {
        return json({ error: "Event Admins cannot manage Super Admin accounts." }, 403);
      }

      const removingActiveSuperAdmin =
        target.role === "super_admin" && target.is_active &&
        ((nextRole !== undefined && nextRole !== "super_admin") || nextActive === false);

      if (removingActiveSuperAdmin) {
        const { count, error: countError } = await admin
          .from("admin_roles")
          .select("user_id", { count: "exact", head: true })
          .eq("role", "super_admin")
          .eq("is_active", true);
        if (countError) return json({ error: "Unable to verify Super Admin safeguards." }, 500);
        if ((count ?? 0) <= 1) return json({ error: "The last active Super Admin cannot be demoted or disabled." }, 400);
      }

      const roleUpdate: Record<string, unknown> = {};
      if (nextRole !== undefined) roleUpdate.role = nextRole;
      if (nextActive !== undefined) roleUpdate.is_active = nextActive;

      if (Object.keys(roleUpdate).length > 0) {
        const { error: updateError } = await admin
          .from("admin_roles")
          .update(roleUpdate)
          .eq("user_id", targetUserId);
        if (updateError) return json({ error: "Unable to update administrator role or status." }, 500);
      }

      if (nextPhone !== undefined) {
        const { data: targetUser, error: getUserError } = await admin.auth.admin.getUserById(targetUserId);
        if (getUserError || !targetUser.user) return json({ error: "Unable to load administrator contact details." }, 500);
        const { error: phoneUpdateError } = await admin.auth.admin.updateUserById(targetUserId, {
          app_metadata: { ...(targetUser.user.app_metadata ?? {}), admin_phone_number: nextPhone.trim() },
        });
        if (phoneUpdateError) return json({ error: "Unable to update administrator phone number." }, 500);
      }

      return json({ success: true });
    }

    return json({ error: "Unknown administrator management action." }, 400);
  } catch (error) {
    console.error("admin-management error:", error);
    return json({ error: "An unexpected server error occurred." }, 500);
  }
});
