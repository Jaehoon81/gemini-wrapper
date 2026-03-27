import { createClient } from "@supabase/supabase-js";
import { encrypt, hashForLookup } from "../lib/encryption-core";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}
if (!process.env.ENCRYPTION_KEY || !process.env.HASH_KEY) {
  console.error("ENCRYPTION_KEY, HASH_KEY 필요");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function migrate() {
  const {
    data: { users },
    error,
  } = await supabase.auth.admin.listUsers();
  if (error) throw error;

  console.log(`${users.length}명의 유저를 마이그레이션합니다.\n`);

  for (const user of users) {
    const email = user.email;
    const fullName = user.user_metadata?.full_name as string | undefined;

    // 이미 암호화된 데이터가 있는지 확인
    const { data: existing } = await supabase
      .from("profiles")
      .select("id, email")
      .eq("id", user.id)
      .single();

    if (existing?.email) {
      console.log(`  [SKIP] ${user.id} — 이미 암호화됨`);
      continue;
    }

    const updateData: Record<string, string> = {
      updated_at: new Date().toISOString(),
    };

    if (email) {
      updateData.email = encrypt(email);
      updateData.email_hash = hashForLookup(email.toLowerCase());
    }
    if (fullName) {
      updateData.full_name = encrypt(fullName);
      updateData.full_name_hash = hashForLookup(fullName.toLowerCase());
    }

    if (existing) {
      // profiles 행 존재 → UPDATE
      await supabase.from("profiles").update(updateData).eq("id", user.id);
    } else {
      // profiles 행 없음 → INSERT
      await supabase
        .from("profiles")
        .insert({ id: user.id, ...updateData });
    }

    console.log(`  [OK] ${user.id}`);
  }

  console.log("\n마이그레이션 완료!");
}

migrate().catch(console.error);
