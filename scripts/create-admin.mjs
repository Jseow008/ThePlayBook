import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../.env.local");

if (!fs.existsSync(envPath)) {
    console.error("Error: .env.local file not found");
    process.exit(1);
}

// Simple env file parser
const envContent = fs.readFileSync(envPath, "utf8");
const envVars = {};
envContent.split("\n").forEach((line) => {
    const [key, ...value] = line.split("=");
    if (key && value) {
        envVars[key.trim()] = value.join("=").trim();
    }
});

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = envVars.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Error: Missing Supabase credentials in .env.local");
    console.error("Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
    console.log("\nUsage: node scripts/create-admin.mjs <email> <password>");
    console.log("Example: node scripts/create-admin.mjs admin@example.com supersecret123\n");
    process.exit(1);
}

async function createAdmin() {
    console.log(`\nSetting up admin user: ${email}...`);

    // 1. Create or Get User
    // We use admin.createUser to auto-confirm email
    const { data: { user }, error: createError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
    });

    let userId;

    if (createError) {
        if (createError.message.includes("already registered")) {
            console.log("User already exists. Updating password...");
            // Fetch user ID
            const { data: { users } } = await supabase.auth.admin.listUsers();
            const existingUser = users.find(u => u.email === email);

            if (!existingUser) {
                console.error("Error: Could not find existing user ID.");
                process.exit(1);
            }

            userId = existingUser.id;

            // Update password
            const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
                password: password
            });

            if (updateError) {
                console.error("Error updating password:", updateError.message);
                process.exit(1);
            }
        } else {
            console.error("Error creating user:", createError.message);
            process.exit(1);
        }
    } else {
        userId = user.id;
        console.log("User created successfully.");
    }

    // 2. Set Admin Role in Profiles
    console.log("Promoting user to admin...");

    const { error: profileError } = await supabase
        .from("profiles")
        .upsert({
            id: userId,
            email: email,
            role: "admin",
            updated_at: new Date().toISOString()
        });

    if (profileError) {
        console.error("Error setting admin role:", profileError.message);
        process.exit(1);
    }

    console.log("\n✅ Success! Admin user ready.");
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
    console.log("\nYou can now log in at /admin-login");
}

createAdmin();
